package vad

import (
	"log"
	"sync"
	"time"

	"voicebot/config"
)

type Processor struct {
	config   *config.VADConfig
	sessions map[string]*VADSession
	mu       sync.RWMutex
}

type VADSession struct {
	UUID              string
	BotIsSpeaking     bool
	LastActivity      time.Time
	LastText          string
	LastProcessedText string
	OnSilenceTimeout  func()
	OnSpeechComplete  func(string)
}

func NewProcessor(cfg *config.VADConfig) *Processor {
	return &Processor{
		config:   cfg,
		sessions: make(map[string]*VADSession),
	}
}

func (p *Processor) StopVAD(uuid string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.sessions, uuid)
}

func (p *Processor) ProcessSilentTimeout(uuid string) {
	p.mu.Lock()
	defer p.mu.Unlock() // Chỉ sử dụng DUY NHẤT một defer này để quản lý Unlock

	s, ok := p.sessions[uuid]
	if !ok {
		return
	}

	// Nếu bot đang nói, liên tục làm mới LastActivity
	if s.BotIsSpeaking {
		s.LastActivity = time.Now()
		return
	}

	duration := time.Since(s.LastActivity)
	silenceLimit := time.Duration(p.config.SilenceTimeout) * time.Second
	speechThreshold := time.Duration(p.config.SpeechTimeout) * time.Millisecond

	// 1. Kiểm tra chốt câu (Auto-Final)
	if s.LastText != "" && s.LastText != s.LastProcessedText && duration >= speechThreshold {
		if s.OnSpeechComplete != nil {
			// Gọi callback trong goroutine riêng để không chiếm giữ Lock của Processor
			go s.OnSpeechComplete(s.LastText)
		}
		return
	}

	// 2. Kiểm tra Timeout im lặng (End call)
	// Tại đây BotIsSpeaking chắc chắn là false do check ở đầu hàm
	if duration >= silenceLimit {
		if s.OnSilenceTimeout != nil {
			log.Printf("[VAD] UUID %s im lặng quá %v. BotSpeaking: %v", uuid, silenceLimit, s.BotIsSpeaking)

			// Reset activity để tránh hàm này bị gọi lặp lại liên tục khi chưa kịp kill call
			s.LastActivity = time.Now()

			go s.OnSilenceTimeout()
		}
	}
}

func (p *Processor) StartVAD(uuid string, onTimeout func(), onSpeechComplete func(string)) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.sessions[uuid] = &VADSession{
		UUID:             uuid,
		LastActivity:     time.Now(),
		OnSilenceTimeout: onTimeout,
		OnSpeechComplete: onSpeechComplete,
	}
}

func (p *Processor) SetBotSpeaking(uuid string, speaking bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if s, ok := p.sessions[uuid]; ok {
		s.BotIsSpeaking = speaking
		if speaking {
			s.LastText = ""
			s.LastProcessedText = ""
		}
		s.LastActivity = time.Now()
		log.Printf("[VAD-INTERNAL] %s speaking set to %v, activity reset", uuid, speaking)
	}
}

func (p *Processor) UpdateActivity(uuid string, text string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if s, ok := p.sessions[uuid]; ok {
		if text == "" {
			return
		}

		// Nếu Bot đang nói mà có người nói đè (Barge-in)
		if s.BotIsSpeaking {
			s.LastText = text
			s.LastActivity = time.Now()
			return
		}

		// Nếu người dùng đang nói bình thường (Bot im lặng)
		if text != s.LastText {
			s.LastText = text
			s.LastActivity = time.Now()
		}
	}
}

func (p *Processor) UpdateCallbacks(uuid string, onTimeout func(), onSpeechComplete func(string)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if s, ok := p.sessions[uuid]; ok {
		s.OnSilenceTimeout = onTimeout
		s.OnSpeechComplete = onSpeechComplete
		log.Printf("[VAD] Callbacks updated for UUID: %s", uuid)
	}
}

func (p *Processor) HasSession(uuid string) bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	_, ok := p.sessions[uuid]
	return ok
}

func (p *Processor) IsBotSpeaking(uuid string) bool {
	p.mu.RLock() // Sử dụng RLock để tối ưu hiệu năng vì đây là thao tác đọc
	defer p.mu.RUnlock()
	if s, ok := p.sessions[uuid]; ok {
		return s.BotIsSpeaking
	}
	return false
}

func (p *Processor) FinalizeText(uuid string, text string) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	s, ok := p.sessions[uuid]
	if !ok {
		return "", false
	}

	// Nếu văn bản trống hoặc đã được xử lý rồi thì bỏ qua
	if text == "" || text == s.LastProcessedText {
		return "", false
	}

	// Đánh dấu đã xử lý
	s.LastProcessedText = text
	s.LastText = text
	return text, true
}
