package session

import (
	"sync"
	"time"

	relay "bridge/internal/relay"
)

type CallSession struct {
	UUID         string
	Phone        string
	Status       string
	CallID       string    // primary call ID (originate UUID) — used for recording filename
	PlaybackUUID string    // loopback-b UUID — use for uuid_broadcast so recording captures bot voice
	StartTime    time.Time
	LastActivity time.Time // last user speech or bot activity
	BotSpeaking    bool   // true while TTS is being played
	FillerPlaying  bool   // true while filler WAV is being played
	RelayConn    *relay.Client
	CleanupFunc  func(string) // callable cleanup, argument is reason string
	mu           sync.RWMutex
}

func (s *CallSession) UpdateStatus(status string) {
	s.mu.Lock()
	s.Status = status
	s.mu.Unlock()
}

// TouchActivity marks the current time as last user/bot activity.
func (s *CallSession) TouchActivity() {
	s.mu.Lock()
	s.LastActivity = time.Now()
	s.mu.Unlock()
}

func (s *CallSession) GetLastActivity() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.LastActivity
}

func (s *CallSession) SetBotSpeaking(v bool) {
	s.mu.Lock()
	s.BotSpeaking = v
	// Only reset LastActivity when bot STOPS speaking (v=false).
	// This gives the user a full silence timeout window to respond.
	// Do NOT reset when bot starts speaking — that would mask user inactivity.
	if !v {
		s.LastActivity = time.Now()
	}
	s.mu.Unlock()
}

func (s *CallSession) IsBotSpeaking() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.BotSpeaking
}

func (s *CallSession) GetStatus() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Status
}

type Manager struct {
	sessions map[string]*CallSession
	mu       sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{sessions: make(map[string]*CallSession)}
}

func (m *Manager) Create(uuid, phone string) *CallSession {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	s := &CallSession{
		UUID:         uuid,
		Phone:        phone,
		Status:       "active",
		StartTime:    now,
		LastActivity: now,
	}
	m.sessions[uuid] = s
	return s
}

func (m *Manager) Get(uuid string) *CallSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[uuid]
}

func (m *Manager) Delete(uuid string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, uuid)
}

// SendToRelay pushes a control message to the relay service via the session's write channel.
// Safe to call from any goroutine; no-op if the session has no relay connection.
func (s *CallSession) SendToRelay(msg relay.ControlMsg) {
	if s.RelayConn == nil {
		return
	}
	_ = s.RelayConn.SendControl(msg)
}
