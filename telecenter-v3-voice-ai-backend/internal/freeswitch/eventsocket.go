package freeswitch

import (
	"fmt"
	"log"
	"sync"
	"time"

	"voicebot/config"
	"voicebot/internal/session"

	"github.com/fiorix/go-eventsocket/eventsocket"
)

type EventSocket struct {
	conn     *eventsocket.Connection
	config   *config.FreeSWITCHConfig
	sessions *session.Manager
	handlers map[string]EventHandler
	mu       sync.Mutex
}

type EventHandler func(event *eventsocket.Event)

func NewEventSocket(cfg *config.FreeSWITCHConfig, sm *session.Manager) (*EventSocket, error) {
	es := &EventSocket{
		config:   cfg,
		sessions: sm,
		handlers: make(map[string]EventHandler),
	}

	go es.maintainConnection()

	return es, nil
}

func (es *EventSocket) maintainConnection() {
	for {
		// Kiểm tra xem có cần kết nối không
		es.mu.Lock()
		needsConnect := (es.conn == nil)
		es.mu.Unlock()

		if needsConnect {
			log.Printf("[ESL] Đang kết nối tới %s...", es.config.Host)
			conn, err := eventsocket.Dial(es.config.Host, es.config.Password)
			if err != nil {
				time.Sleep(5 * time.Second)
				continue
			}

			es.conn = conn

			if err := es.subscribe(); err != nil {
				conn.Close()
				continue
			}

			log.Printf("[ESL] ✓ Kết nối thành công!")

			// HÀM CHẶN: Luồng sẽ dừng ở đây cho đến khi FreeSWITCH sập
			es.HandleEvents()

			log.Printf("[ESL] Mất kết nối. Đang chuẩn bị reconnect...")
		}
		time.Sleep(1 * time.Second)
	}
}

func (es *EventSocket) subscribe() error {
	events := []string{
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
			log.Printf("Error reading event: %v", err)
			es.Close()
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

	log.Printf("Event received: %s [UUID: %s]", eventName, uuid)

	es.mu.Lock()
	handler, exists := es.handlers[eventName]
	es.mu.Unlock()

	if exists {
		go handler(ev)
	}
}

func (es *EventSocket) GetUUID(ev *eventsocket.Event) string {
	uuid := ev.Get("Unique-Id")
	return uuid
}

func (es *EventSocket) SendCommand(cmd string) (string, error) {
	es.mu.Lock()
	c := es.conn
	es.mu.Unlock()

	if c == nil {
		return "", fmt.Errorf("FreeSWITCH not connected")
	}

	log.Printf("Sending command: %s", cmd)

	ev, err := c.Send(cmd)
	if err != nil {
		return "", fmt.Errorf("command failed: %w", err)
	}

	if ev != nil {
		return ev.Body, nil
	}

	return "", nil
}

func (es *EventSocket) SendAPI(command string) (string, error) {
	es.mu.Lock()
	c := es.conn
	es.mu.Unlock()

	if c == nil {
		return "", fmt.Errorf("FreeSWITCH not connected")
	}

	log.Printf("Sending API: %s", command)

	ev, err := c.Send(fmt.Sprintf("api %s", command))
	if err != nil {
		return "", fmt.Errorf("API command failed: %w", err)
	}

	if ev != nil {
		return ev.Body, nil
	}

	return "", nil
}

func (es *EventSocket) SendBgAPI(command string) (string, error) {
	es.mu.Lock()
	c := es.conn
	es.mu.Unlock()

	if c == nil {
		return "", fmt.Errorf("FreeSWITCH not connected")
	}

	log.Printf("Sending bgapi: %s", command)

	ev, err := c.Send(fmt.Sprintf("bgapi %s", command))
	if err != nil {
		return "", fmt.Errorf("bgapi command failed: %w", err)
	}

	if ev != nil {
		jobUUID := ev.Get("Job-UUID")
		return jobUUID, nil
	}

	return "", nil
}

func (es *EventSocket) Close() error {
	if es.conn != nil {
		es.conn.Close()
		es.conn = nil
	}
	return nil
}
