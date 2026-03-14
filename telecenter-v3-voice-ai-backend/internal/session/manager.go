package session

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
	"voicebot/pkg/utils"
)

type Message struct {
	Role          string `json:"role"`
	Content       string `json:"content"`
	OriginContent string `json:"origin_content"`
	TurnID        int32
	Timestamp     time.Time `json:"timestamp"`
}

// CallBotInfo chứa thông tin campaign/context
type CallBotInfo struct {
	CallBotID     string                 `json:"call_bot_id"`
	CustomerInfo  map[string]interface{} `json:"customer_info"`
	BotPrompt     string                 `json:"bot_prompt"`
	BargeInPrompt string                 `json:"barge_in_prompt"`
	Welcome       string                 `json:"welcome"`
	Voice         string                 `json:"voice"`
	Tempo         float64                `json:"tempo"`
	SystemRules   []string               `json:"system_rules"`
	CampaignRules []string               `json:"campaign_rules"`
	CreatedAt     time.Time              `json:"created_at"`
}

type PlayedFragment struct {
	Text     string
	Duration float64
}

type CallSession struct {
	CallID        string // FreeSWITCH UUID (technical)
	CallBotID     string // Business ID (for tracking)
	Phone         string
	CallerID      string
	Status        string
	StartTime     time.Time
	AnswerTime    time.Time
	EndTime       time.Time
	StartPlayTime time.Time
	Fragments     []PlayedFragment
	History       []Message
	BotInfo       *CallBotInfo // Campaign/Customer info
	SilenceTimer  *time.Timer
	Metadata      map[string]interface{} // Additional metadata
	TurnID        int32
	mu            sync.RWMutex
}

type Manager struct {
	// Map CallID (UUID) -> Session
	sessionsByCallID map[string]*CallSession

	// Map CallBotID -> CallID for lookup
	callIDByBotID map[string]string

	// Map CallBotID -> CallBotInfo (pre-loaded campaign data)
	botInfoCache map[string]*CallBotInfo

	mu sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		sessionsByCallID: make(map[string]*CallSession),
		callIDByBotID:    make(map[string]string),
		botInfoCache:     make(map[string]*CallBotInfo),
	}
}

// RegisterBotInfo đăng ký thông tin campaign trước khi call
func (m *Manager) RegisterBotInfo(botInfo *CallBotInfo) {
	m.mu.Lock()
	defer m.mu.Unlock()

	botInfo.Welcome = utils.ReplaceTemplate(botInfo.Welcome, botInfo.CustomerInfo)

	botInfo.BotPrompt = utils.ReplaceTemplate(botInfo.BotPrompt, botInfo.CustomerInfo)

	loc, _ := time.LoadLocation("Asia/Ho_Chi_Minh")
	now := time.Now().In(loc)
	timeContext := fmt.Sprintf(
		"# NGỮ CẢNH THỜI GIAN (REALTIME):\n- Hôm nay là: %s, ngày %s. Bây giờ là %s.\n",
		utils.GetVietnameseWeekday(now),
		now.Format("02/01/2006"),
		now.Format("15:04"),
	)

	rulePrompt := "# QUY TẮC BẮT BUỘC"
	rulePrompt += "\n- " + strings.Join(botInfo.CampaignRules, "\n- ")
	rulePrompt += "\n- " + strings.Join(botInfo.SystemRules, "\n- ")

	botInfo.BotPrompt = fmt.Sprintf("%s\n%s\n%s", botInfo.BotPrompt, timeContext, rulePrompt)

	botInfo.CreatedAt = time.Now()
	log.Printf("welcome %s \n prompt %s", botInfo.Welcome, botInfo.BotPrompt)
	m.botInfoCache[botInfo.CallBotID] = botInfo
}

// GetBotInfo lấy thông tin campaign
func (m *Manager) GetBotInfo(callBotID string) *CallBotInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.botInfoCache[callBotID]
}

// ClearBotInfo xóa thông tin bot info khỏi cache
func (m *Manager) ClearBotInfo(callBotID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.botInfoCache, callBotID)
}

// Create tạo session mới với mapping
func (m *Manager) Create(callID, callBotID, phone, callerID string) *CallSession {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Lấy bot info nếu có
	botInfo := m.botInfoCache[callBotID]
	if botInfo == nil {
		// Tạo default bot info nếu chưa đăng ký
		botInfo = &CallBotInfo{
			CallBotID:    callBotID,
			BotPrompt:    "Bạn là trợ lý ảo thân thiện và chuyên nghiệp.",
			CustomerInfo: make(map[string]interface{}), // Tránh nil map
			Voice:        "thuyanh-north",
			Tempo:        1.0,
			CreatedAt:    time.Now(),
		}
		m.botInfoCache[callBotID] = botInfo
	}

	session := &CallSession{
		CallID:    callID,
		CallBotID: callBotID,
		Phone:     phone,
		CallerID:  callerID,
		Status:    "ringing",
		StartTime: botInfo.CreatedAt,
		History:   []Message{},
		BotInfo:   botInfo,
		Metadata:  make(map[string]interface{}),
	}

	m.sessionsByCallID[callID] = session
	m.callIDByBotID[callBotID] = callID
	return session
}

// Get lấy session bằng CallID (FreeSWITCH UUID)
func (m *Manager) Get(callID string) *CallSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessionsByCallID[callID]
}

func (s *CallSession) IsActive() bool {
	status := s.GetStatus()
	return status != "ending" && status != "ended" && status != "pending_hangup"
}

// Get lấy session bằng CallID (FreeSWITCH UUID)
func (m *Manager) GetHistoryById(callID string) []Message {
	m.mu.RLock()
	defer m.mu.RUnlock()
	session := m.sessionsByCallID[callID]
	if session == nil {
		return nil
	}
	return session.History
}

// GetByBotID lấy session bằng CallBotID
func (m *Manager) GetByBotID(callBotID string) *CallSession {
	m.mu.RLock()
	callID := m.callIDByBotID[callBotID]
	m.mu.RUnlock()

	if callID == "" {
		return nil
	}

	return m.Get(callID)
}

// GetCallID lấy FreeSWITCH UUID từ CallBotID
func (m *Manager) GetCallID(callBotID string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.callIDByBotID[callBotID]
}

// Delete xóa session (call both mappings)
func (m *Manager) Delete(callID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if session := m.sessionsByCallID[callID]; session != nil {
		delete(m.callIDByBotID, session.CallBotID)
	}
	delete(m.sessionsByCallID, callID)
}

// DeleteByBotID xóa session bằng CallBotID
func (m *Manager) DeleteByBotID(callBotID string) {
	callID := m.GetCallID(callBotID)
	if callID != "" {
		m.Delete(callID)
	}
}

func (cs *CallSession) AddMessage(role, content, originContent string) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	currentTurn := cs.TurnID

	if role == "assistant" {
		for i := len(cs.History) - 1; i >= 0; i-- {
			if cs.History[i].Role == "assistant" && cs.History[i].TurnID == currentTurn {
				log.Printf("[Session] Turn %d đã được chốt (Barge-in/Finish), không lưu đè.", currentTurn)
				return
			}
		}
	}
	cs.History = append(cs.History, Message{
		Role:          role,
		Content:       content,
		OriginContent: originContent,
		TurnID:        currentTurn,
		Timestamp:     time.Now(),
	})
}

func (cs *CallSession) GetHistory() []Message {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	history := make([]Message, len(cs.History))
	copy(history, cs.History)
	return history
}

func (cs *CallSession) ResetPlayFragment() {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.Fragments = []PlayedFragment{}
	cs.StartPlayTime = time.Time{}
}

func (cs *CallSession) SetStartPlayTime() {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	if cs.StartPlayTime.IsZero() {
		cs.StartPlayTime = time.Now()
	}
}

func (cs *CallSession) GetStartPlayTime() time.Time {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.StartPlayTime
}

func (cs *CallSession) AddFragment(text string, duration float64) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.Fragments = append(cs.Fragments, PlayedFragment{Text: text, Duration: duration})
}

func (cs *CallSession) UpdateStatus(status string) {
	cs.mu.Lock()
	cs.Status = status
	cs.mu.Unlock()
}

func (cs *CallSession) GetStatus() string {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.Status
}

func (cs *CallSession) SetMetadata(key string, value interface{}) {
	cs.mu.Lock()
	cs.Metadata[key] = value
	cs.mu.Unlock()
}

func (cs *CallSession) GetMetadata(key string) interface{} {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.Metadata[key]
}

func (s *CallSession) GetKafkaPayload() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return map[string]interface{}{
		"call_id":     s.CallID,
		"call_bot_id": s.CallBotID,
		"phone":       s.Phone,
		"caller_id":   s.CallerID,
		"status":      s.Status,
		"start_time":  s.StartTime.Format(time.RFC3339),
		"answer_time": s.AnswerTime.Format(time.RFC3339),
		"end_time":    s.EndTime.Format(time.RFC3339),
		"history":     s.History,
	}
}

func (cs *CallSession) IncrementTurn() int32 {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.TurnID++
	return cs.TurnID
}

// GetTurnID lấy giá trị phiên hiện tại
func (cs *CallSession) GetTurnID() int32 {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.TurnID
}
