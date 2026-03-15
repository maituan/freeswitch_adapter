package relay

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type ControlMsg struct {
	Type      string                 `json:"type"`
	Action    string                 `json:"action,omitempty"`
	Ext       string                 `json:"ext,omitempty"`
	Message   string                 `json:"message,omitempty"`
	Direction string                 `json:"direction,omitempty"`
	EventName string                 `json:"eventName,omitempty"`
	EventData map[string]interface{} `json:"eventData,omitempty"`
}

type ConnectParams struct {
	RelayURL   string
	CallID     string
	Scenario   string
	Phone      string
	VoiceID    string
	APIKey     string
	CustomData map[string]interface{}
}

type writeMsg struct {
	msgType int
	data    []byte
}

type Client struct {
	conn   *websocket.Conn
	sendCh chan writeMsg
	once   sync.Once
}

func Connect(params ConnectParams) (*Client, error) {
	u, err := url.Parse(params.RelayURL)
	if err != nil {
		return nil, fmt.Errorf("parse relay url: %w", err)
	}
	q := url.Values{}
	if params.CallID != "" {
		q.Set("callId", params.CallID)
	}
	q.Set("scenario", params.Scenario)
	q.Set("phone", params.Phone)
	if params.VoiceID != "" {
		q.Set("voiceId", params.VoiceID)
	}
	if params.APIKey != "" {
		q.Set("apiKey", params.APIKey)
	}
	if len(params.CustomData) > 0 {
		cd, _ := json.Marshal(params.CustomData)
		q.Set("customData", string(cd))
	}
	u.RawQuery = q.Encode()

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("dial relay %s: %w", u.String(), err)
	}

	// Read messages until {"type":"ready"}, skipping events emitted during session setup
	conn.SetReadDeadline(time.Now().Add(15 * time.Second))
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("waiting for ready: %w", err)
		}
		var m ControlMsg
		if jsonErr := json.Unmarshal(msg, &m); jsonErr != nil {
			continue
		}
		if m.Type == "error" {
			conn.Close()
			return nil, fmt.Errorf("relay error during handshake: %s", m.Message)
		}
		if m.Type == "ready" {
			break
		}
		log.Printf("[Relay] pre-ready message skipped type=%s", m.Type)
	}
	conn.SetReadDeadline(time.Time{})
	log.Printf("[Relay] Connected and ready url=%s", u.String())

	c := &Client{
		conn:   conn,
		sendCh: make(chan writeMsg, 32),
	}
	c.startWriteLoop()
	return c, nil
}

// startWriteLoop starts a dedicated goroutine that owns all WebSocket writes,
// ensuring only one writer at a time (gorilla/websocket requires this).
func (c *Client) startWriteLoop() {
	go func() {
		defer c.conn.Close()
		for msg := range c.sendCh {
			if err := c.conn.WriteMessage(msg.msgType, msg.data); err != nil {
				log.Printf("[Relay] write error: %v", err)
				return
			}
		}
		// Channel was closed cleanly — send hangup before connection closes.
		_ = c.conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"hangup"}`))
	}()
}

// send pushes a message onto the write channel. Returns an error if the client is closed.
func (c *Client) send(msgType int, data []byte) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("relay client closed")
		}
	}()
	c.sendCh <- writeMsg{msgType, data}
	return nil
}

// SendAudio sends raw PCM16 8kHz audio to the relay.
func (c *Client) SendAudio(pcm []byte) error {
	return c.send(websocket.BinaryMessage, pcm)
}

// SendControl sends a JSON control message to the relay.
func (c *Client) SendControl(msg ControlMsg) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return c.send(websocket.TextMessage, data)
}

// ReadLoop dispatches incoming relay messages to callbacks. Blocks until closed.
func (c *Client) ReadLoop(onAudio func([]byte), onControl func(ControlMsg)) {
	for {
		msgType, data, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("[Relay] ReadLoop closed: %v", err)
			return
		}
		if msgType == websocket.BinaryMessage {
			onAudio(data)
		} else if msgType == websocket.TextMessage {
			var msg ControlMsg
			if jsonErr := json.Unmarshal(data, &msg); jsonErr != nil {
				log.Printf("[Relay] unmarshal control: %v raw=%s", jsonErr, string(data))
				continue
			}
			onControl(msg)
		}
	}
}

// Close signals the write loop to flush remaining messages, send a hangup, and close the connection.
func (c *Client) Close() {
	c.once.Do(func() {
		close(c.sendCh)
	})
}
