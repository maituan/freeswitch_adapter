package freeswitch

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"bridge/config"

	"github.com/fiorix/go-eventsocket/eventsocket"
)

type EventHandler func(event *eventsocket.Event)

type EventSocket struct {
	conn       *eventsocket.Connection // event-only connection (HandleEvents loop)
	apiConn    *eventsocket.Connection // short API commands + bgapi originate
	config     *config.FreeSWITCHConfig
	handlers   map[string]EventHandler
	preProcess func(*eventsocket.Event)
	bgJobs     sync.Map // jobUUID → chan string (for bgapi result delivery)
	mu         sync.Mutex
	apiMu      sync.Mutex // serializes API commands on apiConn
}

// SetPreProcess registers a function that runs synchronously in the event loop
// before any handler goroutine is dispatched.
func (es *EventSocket) SetPreProcess(fn func(*eventsocket.Event)) {
	es.mu.Lock()
	es.preProcess = fn
	es.mu.Unlock()
}

func NewEventSocket(cfg *config.FreeSWITCHConfig) (*EventSocket, error) {
	es := &EventSocket{
		config:   cfg,
		handlers: make(map[string]EventHandler),
	}

	go es.maintainConnection()

	return es, nil
}

func (es *EventSocket) maintainConnection() {
	for {
		es.mu.Lock()
		needsConnect := (es.conn == nil)
		es.mu.Unlock()

		if needsConnect {
			log.Printf("[ESL] Connecting event channel to %s...", es.config.Host)
			conn, err := eventsocket.Dial(es.config.Host, es.config.Password)
			if err != nil {
				log.Printf("[ESL] Event connect failed: %v. Retrying in 5s...", err)
				time.Sleep(5 * time.Second)
				continue
			}

			log.Printf("[ESL] Connecting API channel to %s...", es.config.Host)
			apiConn, err := eventsocket.Dial(es.config.Host, es.config.Password)
			if err != nil {
				log.Printf("[ESL] API connect failed: %v. Retrying in 5s...", err)
				conn.Close()
				time.Sleep(5 * time.Second)
				continue
			}

			es.mu.Lock()
			es.conn = conn
			es.apiConn = apiConn
			es.mu.Unlock()

			if err := es.subscribe(); err != nil {
				log.Printf("[ESL] Subscribe failed: %v", err)
				conn.Close()
				apiConn.Close()
				es.mu.Lock()
				es.conn = nil
				es.apiConn = nil
				es.mu.Unlock()
				continue
			}

			log.Printf("[ESL] Both connections ready (event + API)")

			// Blocks until connection drops
			es.HandleEvents()

			log.Printf("[ESL] Connection lost. Reconnecting...")
			es.mu.Lock()
			es.conn = nil
			if es.apiConn != nil {
				es.apiConn.Close()
				es.apiConn = nil
			}
			es.mu.Unlock()
		}
		time.Sleep(1 * time.Second)
	}
}

func (es *EventSocket) subscribe() error {
	events := []string{
		"CHANNEL_CREATE",
		"CHANNEL_ANSWER",
		"CHANNEL_HANGUP",
		"CHANNEL_HANGUP_COMPLETE",
		"PLAYBACK_STOP",
		"BACKGROUND_JOB",
	}

	for _, event := range events {
		_, err := es.conn.Send(fmt.Sprintf("event plain %s", event))
		if err != nil {
			return fmt.Errorf("subscribe to %s: %w", event, err)
		}
	}

	return nil
}

func (es *EventSocket) RegisterHandler(eventName string, handler EventHandler) {
	es.mu.Lock()
	es.handlers[eventName] = handler
	es.mu.Unlock()
}

func (es *EventSocket) HandleEvents() {
	for {
		ev, err := es.conn.ReadEvent()
		if err != nil {
			log.Printf("[ESL] Read event error: %v", err)
			es.conn.Close()
			return
		}

		if ev == nil {
			continue
		}

		es.processEvent(ev)
	}
}

func (es *EventSocket) processEvent(ev *eventsocket.Event) {
	eventName := ev.Get("Event-Name")
	uuid := ev.Get("Unique-Id")

	// Handle BACKGROUND_JOB results — deliver to waiting goroutine
	if eventName == "BACKGROUND_JOB" {
		jobUUID := ev.Get("Job-UUID")
		body := ev.Body
		log.Printf("[ESL] BACKGROUND_JOB job=%s body=%q", jobUUID, body)
		if ch, ok := es.bgJobs.LoadAndDelete(jobUUID); ok {
			ch.(chan string) <- body
		} else {
			log.Printf("[ESL] BACKGROUND_JOB no waiting goroutine for job=%s", jobUUID)
		}
		return
	}

	// Log content-type for debugging unknown events
	ct := ev.Get("Content-Type")
	if ct == "command/reply" || eventName == "" {
		log.Printf("[ESL] non-event message: content-type=%s body=%q", ct, ev.Body)
	}

	log.Printf("[ESL] Event: %s [UUID: %s]", eventName, uuid)

	es.mu.Lock()
	pp := es.preProcess
	handler, exists := es.handlers[eventName]
	es.mu.Unlock()

	if pp != nil {
		pp(ev)
	}

	if exists {
		go handler(ev)
	}
}

// SendAPI sends a short API command on the dedicated API connection.
// Serialized via apiMu so commands don't interleave. Timeout 5s.
func (es *EventSocket) SendAPI(command string) (string, error) {
	es.mu.Lock()
	c := es.apiConn
	es.mu.Unlock()

	if c == nil {
		return "", fmt.Errorf("FreeSWITCH not connected")
	}

	es.apiMu.Lock()
	defer es.apiMu.Unlock()

	log.Printf("[ESL] api >> %s", command)

	type sendResult struct {
		ev  *eventsocket.Event
		err error
	}
	done := make(chan sendResult, 1)
	go func() {
		ev, err := c.Send(fmt.Sprintf("api %s", command))
		done <- sendResult{ev, err}
	}()

	select {
	case r := <-done:
		if r.err != nil {
			log.Printf("[ESL] api << ERROR: %v", r.err)
			return "", fmt.Errorf("api %s: %w", command, r.err)
		}
		var result string
		if r.ev != nil {
			result = r.ev.Body
		}
		log.Printf("[ESL] api << %s", result)
		return result, nil

	case <-time.After(5 * time.Second):
		log.Printf("[ESL] api << TIMEOUT (5s) command=%s — closing apiConn to recover", command)
		c.Close()
		es.mu.Lock()
		es.apiConn = nil
		es.mu.Unlock()
		go es.reconnectAPI()
		return "", fmt.Errorf("api timeout: %s", command)
	}
}

// reconnectAPI creates a new API connection in the background.
func (es *EventSocket) reconnectAPI() {
	log.Printf("[ESL] Reconnecting API channel to %s...", es.config.Host)
	conn, err := eventsocket.Dial(es.config.Host, es.config.Password)
	if err != nil {
		log.Printf("[ESL] API reconnect failed: %v", err)
		return
	}
	es.mu.Lock()
	if es.apiConn != nil {
		conn.Close()
	} else {
		es.apiConn = conn
		log.Printf("[ESL] API channel reconnected")
	}
	es.mu.Unlock()
}

// SendOriginate sends an originate command via bgapi (non-blocking).
// Returns the result body from FS. apiMu is held only ~1ms for the bgapi send.
// The actual wait (up to 60s) happens on a per-job channel, not holding any mutex.
func (es *EventSocket) SendOriginate(command string) (string, error) {
	// Send bgapi command — holds apiMu for ~1ms
	es.mu.Lock()
	c := es.apiConn
	es.mu.Unlock()

	if c == nil {
		return "", fmt.Errorf("FreeSWITCH not connected")
	}

	es.apiMu.Lock()
	log.Printf("[ESL] bgapi orig >> %s", command)
	ev, err := c.Send(fmt.Sprintf("bgapi %s", command))
	es.apiMu.Unlock()

	if err != nil {
		log.Printf("[ESL] bgapi orig << ERROR: %v", err)
		return "", fmt.Errorf("originate bgapi: %w", err)
	}

	var jobUUID string
	if ev != nil {
		jobUUID = ev.Get("Job-UUID")
		if jobUUID == "" {
			// Fallback: parse from Reply-Text "+OK Job-UUID: xxx"
			replyText := ev.Get("Reply-Text")
			log.Printf("[ESL] bgapi orig reply-text=%q body=%q", replyText, ev.Body)
			if idx := strings.Index(replyText, "Job-UUID: "); idx >= 0 {
				jobUUID = strings.TrimSpace(replyText[idx+len("Job-UUID: "):])
			}
		}
	}
	if jobUUID == "" {
		return "", fmt.Errorf("originate bgapi: no Job-UUID returned")
	}
	log.Printf("[ESL] bgapi orig << Job-UUID: %s", jobUUID)

	// Wait for BACKGROUND_JOB event with this jobUUID
	ch := make(chan string, 1)
	es.bgJobs.Store(jobUUID, ch)

	select {
	case result := <-ch:
		result = strings.TrimSpace(result)
		log.Printf("[ESL] bgapi orig result [%s]: %s", jobUUID, result)
		return result, nil

	case <-time.After(60 * time.Second):
		es.bgJobs.Delete(jobUUID)
		log.Printf("[ESL] bgapi orig TIMEOUT (60s) job=%s", jobUUID)
		return "", fmt.Errorf("originate timeout (60s)")
	}
}

func (es *EventSocket) SendBgAPI(command string) (string, error) {
	es.mu.Lock()
	c := es.apiConn
	es.mu.Unlock()

	if c == nil {
		return "", fmt.Errorf("FreeSWITCH not connected")
	}

	es.apiMu.Lock()
	defer es.apiMu.Unlock()

	log.Printf("[ESL] bgapi >> %s", command)
	ev, err := c.Send(fmt.Sprintf("bgapi %s", command))
	if err != nil {
		log.Printf("[ESL] bgapi << ERROR: %v", err)
		return "", fmt.Errorf("bgapi %s: %w", command, err)
	}

	var jobUUID string
	if ev != nil {
		jobUUID = ev.Get("Job-UUID")
	}
	log.Printf("[ESL] bgapi << Job-UUID: %s", jobUUID)
	return jobUUID, nil
}

func (es *EventSocket) Close() {
	es.mu.Lock()
	defer es.mu.Unlock()
	if es.conn != nil {
		es.conn.Close()
		es.conn = nil
	}
	if es.apiConn != nil {
		es.apiConn.Close()
		es.apiConn = nil
	}
}
