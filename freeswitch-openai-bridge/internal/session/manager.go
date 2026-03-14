package session

import (
	"sync"
	"time"

	relay "bridge/internal/relay"
)

type CallSession struct {
	UUID        string
	Phone       string
	Status      string
	StartTime   time.Time
	RelayConn   *relay.Client
	CleanupFunc func(string) // callable cleanup, argument is reason string
	mu          sync.RWMutex
}

func (s *CallSession) UpdateStatus(status string) {
	s.mu.Lock()
	s.Status = status
	s.mu.Unlock()
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
	s := &CallSession{
		UUID:      uuid,
		Phone:     phone,
		Status:    "active",
		StartTime: time.Now(),
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
