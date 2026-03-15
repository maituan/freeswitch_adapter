package campaign

import (
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type CallStatus string

const (
	StatusPending   CallStatus = "pending"
	StatusDialing   CallStatus = "dialing"
	StatusAnswered  CallStatus = "answered"
	StatusCompleted CallStatus = "completed"
	StatusFailed    CallStatus = "failed"
)

type Lead struct {
	Phone      string                 `json:"phone"`
	LeadID     string                 `json:"lead_id,omitempty"`
	Gender     string                 `json:"gender,omitempty"`
	Name       string                 `json:"name,omitempty"`
	Plate      string                 `json:"plate,omitempty"`
	CustomData map[string]interface{} `json:"custom_data,omitempty"`
	Status     CallStatus             `json:"status"`
	CallUUID   string                 `json:"call_uuid,omitempty"`
	Error      string                 `json:"error,omitempty"`
	StartedAt  *time.Time             `json:"started_at,omitempty"`
	EndedAt    *time.Time             `json:"ended_at,omitempty"`
}

type Campaign struct {
	ID        string     `json:"id"`
	Scenario  string     `json:"scenario"`
	CallerID  string     `json:"caller_id"`
	CCU       int        `json:"ccu"`
	Leads     []*Lead    `json:"leads"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	mu        sync.Mutex
}

type Stats struct {
	Total     int `json:"total"`
	Pending   int `json:"pending"`
	Dialing   int `json:"dialing"`
	Answered  int `json:"answered"`
	Completed int `json:"completed"`
	Failed    int `json:"failed"`
}

func (c *Campaign) GetStats() Stats {
	c.mu.Lock()
	defer c.mu.Unlock()
	var s Stats
	s.Total = len(c.Leads)
	for _, l := range c.Leads {
		switch l.Status {
		case StatusPending:
			s.Pending++
		case StatusDialing:
			s.Dialing++
		case StatusAnswered:
			s.Answered++
		case StatusCompleted:
			s.Completed++
		case StatusFailed:
			s.Failed++
		}
	}
	return s
}

func (c *Campaign) UpdateLeadStatus(callUUID string, status CallStatus) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, l := range c.Leads {
		if l.CallUUID == callUUID {
			l.Status = status
			if status == StatusCompleted || status == StatusFailed {
				now := time.Now()
				l.EndedAt = &now
			}
			return
		}
	}
}

type OriginateFunc func(phone, callerID, scenario string, customData map[string]interface{}) (callUUID string, err error)

// Manager stores campaigns in memory and runs workers.
type Manager struct {
	campaigns sync.Map // id -> *Campaign
	counter   atomic.Int64
}

func NewManager() *Manager {
	return &Manager{}
}

func (m *Manager) Get(id string) *Campaign {
	v, ok := m.campaigns.Load(id)
	if !ok {
		return nil
	}
	return v.(*Campaign)
}

func (m *Manager) List() []*Campaign {
	var out []*Campaign
	m.campaigns.Range(func(_, v interface{}) bool {
		out = append(out, v.(*Campaign))
		return true
	})
	return out
}

// ParseCSV reads a CSV with a header row. "phone" column is required.
// All other columns become lead fields or custom_data.
func ParseCSV(r io.Reader) ([]*Lead, error) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}

	phoneIdx := -1
	for i, h := range header {
		header[i] = strings.TrimSpace(strings.ToLower(h))
		if header[i] == "phone" {
			phoneIdx = i
		}
	}
	if phoneIdx < 0 {
		return nil, fmt.Errorf("CSV must have a 'phone' column")
	}

	knownFields := map[string]bool{
		"phone": true, "lead_id": true, "gender": true, "name": true, "plate": true,
	}

	var leads []*Lead
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read row: %w", err)
		}

		l := &Lead{Status: StatusPending, CustomData: make(map[string]interface{})}
		for i, val := range row {
			if i >= len(header) {
				break
			}
			val = strings.TrimSpace(val)
			if val == "" {
				continue
			}
			col := header[i]
			switch col {
			case "phone":
				l.Phone = val
			case "lead_id":
				l.LeadID = val
			case "gender":
				l.Gender = val
			case "name":
				l.Name = val
			case "plate":
				l.Plate = val
			default:
				if !knownFields[col] {
					l.CustomData[col] = val
				}
			}
		}
		if l.Phone != "" {
			leads = append(leads, l)
		}
	}
	return leads, nil
}

// Create creates a campaign and starts the worker pool in background.
func (m *Manager) Create(scenario, callerID string, ccu int, leads []*Lead, originate OriginateFunc) *Campaign {
	id := fmt.Sprintf("camp-%d", m.counter.Add(1))

	c := &Campaign{
		ID:        id,
		Scenario:  scenario,
		CallerID:  callerID,
		CCU:       ccu,
		Leads:     leads,
		Status:    "running",
		CreatedAt: time.Now(),
	}
	m.campaigns.Store(id, c)

	go m.runWorkers(c, originate)
	return c
}

func (m *Manager) runWorkers(c *Campaign, originate OriginateFunc) {
	sem := make(chan struct{}, c.CCU)
	var wg sync.WaitGroup

	for i, lead := range c.Leads {
		sem <- struct{}{}
		wg.Add(1)

		go func(idx int, l *Lead) {
			defer wg.Done()
			defer func() { <-sem }()

			c.mu.Lock()
			l.Status = StatusDialing
			now := time.Now()
			l.StartedAt = &now
			c.mu.Unlock()

			cd := l.CustomData
			if cd == nil {
				cd = make(map[string]interface{})
			}
			if l.LeadID != "" {
				cd["leadId"] = l.LeadID
			}
			if l.Gender != "" {
				cd["gender"] = l.Gender
			}
			if l.Name != "" {
				cd["name"] = l.Name
			}
			if l.Plate != "" {
				cd["plate"] = l.Plate
			}
			callUUID, err := originate(l.Phone, c.CallerID, c.Scenario, cd)
			c.mu.Lock()
			if err != nil {
				l.Status = StatusFailed
				l.Error = err.Error()
				endNow := time.Now()
				l.EndedAt = &endNow
				log.Printf("[Campaign] %s lead #%d phone=%s FAILED: %v", c.ID, idx, l.Phone, err)
			} else {
				l.CallUUID = callUUID
				l.Status = StatusDialing
				log.Printf("[Campaign] %s lead #%d phone=%s uuid=%s DIALING", c.ID, idx, l.Phone, callUUID)
			}
			c.mu.Unlock()

			// Rate limit: wait between calls to avoid burst
			time.Sleep(500 * time.Millisecond)
		}(i, lead)
	}

	wg.Wait()
	c.Status = "done"
	stats := c.GetStats()
	log.Printf("[Campaign] %s DONE total=%d completed=%d failed=%d", c.ID, stats.Total, stats.Completed, stats.Failed)
}
