package freeswitch

import (
	"fmt"
	"log"
	"sync"
	"time"

	"bridge/config"

	"github.com/fiorix/go-eventsocket/eventsocket"
)

type EventHandler func(event *eventsocket.Event)

type EventSocket struct {
	conn       *eventsocket.Connection // event-only connection (HandleEvents loop)
	apiConn    *eventsocket.Connection // short API commands (uuid_record, uuid_broadcast, etc.)
	origConn   *eventsocket.Connection // dedicated for originate (long-blocking)
	config     *config.FreeSWITCHConfig
	handlers   map[string]EventHandler
	preProcess func(*eventsocket.Event) // called synchronously before handler dispatch
	mu         sync.Mutex
	apiMu      sync.Mutex // serializes short API commands on apiConn
	origMu     sync.Mutex // serializes originate on origConn (never blocks apiMu)
}

// SetPreProcess registers a function that runs synchronously in the event loop
// before any handler goroutine is dispatched. Use this for time-critical tracking
// (e.g., recording loopback UUIDs before SIP leg handlers run).
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

			log.Printf("[ESL] Connecting originate channel to %s...", es.config.Host)
			origConn, err := eventsocket.Dial(es.config.Host, es.config.Password)
			if err != nil {
				log.Printf("[ESL] Originate connect failed: %v. Retrying in 5s...", err)
				conn.Close()
				apiConn.Close()
				time.Sleep(5 * time.Second)
				continue
			}

			es.mu.Lock()
			es.conn = conn
			es.apiConn = apiConn
			es.origConn = origConn
			es.mu.Unlock()

			if err := es.subscribe(); err != nil {
				log.Printf("[ESL] Subscribe failed: %v", err)
				conn.Close()
				apiConn.Close()
				origConn.Close()
				es.mu.Lock()
				es.conn = nil
				es.apiConn = nil
				es.origConn = nil
				es.mu.Unlock()
				continue
			}

			log.Printf("[ESL] All connections ready (event + API + originate)")

			// Blocks until connection drops
			es.HandleEvents()

			log.Printf("[ESL] Connection lost. Reconnecting...")
			es.mu.Lock()
			es.conn = nil
			if es.apiConn != nil {
				es.apiConn.Close()
				es.apiConn = nil
			}
			if es.origConn != nil {
				es.origConn.Close()
				es.origConn = nil
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
		// Trigger reconnect in background
		go es.reconnectAPI()
		return "", fmt.Errorf("api timeout: %s", command)
	}
}

// reconnectAPI creates a new API connection in the background.
// Called when SendAPI detects a timeout and closes the old connection.
func (es *EventSocket) reconnectAPI() {
	log.Printf("[ESL] Reconnecting API channel to %s...", es.config.Host)
	conn, err := eventsocket.Dial(es.config.Host, es.config.Password)
	if err != nil {
		log.Printf("[ESL] API reconnect failed: %v", err)
		return
	}
	es.mu.Lock()
	if es.apiConn != nil {
		// Another goroutine already reconnected
		conn.Close()
	} else {
		es.apiConn = conn
		log.Printf("[ESL] API channel reconnected")
	}
	es.mu.Unlock()
}

// reconnectOrig creates a new originate connection in the background.
func (es *EventSocket) reconnectOrig() {
	log.Printf("[ESL] Reconnecting originate channel to %s...", es.config.Host)
	conn, err := eventsocket.Dial(es.config.Host, es.config.Password)
	if err != nil {
		log.Printf("[ESL] Originate reconnect failed: %v", err)
		return
	}
	es.mu.Lock()
	if es.origConn != nil {
		conn.Close()
	} else {
		es.origConn = conn
		log.Printf("[ESL] Originate channel reconnected")
	}
	es.mu.Unlock()
}

// SendOriginate sends an originate command on its own dedicated connection.
// Uses origMu (not apiMu) so it never blocks short commands like uuid_broadcast.
// Timeout 30s (originate waits for callee to answer).
func (es *EventSocket) SendOriginate(command string) (string, error) {
	es.mu.Lock()
	c := es.origConn
	es.mu.Unlock()

	if c == nil {
		return "", fmt.Errorf("FreeSWITCH not connected")
	}

	es.origMu.Lock()
	defer es.origMu.Unlock()

	log.Printf("[ESL] orig >> %s", command)

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
			log.Printf("[ESL] orig << ERROR: %v", r.err)
			return "", fmt.Errorf("originate: %w", r.err)
		}
		var result string
		if r.ev != nil {
			result = r.ev.Body
		}
		log.Printf("[ESL] orig << %s", result)
		return result, nil

	case <-time.After(30 * time.Second):
		log.Printf("[ESL] orig << TIMEOUT (30s) — closing origConn to recover")
		c.Close()
		es.mu.Lock()
		es.origConn = nil
		es.mu.Unlock()
		go es.reconnectOrig()
		return "", fmt.Errorf("originate timeout")
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
	if es.origConn != nil {
		es.origConn.Close()
		es.origConn = nil
	}
}
