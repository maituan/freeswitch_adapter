package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"bridge/config"
	"bridge/internal/campaign"
	"bridge/internal/freeswitch"
	"bridge/internal/relay"
	"bridge/internal/session"
	"bridge/pkg/audio"

	eventsocket "github.com/fiorix/go-eventsocket/eventsocket"
)

//go:embed web/*
var webFS embed.FS

var (
	cfg              *config.Config
	sessions         *session.Manager
	esl              *freeswitch.EventSocket
	pendingCalls     sync.Map // uuid -> preCallData
	pendingByPhone   sync.Map // phone -> preCallData (fallback lookup for loopback calls)
	bridgeUUIDs      sync.Map // tracks all UUIDs belonging to bridge-originated calls
	loopbackBUUIDs   sync.Map // loopback-a UUID -> loopback-b UUID (recording file name)
	campaigns        *campaign.Manager
)

type preCallData struct {
	Scenario    string
	VoiceID     string
	Phone       string
	CallUUID    string // loopback-a UUID from originate
	CustomData  map[string]interface{}
	MediaParams *relay.MediaParams
	RelayReady  chan *relay.Client // buffered(1); closed on failure; nil = not pre-warmed
}

// prewarmRelay connects to the relay server in the background so it is ready
// by the time the called party answers. The channel receives exactly one value
// (the connected client) or is closed if the connection fails.
func prewarmRelay(callUUID, scenario, phone, voiceID string, customData map[string]interface{}, mediaParams *relay.MediaParams) chan *relay.Client {
	ch := make(chan *relay.Client, 1)
	go func() {
		log.Printf("[Relay] pre-warm start uuid=%s scenario=%s", callUUID, scenario)
		start := time.Now()
		rc, err := relay.Connect(relay.ConnectParams{
			RelayURL:    cfg.Relay.URL,
			CallID:      callUUID,
			Scenario:    scenario,
			Phone:       phone,
			VoiceID:     voiceID,
			APIKey:      cfg.Relay.APIKey,
			CustomData:  customData,
			MediaParams: mediaParams,
		})
		if err != nil {
			log.Printf("[Relay] pre-warm failed uuid=%s elapsed=%dms: %v", callUUID, time.Since(start).Milliseconds(), err)
			close(ch)
			return
		}
		log.Printf("[Relay] pre-warm done uuid=%s elapsed=%dms", callUUID, time.Since(start).Milliseconds())
		ch <- rc
	}()
	return ch
}

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)
	var err error
	cfg, err = config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	sessions = session.NewManager()
	campaigns = campaign.NewManager()

	esl, err = freeswitch.NewEventSocket(&cfg.FreeSWITCH)
	if err != nil {
		log.Fatalf("Failed to init ESL: %v", err)
	}

	// Synchronous pre-process: propagate bridgeUUIDs via Other-Leg chain.
	// Runs in the event loop BEFORE handler goroutines, ensuring the SIP leg
	// can be identified even when its ANSWER arrives before loopback ANSWER.
	esl.SetPreProcess(func(ev *eventsocket.Event) {
		uid := ev.Get("Unique-Id")
		ch := ev.Get("Channel-Name")
		otherLeg := ev.Get("Other-Leg-Unique-ID")

		// Track loopback channels by name
		if strings.HasPrefix(ch, "loopback/") {
			bridgeUUIDs.Store(uid, true)
		}

		// Chain propagation: if Other-Leg is a known bridge UUID, track this UUID too
		if otherLeg != "" {
			if _, ok := bridgeUUIDs.Load(otherLeg); ok {
				bridgeUUIDs.Store(uid, true)
			}
		}
	})

	esl.RegisterHandler("CHANNEL_ANSWER", handleAnswer)
	esl.RegisterHandler("CHANNEL_HANGUP", handleHangup)
	esl.RegisterHandler("PLAYBACK_STOP", handlePlaybackStop)

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	http.HandleFunc("/api/call", handleCallAPI)
	http.HandleFunc("/api/campaign", handleCampaignAPI)
	http.HandleFunc("/api/voices", handleVoicesAPI)

	webSub, _ := fs.Sub(webFS, "web")
	http.Handle("/", http.FileServer(http.FS(webSub)))

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("[Server] Listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func handleAnswer(ev *eventsocket.Event) {
	uuid := ev.Get("Unique-Id")
	channelName := ev.Get("Channel-Name")

	// Loopback legs: record UUID for chain tracking, then skip
	if strings.HasPrefix(channelName, "loopback/") {
		bridgeUUIDs.Store(uuid, true)
		// Track loopback-b UUID for recording file lookup
		if strings.HasSuffix(channelName, "-b") {
			otherLeg := ev.Get("Other-Leg-Unique-ID")
			if otherLeg != "" {
				loopbackBUUIDs.Store(otherLeg, uuid) // loopback-a → loopback-b
				log.Printf("[Call] ANSWER loopback-b uuid=%s other_leg(a)=%s", uuid, otherLeg)
			} else {
				log.Printf("[Call] ANSWER loopback-b uuid=%s (Other-Leg empty)", uuid)
			}
		}
		log.Printf("[Call] ANSWER loopback tracked uuid=%s channel=%s", uuid, channelName)
		return
	}

	phone := ev.Get("Caller-Destination-Number")
	if phone == "" {
		phone = ev.Get("Caller-Caller-ID-Number")
	}

	// Identify whether this SIP leg belongs to a bridge-originated call
	otherLeg := ev.Get("Other-Leg-Unique-ID")
	isBridgeCall := false
	matchMethod := ""

	if _, ok := bridgeUUIDs.Load(uuid); ok {
		isBridgeCall = true
		matchMethod = "uuid-direct"
	}
	if !isBridgeCall && otherLeg != "" {
		if _, ok := bridgeUUIDs.Load(otherLeg); ok {
			isBridgeCall = true
			matchMethod = "other-leg"
		}
	}
	if !isBridgeCall && ev.Get("variable_callbot_bridge") == "true" {
		isBridgeCall = true
		matchMethod = "channel-var"
	}
	if !isBridgeCall {
		if _, ok := pendingByPhone.Load(phoneKey(phone)); ok {
			isBridgeCall = true
			matchMethod = "phone"
		}
	}

	if !isBridgeCall {
		log.Printf("[Call] ANSWER skipping non-bridge call uuid=%s phone=%s otherLeg=%s channel=%s", uuid, phone, otherLeg, channelName)
		return
	}

	bridgeUUIDs.Store(uuid, true)
	log.Printf("[Call] ANSWER bridge call uuid=%s match=%s phone=%s channel=%s", uuid, matchMethod, phone, channelName)

	// Load pre-call data: try UUID, origination_uuid, Other-Leg, then phone fallback
	var pd preCallData
	if v, ok := pendingCalls.LoadAndDelete(uuid); ok {
		pd = v.(preCallData)
	} else if origUUID := ev.Get("variable_origination_uuid"); origUUID != "" {
		if v, ok := pendingCalls.LoadAndDelete(origUUID); ok {
			pd = v.(preCallData)
		}
	} else if otherLeg != "" {
		if v, ok := pendingCalls.LoadAndDelete(otherLeg); ok {
			pd = v.(preCallData)
		}
	}
	if pd.Scenario == "" {
		if v, ok := pendingByPhone.LoadAndDelete(phoneKey(phone)); ok {
			pd = v.(preCallData)
		}
	}
	scenario := pd.Scenario
	if scenario == "" {
		scenario = ev.Get("variable_callbot_scenario")
	}
	if scenario == "" {
		scenario = "leadgenTNDS"
	}

	log.Printf("[Call] ANSWER uuid=%s phone=%s scenario=%s customData=%v",
		uuid, phone, scenario, pd.CustomData)

	// Create session
	sess := sessions.Create(uuid, phone)

	// FIFO paths
	recordPath := fmt.Sprintf("%s/%s.raw", cfg.Audio.RecordPath, uuid)
	ttsPath := fmt.Sprintf("%s/%s.raw", cfg.Audio.TTSPath, uuid)

	if err := os.MkdirAll(cfg.Audio.RecordPath, 0755); err != nil {
		log.Printf("[Call] mkdir recordings: %v", err)
		return
	}
	if err := os.MkdirAll(cfg.Audio.TTSPath, 0755); err != nil {
		log.Printf("[Call] mkdir tts: %v", err)
		return
	}
	if err := makeFIFO(recordPath); err != nil {
		log.Printf("[Call] mkfifo recording: %v", err)
		return
	}
	if err := makeFIFO(ttsPath); err != nil {
		log.Printf("[Call] mkfifo tts: %v", err)
		return
	}

	// cleanupOnce ensures session cleanup runs exactly once,
	// whether triggered by CHANNEL_HANGUP, AudioIn EOF, or FIFO broken pipe.
	var cleanupOnce sync.Once
	doCleanup := func(reason string) {
		cleanupOnce.Do(func() {
			log.Printf("[Call] cleanup reason=%s uuid=%s", reason, uuid)
			sess.UpdateStatus("ended")
			if sess.RelayConn != nil {
				sess.RelayConn.Close()
			}
			esl.StopRecording(uuid, recordPath)
			os.Remove(recordPath)
			os.Remove(ttsPath)
			for _, c := range campaigns.List() {
				c.UpdateLeadStatus(uuid, campaign.StatusCompleted)
			}
			sessions.Delete(uuid)
		})
	}

	// Use pre-warmed relay if available; fall back to fresh connect if not.
	// Pre-warm starts in the background right after originate so it completes
	// during the ring phase (typically 2-20s), well before the partner answers.
	var relayClient *relay.Client
	if pd.RelayReady != nil {
		log.Printf("[Call] waiting for pre-warmed relay uuid=%s", uuid)
		select {
		case rc, ok := <-pd.RelayReady:
			if ok && rc != nil {
				relayClient = rc
				log.Printf("[Call] pre-warmed relay ready uuid=%s", uuid)
			} else {
				log.Printf("[Call] pre-warm relay failed, connecting fresh uuid=%s", uuid)
			}
		case <-time.After(10 * time.Second):
			log.Printf("[Call] pre-warm relay timeout, connecting fresh uuid=%s", uuid)
		}
	}
	if relayClient == nil {
		var err error
		relayClient, err = relay.Connect(relay.ConnectParams{
			RelayURL:    cfg.Relay.URL,
			CallID:      uuid,
			Scenario:    scenario,
			Phone:       phone,
			VoiceID:     pd.VoiceID,
			APIKey:      cfg.Relay.APIKey,
			CustomData:  pd.CustomData,
			MediaParams: pd.MediaParams,
		})
		if err != nil {
			log.Printf("[Call] relay connect failed: %v", err)
			esl.EndCall(uuid)
			return
		}
	}
	// Send the recording UUID (loopback-b) to the relay for Kafka.
	// FreeSWITCH records on loopback-b; try loopbackBUUIDs map first, then ESL API query.
	var recordingUUID string
	originateUUID := pd.CallUUID
	if originateUUID != "" {
		if v, ok := loopbackBUUIDs.LoadAndDelete(originateUUID); ok {
			recordingUUID = v.(string)
		}
		if recordingUUID == "" {
			// Fallback: query FreeSWITCH for loopback-b UUID via ESL API
			resp, err := esl.SendAPI(fmt.Sprintf("uuid_getvar %s other_loopback_leg_uuid", originateUUID))
			if err == nil {
				r := strings.TrimSpace(resp)
				if r != "" && !strings.HasPrefix(r, "-ERR") {
					recordingUUID = r
				}
			}
		}
	}
	log.Printf("[Call] sip_uuid=%s originate_uuid=%s recording_uuid=%s", uuid, originateUUID, recordingUUID)
	if recordingUUID != "" {
		// Use loopback-b for playback so that record_session on loopback-b captures bot voice.
		// Broadcasting on sofia causes loopback-b to hear hold music instead of TTS.
		sess.PlaybackUUID = recordingUUID
		if err := relayClient.SendControl(relay.ControlMsg{Type: "set_sip_uuid", Message: recordingUUID}); err != nil {
			log.Printf("[Call] relay set_sip_uuid failed: %v", err)
		}
	}
	// Signal the relay that the call was answered — triggers response.create
	if err := relayClient.SendControl(relay.ControlMsg{Type: "go"}); err != nil {
		log.Printf("[Call] relay go signal failed uuid=%s: %v", uuid, err)
	}
	sess.RelayConn = relayClient
	sess.CleanupFunc = doCleanup

	// Audio out: relay PCM16 → TTS FIFO → FreeSWITCH plays
	// nil slice in audioChan signals end-of-utterance (close FIFO so FreeSWITCH gets EOF)
	audioChan := make(chan []byte, 200)

	needResample := cfg.Relay.AudioSampleRate == 24000

	// FIFO writer goroutine: lazily opens/closes FIFO per utterance
	go func() {
		var f *os.File
		var fifoOpen bool
		var chunkIdx int

		openFIFO := func() error {
			if fifoOpen {
				return nil
			}
			log.Printf("[AudioOut] Starting new utterance uuid=%s", uuid)
			if err := esl.PlayAudio(uuid, ttsPath); err != nil {
				return fmt.Errorf("PlayAudio: %w", err)
			}
			var err error
			f, err = os.OpenFile(ttsPath, os.O_WRONLY, 0666)
			if err != nil {
				return fmt.Errorf("open fifo: %w", err)
			}
			fifoOpen = true
			chunkIdx = 0
			log.Printf("[AudioOut] FIFO connected uuid=%s", uuid)
			return nil
		}

		closeFIFO := func() {
			if f != nil {
				f.Close()
				f = nil
			}
			if fifoOpen {
				log.Printf("[AudioOut] FIFO closed (end of utterance) uuid=%s chunks=%d", uuid, chunkIdx)
			}
			fifoOpen = false
		}

		defer closeFIFO()

		for pcm := range audioChan {
			if pcm == nil {
				closeFIFO()
				// Nếu bot đã ra lệnh ENDCALL, chỉ cúp máy sau khi FIFO
				// đóng (tức FreeSWITCH đã đọc xong audio cuối), giống
				// logic pending_hangup của backend cũ. Thêm một khoảng
				// trễ nhỏ để đảm bảo jitter buffer/playback của
				// FreeSWITCH/PSTN đã xả hết audio.
				if sess.GetStatus() == "pending_hangup" {
					// Don't kill here — wait for PLAYBACK_STOP from FreeSWITCH
					// so the caller hears the full audio before the call ends.
					// handlePlaybackStop will call uuid_kill when playback is done.
					log.Printf("[AudioOut] FIFO closed with pending_hangup, waiting for PLAYBACK_STOP uuid=%s", uuid)
				}
				continue
			}

			if err := openFIFO(); err != nil {
				log.Printf("[AudioOut] %v uuid=%s", err, uuid)
				continue
			}

			chunkIdx++
			if _, err := f.Write(pcm); err != nil {
				if strings.Contains(err.Error(), "broken pipe") {
					log.Printf("[AudioOut] FIFO broken pipe uuid=%s", uuid)
					closeFIFO()
					doCleanup("fifo-broken-pipe")
					return
				}
				log.Printf("[AudioOut] write error uuid=%s: %v", uuid, err)
				closeFIFO()
				continue
			}
		}
	}()

	// Relay read loop: audio → audioChan, control → handle commands.
	// pendingFlush defers the FIFO close until after the trailing silence chunk
	// that the relay sends right after "tts_done".
	go func() {
		defer close(audioChan)
		var pendingFlush bool
		relayClient.ReadLoop(
			func(pcm []byte) {
				if sess.GetStatus() != "active" {
					return
				}
				if needResample {
					pcm = audio.Downsample24to8(pcm)
				}
				select {
				case audioChan <- pcm:
				default:
				}
				if pendingFlush {
					select {
					case audioChan <- nil:
					default:
					}
					pendingFlush = false
				}
			},
			func(msg relay.ControlMsg) {
				if sess.GetStatus() != "active" {
					return
				}
				switch msg.Type {
				case "event":
					if msg.EventName == "tts_start" {
						sess.SetBotSpeaking(true)
					}
					if msg.EventName == "tts_done" {
						log.Printf("[Relay] tts_done, will flush after trailing silence uuid=%s", uuid)
						pendingFlush = true
					}
					if msg.EventName == "send_message" {
						// User spoke — refresh activity
						sess.TouchActivity()
					}
				case "command":
					switch msg.Action {
					case "endcall":
						log.Printf("[Relay] endcall command (mark pending_hangup) uuid=%s", uuid)
						sess.UpdateStatus("pending_hangup")
					case "transfer":
						log.Printf("[Relay] transfer command (mark pending_hangup) uuid=%s ext=%s", uuid, msg.Ext)
						// TODO: implement actual SIP transfer using msg.Ext
						// For now, end the call after audio finishes (same as endcall).
						sess.UpdateStatus("pending_hangup")
					}
				}
			},
		)
		log.Printf("[Relay] ReadLoop ended uuid=%s", uuid)
	}()

	// Audio in: recording FIFO → relay (blocks until FreeSWITCH opens write end after StartRecording)
	go func() {
		log.Printf("[AudioIn] Opening recording FIFO uuid=%s path=%s", uuid, recordPath)
		f, err := os.OpenFile(recordPath, os.O_RDONLY, 0666)
		if err != nil {
			log.Printf("[AudioIn] open recording fifo: %v", err)
			return
		}
		defer f.Close()
		log.Printf("[AudioIn] Recording FIFO connected uuid=%s", uuid)

		buf := make([]byte, 320) // 20ms at 8kHz PCM16
		var audioChunks int64
		for {
			if sess.GetStatus() != "active" {
				return
			}
			n, err := f.Read(buf)
			if n > 0 {
				// Copy before send: buf is reused each iteration; channel may delay write.
				// Sending buf[:n] causes relay to receive overwritten/corrupted data.
				chunk := make([]byte, n)
				copy(chunk, buf[:n])
				if sendErr := relayClient.SendAudio(chunk); sendErr != nil {
					log.Printf("[AudioIn] send audio error uuid=%s: %v", uuid, sendErr)
					doCleanup("audioin-send-error")
					return
				}
				audioChunks++
				if audioChunks == 1 {
					log.Printf("[AudioIn] first audio chunk sent to relay uuid=%s", uuid)
				} else if audioChunks%500 == 0 {
					log.Printf("[AudioIn] audio chunks sent uuid=%s total=%d (~%ds)", uuid, audioChunks, audioChunks/50)
				}
			}
			if err != nil {
				if err != io.EOF {
					log.Printf("[AudioIn] read error uuid=%s: %v", uuid, err)
				}
				log.Printf("[AudioIn] FIFO EOF (hangup detected) uuid=%s", uuid)
				doCleanup("audioin-eof")
				return
			}
		}
	}()

	if err := esl.StartRecording(uuid, recordPath); err != nil {
		log.Printf("[Call] StartRecording: %v", err)
	}

	// Silence timeout: if no user/bot activity for SILENCE_TIMEOUT seconds,
	// force-end the call. Handles cases where user hangs up but SIP provider
	// doesn't send BYE (FreeSWITCH only detects via RTP timeout = 300s).
	silenceTimeout := 30 // seconds
	if v := os.Getenv("SILENCE_TIMEOUT"); v != "" {
		fmt.Sscanf(v, "%d", &silenceTimeout)
	}
	if silenceTimeout > 0 {
		go func() {
			ticker := time.NewTicker(2 * time.Second)
			defer ticker.Stop()
			for range ticker.C {
				st := sess.GetStatus()
				if st != "active" {
					return
				}
				if sess.IsBotSpeaking() {
					continue
				}
				elapsed := time.Since(sess.GetLastActivity())
				if elapsed >= time.Duration(silenceTimeout)*time.Second {
					log.Printf("[VAD] silence timeout (%ds) uuid=%s, ending call", silenceTimeout, uuid)
					esl.EndCall(uuid)
					return
				}
			}
		}()
	}
}

func handleHangup(ev *eventsocket.Event) {
	uuid := ev.Get("Unique-Id")
	channelName := ev.Get("Channel-Name")
	bridgeUUIDs.Delete(uuid)
	pendingByPhone.Delete(phoneKey(ev.Get("Caller-Destination-Number")))

	sess := sessions.Get(uuid)
	if sess == nil {
		return
	}

	log.Printf("[Call] HANGUP uuid=%s channel=%s", uuid, channelName)

	if sess.CleanupFunc != nil {
		sess.CleanupFunc("channel-hangup")
	}
}

func handlePlaybackStop(ev *eventsocket.Event) {
	uuid := ev.Get("Unique-Id")
	sess := sessions.Get(uuid)
	if sess == nil {
		return
	}
	log.Printf("[Call] PLAYBACK_STOP uuid=%s status=%s", uuid, sess.GetStatus())
	sess.SetBotSpeaking(false)
	sess.TouchActivity()
	// Notify relay so it can unmute ASR / trigger its own endcall cleanup.
	sess.SendToRelay(relay.ControlMsg{
		Type:      "event",
		EventName: "playback_stop",
	})
	// If the bot requested endcall, hang up now that FreeSWITCH has finished
	// playing the last TTS utterance. This replaces the old timer-based kill
	// in the FIFO writer which was too early (FIFO EOF ≠ playback complete).
	if sess.GetStatus() == "pending_hangup" {
		log.Printf("[Call] PLAYBACK_STOP with pending_hangup, ending call uuid=%s", uuid)
		esl.EndCall(uuid)
	}
}

type callRequest struct {
	Phone       string                 `json:"phone"`
	SIPEndpoint string                 `json:"sip_endpoint"`
	CallerID    string                 `json:"caller_id"`
	Scenario    string                 `json:"scenario"`
	BotID       string                 `json:"call_bot_id"`
	LeadID      string                 `json:"lead_id"`
	Gender      string                 `json:"gender"`
	Name        string                 `json:"name"`
	Plate       string                 `json:"plate"`
	VoiceID     string                 `json:"voice_id"`
	CustomData  map[string]interface{} `json:"custom_data"`
	MediaParams *relay.MediaParams     `json:"media_params"`
}

func handleVoicesAPI(w http.ResponseWriter, r *http.Request) {
	voicesURL := cfg.Relay.TTSVoicesURL
	if voicesURL == "" {
		voicesURL = "http://103.253.20.27:8767/voices"
	}
	resp, err := http.Get(voicesURL)
	if err != nil {
		jsonError(w, fmt.Sprintf("fetch voices: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func handleCallAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req callRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Phone == "" && req.SIPEndpoint == "" {
		jsonError(w, "phone or sip_endpoint is required", http.StatusBadRequest)
		return
	}

	target := req.Phone
	if req.SIPEndpoint != "" {
		target = req.SIPEndpoint
	}

	callerID := req.CallerID
	if callerID == "" {
		callerID = "callbot"
	}
	scenario := req.Scenario
	if scenario == "" {
		scenario = "leadgenTNDS"
	}
	botID := req.BotID
	if botID == "" {
		botID = fmt.Sprintf("bot-%d", time.Now().UnixNano())
	}

	callUUID, err := esl.Originate(target, callerID, botID, scenario)
	if err != nil {
		log.Printf("[API] Originate failed target=%s: %v", target, err)
		jsonError(w, fmt.Sprintf("originate failed: %v", err), http.StatusInternalServerError)
		return
	}

	cd := req.CustomData
	if cd == nil {
		cd = make(map[string]interface{})
	}
	if req.LeadID != "" {
		cd["leadId"] = req.LeadID
	}
	if req.Gender != "" {
		cd["gender"] = req.Gender
	}
	if req.Name != "" {
		cd["name"] = req.Name
	}
	if req.Plate != "" {
		cd["plate"] = req.Plate
	}
	phone := req.Phone
	if phone == "" {
		phone = req.SIPEndpoint
	}
	pd := preCallData{
		Scenario:    scenario,
		VoiceID:     req.VoiceID,
		Phone:       phone,
		CallUUID:    callUUID,
		CustomData:  cd,
		MediaParams: req.MediaParams,
		RelayReady:  prewarmRelay(callUUID, scenario, phone, req.VoiceID, cd, req.MediaParams),
	}
	bridgeUUIDs.Store(callUUID, true)
	pendingCalls.Store(callUUID, pd)
	pendingByPhone.Store(phoneKey(phone), pd)

	log.Printf("[API] Outbound call uuid=%s target=%s scenario=%s (relay pre-warming)", callUUID, target, scenario)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "dialing",
		"uuid":   callUUID,
	})
}

// originateCall is used by both single-call API and campaign workers.
func originateCall(phone, callerID, scenario string, customData map[string]interface{}) (string, error) {
	target := phone
	if callerID == "" {
		callerID = "callbot"
	}
	botID := fmt.Sprintf("bot-%d", time.Now().UnixNano())

	callUUID, err := esl.Originate(target, callerID, botID, scenario)
	if err != nil {
		return "", err
	}

	pd := preCallData{
		Scenario:   scenario,
		Phone:      phone,
		CallUUID:   callUUID,
		CustomData: customData,
		RelayReady: prewarmRelay(callUUID, scenario, phone, "", customData, nil),
	}
	bridgeUUIDs.Store(callUUID, true)
	pendingCalls.Store(callUUID, pd)
	pendingByPhone.Store(phoneKey(phone), pd)
	return callUUID, nil
}

// handleCampaignAPI handles POST (create) and GET (status) for campaigns.
func handleCampaignAPI(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		handleCampaignCreate(w, r)
	case http.MethodGet:
		handleCampaignStatus(w, r)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleCampaignCreate(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		jsonError(w, "invalid multipart form", http.StatusBadRequest)
		return
	}

	scenario := r.FormValue("scenario")
	if scenario == "" {
		scenario = "leadgenTNDS"
	}
	callerID := r.FormValue("caller_id")
	if callerID == "" {
		callerID = "callbot"
	}
	ccu := 1
	if v := r.FormValue("ccu"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			ccu = n
		}
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file field is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	leads, err := campaign.ParseCSV(file)
	if err != nil {
		jsonError(w, fmt.Sprintf("parse csv: %v", err), http.StatusBadRequest)
		return
	}
	if len(leads) == 0 {
		jsonError(w, "csv has no valid rows", http.StatusBadRequest)
		return
	}

	camp := campaigns.Create(scenario, callerID, ccu, leads, originateCall)

	log.Printf("[Campaign] Created id=%s scenario=%s ccu=%d leads=%d", camp.ID, scenario, ccu, len(leads))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "created",
		"campaign_id": camp.ID,
		"total_leads": len(leads),
		"ccu":         ccu,
	})
}

func handleCampaignStatus(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")

	if id == "" {
		allCamps := campaigns.List()
		result := make([]map[string]interface{}, 0, len(allCamps))
		for _, c := range allCamps {
			stats := c.GetStats()
			result = append(result, map[string]interface{}{
				"id":         c.ID,
				"scenario":   c.Scenario,
				"status":     c.Status,
				"ccu":        c.CCU,
				"stats":      stats,
				"created_at": c.CreatedAt,
			})
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
		return
	}

	camp := campaigns.Get(id)
	if camp == nil {
		jsonError(w, "campaign not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         camp.ID,
		"scenario":   camp.Scenario,
		"caller_id":  camp.CallerID,
		"status":     camp.Status,
		"ccu":        camp.CCU,
		"stats":      camp.GetStats(),
		"leads":      camp.Leads,
		"created_at": camp.CreatedAt,
	})
}

func makeFIFO(path string) error {
	os.Remove(path)
	if err := syscall.Mkfifo(path, 0666); err != nil {
		return fmt.Errorf("mkfifo %s: %w", path, err)
	}
	os.Chmod(path, 0666)
	return nil
}

// phoneKey extracts the last 9 digits from a phone number for matching.
// Handles cases where dialplan transforms the number (e.g. 33170971512423 → 0971512423).
func phoneKey(phone string) string {
	var digits []byte
	for i := 0; i < len(phone); i++ {
		if phone[i] >= '0' && phone[i] <= '9' {
			digits = append(digits, phone[i])
		}
	}
	if len(digits) > 9 {
		return string(digits[len(digits)-9:])
	}
	return string(digits)
}
