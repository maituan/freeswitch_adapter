package api

import (
	"encoding/json"
	"log"
	"net/http"

	"voicebot/internal/freeswitch"
	"voicebot/internal/session"
)

type CallRequest struct {
	CallBotID     string                 `json:"call_bot_id"` // Business ID (required)
	Phone         string                 `json:"phone"`       // Phone number (required)
	CallerID      string                 `json:"caller_id"`   // Caller ID
	BotPrompt     string                 `json:"bot_prompt"`  // Custom bot prompt
	BargeInPrompt string                 `json:"barge_in_prompt"`
	Welcome       string                 `json:"welcome"`       // welcome
	Voice         string                 `json:"voice"`         // voice
	Tempo         float64                `json:"tempo"`         // voice
	CustomerInfo  map[string]interface{} `json:"customer_info"` // Customer data
	SystemRules   []string               `json:"system_rules"`
	CampaignRules []string               `json:"campaign_rules"`
}

type CallResponse struct {
	CallBotID string `json:"call_bot_id"` // Business ID
	CallID    string `json:"call_id"`     // FreeSWITCH UUID (optional)
	Status    string `json:"status"`
	Message   string `json:"message"`
}

type Handler struct {
	sessions   *session.Manager
	freeswitch *freeswitch.EventSocket
}

func NewHandler(sm *session.Manager, fs *freeswitch.EventSocket) *Handler {
	return &Handler{
		sessions:   sm,
		freeswitch: fs,
	}
}

func (h *Handler) MakeCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CallRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.CallBotID == "" {
		http.Error(w, "call_bot_id is required", http.StatusBadRequest)
		return
	}

	if req.Phone == "" {
		http.Error(w, "phone is required", http.StatusBadRequest)
		return
	}

	// Check if CallBotID already exists
	if existingSession := h.sessions.GetByBotID(req.CallBotID); existingSession != nil {
		respondJSON(w, http.StatusConflict, CallResponse{
			CallBotID: req.CallBotID,
			CallID:    existingSession.CallID,
			Status:    "error",
			Message:   "call_bot_id already in use",
		})
		return
	}

	// Set defaults
	if req.BotPrompt == "" {
		req.BotPrompt = "Bạn là trợ lý ảo thân thiện và chuyên nghiệp."
	}

	if req.BargeInPrompt == "" {
		req.BargeInPrompt = "Bạn là bộ phân loại ý định ngắt lời cho Bot. Phân tích câu nói của khách hàng và trả về '0' hoặc '1'."
	}

	if req.CustomerInfo == nil {
		req.CustomerInfo = make(map[string]interface{})
	}

	// Register bot info trước khi originate
	botInfo := &session.CallBotInfo{
		CallBotID:     req.CallBotID,
		CustomerInfo:  req.CustomerInfo,
		BotPrompt:     req.BotPrompt,
		BargeInPrompt: req.BargeInPrompt,
		Welcome:       req.Welcome,
		Voice:         req.Voice,
		Tempo:         req.Tempo,
		SystemRules:   req.SystemRules,
		CampaignRules: req.CampaignRules,
	}
	h.sessions.RegisterBotInfo(botInfo)

	// Originate call với CallBotID trong channel variables
	callID, err := h.freeswitch.Originate(req.Phone, req.CallerID, req.CallBotID)
	log.Printf("callID: %s", callID)
	h.freeswitch.SetVariable(callID, "call_bot_id", req.CallBotID)
	if err != nil {
		log.Printf("Failed to originate call: %v", err)
		respondJSON(w, http.StatusInternalServerError, CallResponse{
			CallBotID: req.CallBotID,
			Status:    "error",
			Message:   err.Error(),
		})
		return
	}

	// Create session với mapping
	h.sessions.Create(callID, req.CallBotID, req.Phone, req.CallerID)

	log.Printf("Call initiated: CallBotID=%s, CallID=%s, Phone=%s",
		req.CallBotID, callID, req.Phone)

	respondJSON(w, http.StatusOK, CallResponse{
		CallBotID: req.CallBotID,
		CallID:    callID,
		Status:    "success",
		Message:   "Call initiated successfully",
	})
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
