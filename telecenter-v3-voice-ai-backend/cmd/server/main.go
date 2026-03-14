package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"voicebot/config"
	"voicebot/internal/ai"
	"voicebot/internal/api"
	"voicebot/internal/freeswitch"
	"voicebot/internal/session"
	"voicebot/internal/stt"
	"voicebot/internal/tts"
	"voicebot/internal/vad"
	"voicebot/pkg/kafka"
	"voicebot/pkg/utils"

	"github.com/fiorix/go-eventsocket/eventsocket"
)

type Application struct {
	config     *config.Config
	sessions   *session.Manager
	freeswitch *freeswitch.EventSocket
	stt        *stt.ViettelSTT
	ai         *ai.OpenAI
	vad        *vad.Processor
	apiHandler *api.Handler
	kafka      *kafka.KafkaClient
}

func main() {
	utils.InitLogger()
	// log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	configPath := flag.String("config", "config/config.yaml", "Path to configuration file")
	flag.Parse()

	app, err := initApplication(*configPath)
	if err != nil {
		log.Fatalf("Failed to initialize application: %v", err)
	}

	app.setupEventHandlers()

	// go app.freeswitch.HandleEvents()

	app.startHTTPServer()

	app.waitForShutdown()
}

func initApplication(configPath string) (*Application, error) {
	cfg, err := config.Load(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	log.Printf("Starting VoiceBot Server...")
	log.Printf("Configuration loaded from: %s", configPath)

	sessionMgr := session.NewManager()

	fs, err := freeswitch.NewEventSocket(&cfg.FreeSWITCH, sessionMgr)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to FreeSWITCH: %w", err)
	}
	log.Printf("✓ Connected to FreeSWITCH at %s", cfg.FreeSWITCH.Host)

	openAI := ai.NewOpenAI(&cfg.OpenAI)
	log.Printf("✓ OpenAI %s initialized", cfg.OpenAI.Model)

	vadProc := vad.NewProcessor(&cfg.VAD)
	log.Printf("✓ VAD initialized")

	apiHandler := api.NewHandler(sessionMgr, fs)

	kafkaClient := kafka.NewKafkaClient(&cfg.Kafka)

	return &Application{
		config:     cfg,
		sessions:   sessionMgr,
		freeswitch: fs,
		ai:         openAI,
		vad:        vadProc,
		apiHandler: apiHandler,
		kafka:      kafkaClient,
	}, nil
}

func (app *Application) setupEventHandlers() {
	app.freeswitch.RegisterHandler("CHANNEL_ANSWER", app.handleAnswer)
	app.freeswitch.RegisterHandler("CHANNEL_HANGUP", app.handleHangup)
	app.freeswitch.RegisterHandler("CHANNEL_HANGUP_COMPLETE", app.handleHangupComplete)
	app.freeswitch.RegisterHandler("PLAYBACK_STOP", app.handlePlaybackStop)

	log.Println("Event handlers registered")
}

func (app *Application) handleAnswer(event *eventsocket.Event) {
	time.Sleep(100 * time.Millisecond)
	uuid := app.freeswitch.GetUUID(event)
	session := app.sessions.Get(uuid)
	if session == nil {
		log.Printf("Session not found for answered call: %s", uuid)
		return
	}
	session.AnswerTime = time.Now()
	log.Printf("Call answered: %s", uuid)

	audioFile := filepath.Join(app.config.Audio.TTSPath, utils.GenerateFilename(fmt.Sprintf("tts_%s", uuid), "raw"))
	if err := utils.EnsureFIFO(audioFile); err != nil {
		log.Printf("[STT] Failed to create FIFO audioFile: %v", err)
		return
	}

	recordFile := filepath.Join(app.config.Audio.RecordPath, utils.GenerateFilename(fmt.Sprintf("record_%s", uuid), "raw"))
	if err := utils.EnsureFIFO(recordFile); err != nil {
		log.Printf("[STT] Failed to create FIFO recordFile: %v", err)
		return
	}

	go app.startWithWelcome(uuid)
}

func (app *Application) startWithWelcome(uuid string) {
	session := app.sessions.Get(uuid)
	if session == nil {
		return
	}

	message := session.BotInfo.Welcome

	// Tạo giả lập channel để dùng chung với speakStreamAndListen
	msgChan := make(chan string, 1)
	msgChan <- message
	close(msgChan)

	app.speakStreamAndListen(uuid, msgChan)
}

func (app *Application) speakStreamAndListen(uuid string, openaiChan <-chan string) {
	session := app.sessions.Get(uuid)
	if session == nil || !session.IsActive() {
		return
	}
	// 1. DỌN DẸP TTS CŨ (Nếu đang phát dở)
	if oldTTS, ok := session.GetMetadata("tts").(*tts.ViettelTTS); ok {
		log.Printf("[TTS] Resetting old TTS instance for UUID: %s", uuid)
		oldTTS.Reset() // Hàm này sẽ cancel context và báo Viettel dừng stream
	}

	log.Printf("[VAD] [speakStreamAndListen] Set Bot Speaking: %s , status: %v", uuid, true)
	app.vad.SetBotSpeaking(uuid, true)
	audioFile := filepath.Join(app.config.Audio.TTSPath, utils.GenerateFilename(fmt.Sprintf("tts_%s", uuid), "raw"))
	if err := app.freeswitch.PlayAudio(uuid, audioFile); err != nil {
		log.Printf("[TTS] PlayAudio error: %v", err)
	}
	ttsClient := tts.NewViettelTTS(&app.config.Viettel, session.BotInfo.Voice, session.BotInfo.Tempo)
	session.SetMetadata("tts", ttsClient)
	ttsClient.Connect()

	session.ResetPlayFragment()

	var fullResponse strings.Builder
	var cleanFullResponse string
	// Luồng Gom Text (Accumulator)
	go func() {
		var buffer strings.Builder
		var isInCommand = false

		for chunk := range openaiChan {
			buffer.WriteString(chunk)
			fullResponse.WriteString(chunk)

			currentText := buffer.String()
			// Kiểm tra trạng thái ngoặc vuông
			hasStart := strings.Contains(currentText, "[")
			hasEnd := strings.Contains(currentText, "]")

			if hasStart && !hasEnd {
				isInCommand = true
				continue // Đang trong lệnh thì gom tiếp, không cho xuống phần TTS
			}

			// Nếu đã đóng ngoặc, xử lý lệnh ngay
			if hasStart && hasEnd {
				isInCommand = false
				// Xử lý lệnh và lấy lại text sạch
				cleanedText := app.handleCommands(currentText, session)
				buffer.Reset()
				buffer.WriteString(cleanedText)
			}

			// Nếu đang gom lệnh hoặc chưa đủ độ dài/dấu ngắt -> Tiếp tục đợi
			if isInCommand {
				continue
			}

			isEndOfSentence := strings.ContainsAny(chunk, ".,?!\n")

			if isEndOfSentence {
				textToRead := strings.TrimSpace(buffer.String())

				if textToRead != "" {
					log.Printf("[TTS-Stream] Sent %s ", textToRead)

					// Làm sạch và gửi
					cleaned := utils.CleanAmountForTTS(textToRead)
					ttsClient.SendText(cleaned+" ", false)

					buffer.Reset()
				}
			}
		}

		// Gửi phần còn lại cuối cùng
		remaining := strings.TrimSpace(buffer.String())
		if remaining != "" {
			remaining = utils.CleanAmountForTTS(remaining)
			ttsClient.SendText(remaining, true)
		} else {
			ttsClient.SendText("", true)
		}
		// session.AddMessage("assistant", cleanFullResponse)
	}()

	// Luồng ghi PCM vào FIFO và Phát âm thanh
	go func() {
		// Hàm này sẽ trả về đoạn text THỰC TẾ đã chui vào FIFO

		onChunkReceived := func(chunk *tts.TTSChunk) {
			if chunk.Text != "" && chunk.Duration > 0 {
				session.AddFragment(chunk.Text, chunk.Duration)
			}
			if len(chunk.RawPCM) > 0 {
				session.SetStartPlayTime()
			}
		}

		err := ttsClient.StreamPCMToFIFO(audioFile, onChunkReceived)
		if err != nil {
			log.Printf("FIFO Error: %v", err)
		}
	}()
	cleanFullResponse = utils.CleanAllCommands(fullResponse.String())
	session.SetMetadata("last_full_text", cleanFullResponse)
	app.startListening(uuid)
}

func (app *Application) handleCommands(input string, session *session.CallSession) string {
	// Regex bắt nội dung trong ngoặc vuông
	re := regexp.MustCompile(`\[([^\]]+)\]`)
	matches := re.FindAllStringSubmatch(input, -1)

	for _, match := range matches {
		fullCmd := match[1]
		parts := strings.SplitN(fullCmd, ":", 2)
		cmd := strings.ToUpper(strings.TrimSpace(parts[0])) // Chuyển hoa để tránh AI viết thường

		value := ""
		if len(parts) > 1 {
			value = strings.TrimSpace(parts[1])
		}

		log.Printf("[COMMAND] Phát hiện lệnh: %s | Giá trị: %s", cmd, value)

		switch cmd {
		case "ENDCALL":
			session.UpdateStatus("pending_hangup")

		case "TRANSFER":
			// Nếu không có value, mặc định về 1000 như bạn đã quy định
			target := value
			if target == "" {
				target = "1000"
			}
			session.SetMetadata("transfer_to", target)
			session.UpdateStatus("pending_transfer")
			app.kafka.SendCallResult(session.CallBotID, "TRANSFER", value)

		case "CALLBACK":
			app.kafka.SendCallResult(session.CallBotID, cmd, value)
		default:
			app.kafka.SendCallResult(session.CallBotID, cmd, "")
		}
	}

	// Xóa bỏ các lệnh khỏi văn bản để TTS không đọc ra loa
	return re.ReplaceAllString(input, "")
}

func (app *Application) startListening(uuid string) {
	session := app.sessions.Get(uuid)
	if session == nil || !session.IsActive() {
		return
	}

	expectedTurn := session.GetTurnID()

	session.UpdateStatus("active")
	log.Printf("[STT] Start Listening")
	sttClient := stt.NewViettelSTT(&app.config.Viettel)
	session.SetMetadata("stt", sttClient)

	recordFile := filepath.Join(app.config.Audio.RecordPath, utils.GenerateFilename(fmt.Sprintf("record_%s", uuid), "raw"))
	if oldCancel := session.GetMetadata("cancelFifo"); oldCancel != nil {
		oldCancel.(context.CancelFunc)()
	}

	fifoCtx, cancelFifo := context.WithCancel(context.Background())
	session.SetMetadata("cancelFifo", cancelFifo)

	sttCtx := context.Background()
	// session.SetMetadata("cancelSTT", cancelSTT)
	sttStream, err := sttClient.RecognizeStream(sttCtx, uuid)
	if err != nil {
		log.Printf("[STT] Failed to open STT stream: %v", err)
		return
	}

	onSpeech := func(finalText string) {
		if text, ok := app.vad.FinalizeText(uuid, finalText); ok {
			log.Printf("[VAD] Chốt câu (Winner): %s", text)
			app.freeswitch.StopRecording(uuid, recordFile)
			app.processSTTResultsStream(uuid, text)
		} else {
			log.Printf("[VAD-Ignore] Ignore vì STT đã chốt trước: %s", finalText)
		}
	}
	onTimeout := func() {
		log.Printf("[VAD] Timeout im lặng cho UUID: %s", uuid)
		app.freeswitch.EndCall(uuid)
	}

	if !app.vad.HasSession(uuid) {
		app.vad.StartVAD(uuid, onTimeout, onSpeech)
	} else {
		// app.vad.UpdateCallbacks(uuid, onTimeout, onSpeech)
	}

	resultChan := make(chan *stt.STTResult, 10)
	go sttClient.ReceiveResults(sttStream, resultChan)

	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-fifoCtx.Done():
				return
			case <-ticker.C:
				if !app.vad.HasSession(uuid) {
					return
				}
				app.vad.ProcessSilentTimeout(uuid)
			}
		}
	}()

	go func() {
		for res := range resultChan {
			if res != nil && res.Text != "" {
				if session.GetTurnID() != expectedTurn {
					log.Printf("[STT-Discard] Bỏ qua kết quả cũ của Turn %d", expectedTurn)
					return // Thoát goroutine cũ
				}
				app.vad.UpdateActivity(uuid, res.Text)

				log.Printf("[Barge-in] Valid speech detected: %s. Stopping bot.", res.Text)
				if app.vad.IsBotSpeaking(uuid) {
					if !session.GetStartPlayTime().IsZero() {
						elapsed := time.Since(session.GetStartPlayTime()).Seconds()

						// Nếu Bot nói chưa đủ 1.2 giây, bỏ qua không cho ngắt
						if elapsed < 1.5 {
							log.Printf("[Barge-in-Ignore] Bot mới nói được %.2fs (Dưới ngưỡng 1.5s), không ngắt.", elapsed)
							continue
						}
					}

					botText := app.CalculateActualSpokenText(uuid)
					aiDecision := app.ai.DecideBargeIn(session.GetHistory(), session.BotInfo.BargeInPrompt, botText, res.Text)
					if aiDecision == "0" {
						continue
					}
					log.Printf("[Barge-in] Stopping bot for: %s", res.Text)
					app.freeswitch.StopPlayback(uuid)
					// Sau khi break, không làm gì thêm, đợi người dùng nói xong

					status := session.GetStatus()
					if status == "pending_hangup" {
						session.UpdateStatus("active")
					}
					continue
				}
				// Nếu Viettel báo IsFinal, ta có thể dừng gửi audio sớm để tiết kiệm tài nguyên
				if res.IsFinal {
					if text, ok := app.vad.FinalizeText(uuid, res.Text); ok {
						log.Printf("[STT-Final] Chốt câu (STT Winner): %s", text)
						app.freeswitch.StopRecording(uuid, recordFile)
						app.processSTTResultsStream(uuid, text)
					} else {
						log.Printf("[STT-Ignore] Ignore vì VAD đã chốt trước: %s", res.Text)
					}
				}
			}
		}
	}()

	go func() {
		f, err := os.OpenFile(recordFile, os.O_RDONLY, 0666)
		if err != nil {
			return
		}
		defer f.Close()

		buf := make([]byte, 320) // 20s chunk
		for {
			select {
			case <-fifoCtx.Done():
				return
			case <-sttCtx.Done():
				return
			default:
				n, err := f.Read(buf)
				if n > 0 {
					chunk := buf[:n]
					rms := utils.GetRMS(chunk)
					if rms > 800.0 {
						// Log khi âm thanh vượt ngưỡng
						log.Printf("[AUDIO-LEVEL] Speaking detected! Level: %.2f", rms)
					}
					sttClient.SendAudio(sttStream, chunk)
				}
				if err != nil && err != io.EOF {
					return
				}
				if err == io.EOF {
					time.Sleep(1 * time.Millisecond)
				}
			}
		}
	}()

	if err := app.freeswitch.StartRecording(uuid, recordFile); err != nil {
		log.Printf("[STT] Failed to start recording: %v", err)
		return
	}
}

func (app *Application) CalculateActualSpokenText(uuid string) string {
	s := app.sessions.Get(uuid)
	if s == nil {
		return ""
	}

	if s.StartPlayTime.IsZero() {
		return ""
	}

	elapsed := time.Since(s.StartPlayTime).Seconds() + 0.3
	if elapsed <= 0 {
		return ""
	}

	var spoken strings.Builder
	totalDur := 0.0

	for _, f := range s.Fragments {
		if totalDur+f.Duration <= elapsed {
			spoken.WriteString(f.Text + " ")
			totalDur += f.Duration
		} else {
			// Tính toán tỷ lệ từ trong fragment bị ngắt nửa chừng
			ratio := (elapsed - totalDur) / f.Duration
			words := strings.Fields(f.Text)
			log.Printf("[BARGE-IN] lấy last fragment time %v duration %v words %v ", (elapsed - totalDur), f.Duration, words)
			if ratio > 0.9 {
				spoken.WriteString(f.Text + " ")
			} else {
				words := strings.Fields(f.Text)
				count := int(float64(len(words)) * ratio)
				if count > 0 {
					if count > len(words) {
						count = len(words)
					}
					spoken.WriteString(strings.Join(words[:count], " ") + "...")
				}
			}
			break
		}
	}
	return spoken.String()
}

func (app *Application) processSTTResultsStream(uuid string, finalText string) {
	log.Printf("[VAD] [processSTTResultsStream] Set Bot Speaking: %s , status: %v", uuid, true)
	app.vad.SetBotSpeaking(uuid, true)

	session := app.sessions.Get(uuid)
	if session == nil {
		return
	}

	if session.GetStatus() == "ending" || session.GetStatus() == "ended" {
		log.Printf("[Core] Session %s is ending or closed, skipping process", uuid)
		return
	}

	// Dùng Mutex bảo vệ trạng thái (Sử dụng method ResetStatus/CheckAndSet đã viết trước đó)
	if session.GetStatus() == "processing_ai" {
		return
	}

	newTurn := session.IncrementTurn()
	log.Printf("[SESSION] New Turn Started: %d for UUID: %s", newTurn, uuid)

	session.UpdateStatus("processing_ai")
	cleanText := strings.TrimSpace(strings.ToLower(finalText))
	if utils.IsNoise(cleanText) {
		log.Printf("[AI] No text detected for %s, listening again...", uuid)
		session.UpdateStatus("active")
		app.startListening(uuid)
		return
	}

	log.Printf("[AI] Calling OpenAI with: %s", cleanText)
	session.AddMessage("user", cleanText, cleanText)

	// Kích hoạt luồng Stream OpenAI
	openaiChan := make(chan string, 100)
	go func() {
		if err := app.ai.GetStreamResponse(session.GetHistory(), session.BotInfo.BotPrompt, openaiChan); err != nil {
			log.Printf("[AI] OpenAI Stream Error: %v", err)
			log.Printf("[VAD] [GetStreamResponse] Set Bot Speaking: %s , status: %v", uuid, false)
			app.vad.SetBotSpeaking(uuid, false)
		}
	}()

	app.speakStreamAndListen(uuid, openaiChan)
}

func (app *Application) handleHangup(event *eventsocket.Event) {
	uuid := app.freeswitch.GetUUID(event)
	session := app.sessions.Get(uuid)
	if session == nil {
		return
	}

	fullText, _ := session.GetMetadata("last_full_text").(string)
	actualText := app.CalculateActualSpokenText(uuid)
	if actualText != "" {
		log.Printf("[BARGE-IN] Người dùng đã nghe được: %s", actualText)
		session.AddMessage("assistant", actualText, fullText)
	}

	session.UpdateStatus("ending")
	log.Printf("Call hangup initiated: %s", uuid)
}

func (app *Application) handleHangupComplete(event *eventsocket.Event) {
	uuid := app.freeswitch.GetUUID(event)
	session := app.sessions.Get(uuid)
	if session == nil {
		return
	}

	go app.cleanup(uuid)
}

func (app *Application) handleSpeech(event *eventsocket.Event) {
	// Handle if using FreeSWITCH ASR instead of Viettel STT
	uuid := app.freeswitch.GetUUID(event)
	text := event.Get("Speech-Text")

	if text != "" {
		log.Printf("FreeSWITCH ASR detected [%s]: %s", uuid, text)
		// Process like Viettel STT result
	}
}

func (app *Application) handlePlaybackStop(event *eventsocket.Event) {
	uuid := app.freeswitch.GetUUID(event)
	session := app.sessions.Get(uuid)
	if session == nil {
		return
	}

	fullText, _ := session.GetMetadata("last_full_text").(string)
	actualText := app.CalculateActualSpokenText(uuid)
	if actualText != "" {
		log.Printf("[BARGE-IN] Người dùng đã nghe được: %s", actualText)
		session.AddMessage("assistant", actualText, fullText)
	}

	log.Printf("[VAD] [handlePlaybackStop] Set Bot Speaking: %s , status: %v", uuid, false)
	app.vad.SetBotSpeaking(uuid, false)
	// Can trigger next action after TTS playback finishes
	status := session.GetStatus()
	if status == "pending_hangup" {
		log.Printf("[FS] Playback FINISHED. Killing call now: %s", uuid)
		time.Sleep(500 * time.Millisecond)
		app.freeswitch.EndCall(uuid)
	} else if status == "pending_transfer" {
		if val := session.GetMetadata("transfer_to"); val != nil {
			time.Sleep(200 * time.Millisecond)

			extension := fmt.Sprintf("%v", val)
			app.freeswitch.Transfer(uuid, extension)
		}
	}
}

func (app *Application) cleanup(uuid string) {
	session := app.sessions.Get(uuid)
	if session == nil {
		return
	}

	recordFile := filepath.Join(app.config.Audio.RecordPath, utils.GenerateFilename(fmt.Sprintf("record_%s", uuid), "raw"))
	utils.RemoveFIFO(recordFile)
	ttsFile := filepath.Join(app.config.Audio.TTSPath, utils.GenerateFilename(fmt.Sprintf("tts_%s", uuid), "raw"))
	utils.RemoveFIFO(ttsFile)
	session.EndTime = time.Now()
	app.kafka.SendCallHistory(session)
	// Keep session for history, don't delete immediately
	app.vad.StopVAD(uuid)
	ttsAny := session.GetMetadata("tts")
	if ttsAny != nil {
		if ttsClient, ok := ttsAny.(*tts.ViettelTTS); ok {
			ttsClient.Close()
		}
	}

	sttAny := session.GetMetadata("stt")
	if sttAny != nil {
		if sttClient, ok := sttAny.(*stt.ViettelSTT); ok {
			sttClient.Close()
		}
	}

	app.sessions.Delete(uuid)
}

func (app *Application) Shutdown() {
	log.Println("Shutting down application...")

	// Close FreeSWITCH connection
	if app.freeswitch != nil {
		app.freeswitch.Close()
	}

	log.Println("Application shutdown complete")
}

func (app *Application) startHTTPServer() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/call", app.apiHandler.MakeCall)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	addr := app.config.GetAddress()

	go func() {
		if err := http.ListenAndServe(addr, mux); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()
}

func (app *Application) waitForShutdown() {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	<-sigChan

	log.Println("\nReceived shutdown signal...")

	app.Shutdown()

	log.Println("Goodbye!")
	os.Exit(0)
}
