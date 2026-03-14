package tts

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"voicebot/config"
)

type ViettelTTS struct {
	config     *config.ViettelConfig
	conn       *websocket.Conn
	mu         sync.Mutex
	isAuth     bool
	sampleRate int
	resultChan chan *TTSChunk
	voice      string
	tempo      float64

	ctx    context.Context
	cancel context.CancelFunc
}

type TTSChunk struct {
	RawPCM     []byte
	IsFinal    bool
	Duration   float64
	SampleRate int
	Text       string
	OriginText string
}

func NewViettelTTS(cfg *config.ViettelConfig, voice string, tempo float64) *ViettelTTS {
	log.Printf("voice %s", voice)
	ctx, cancel := context.WithCancel(context.Background())
	return &ViettelTTS{
		config:     cfg,
		resultChan: make(chan *TTSChunk, 100),
		voice:      voice,
		tempo:      tempo,
		ctx:        ctx,
		cancel:     cancel,
	}
}

// Connect kết nối WebSocket và authenticate

func (tts *ViettelTTS) Connect() error {
	tts.mu.Lock()
	defer tts.mu.Unlock()

	// Kết nối WebSocket
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, _, err := dialer.Dial(tts.config.TTSWebSocketURL, nil)
	if err != nil {
		return fmt.Errorf("[TTS] failed to connect WebSocket: %w", err)
	}

	tts.conn = conn

	// Gửi message authentication
	log.Printf("voice %s tempo %v", tts.voice, tts.tempo)
	authMsg := map[string]interface{}{
		"text": " ", // Docs yêu cầu gửi một khoảng trắng ban đầu
		"voice_settings": map[string]interface{}{
			"voiceId":       tts.voice,
			"resample_rate": 8000, // ĐƯA VỀ 8000Hz Ở ĐÂY
			"tempo":         tts.tempo,
		},
		"generator_config": map[string]interface{}{
			"chunk_length_schedule": []int{1},
		},
		"xi_api_key": tts.config.TTSAPIKey, // Tên field theo docs python
	}

	if err := conn.WriteJSON(authMsg); err != nil {
		conn.Close()
		return fmt.Errorf("[TTS] failed to send auth: %w", err)
	}

	// Đọc response authentication
	var authResp map[string]interface{}
	if err := conn.ReadJSON(&authResp); err != nil {
		conn.Close()
		return fmt.Errorf("[TTS] failed to read auth response: %w", err)
	}

	if status, ok := authResp["status"].(string); !ok || status != "authenticated" {
		if errMsg, ok := authResp["error"].(string); ok {
			conn.Close()
			return fmt.Errorf("[TTS] authentication failed: %s", errMsg)
		}
		conn.Close()
		return fmt.Errorf("[TTS] authentication failed: unknown error")
	}

	tts.isAuth = true
	if sr, ok := authResp["sampling_rate"].(float64); ok {
		tts.sampleRate = int(sr)
	} else {
		tts.sampleRate = 8000
	}

	log.Printf("[TTS] WebSocket authenticated: voice=%s, sample_rate=%d",
		tts.voice, tts.sampleRate)

	// Start goroutine để nhận audio chunks
	go tts.receiveLoop()

	return nil
}

// SendText gửi text để synthesize
func (tts *ViettelTTS) SendText(text string, endOfInput bool) error {
	tts.mu.Lock()
	defer tts.mu.Unlock()

	if !tts.isAuth {
		return fmt.Errorf("[TTS] not authenticated")
	}

	msg := map[string]interface{}{
		"text":         text,
		"end_of_input": endOfInput,
	}

	if err := tts.conn.WriteJSON(msg); err != nil {
		return fmt.Errorf("[TTS] failed to send text: %w", err)
	}

	log.Printf("[TTS] sent text: '%s', end_of_input=%v", text, endOfInput)

	return nil
}

// Reset huỷ buffer và audio đang sinh
func (tts *ViettelTTS) Reset() error {
	tts.mu.Lock()
	defer tts.mu.Unlock()

	if !tts.isAuth {
		return fmt.Errorf("[TTS] not authenticated")
	}

	msg := map[string]interface{}{
		"reset": true,
	}

	return tts.conn.WriteJSON(msg)
}

// receiveLoop nhận audio chunks từ WebSocket
func (tts *ViettelTTS) receiveLoop() {
	defer close(tts.resultChan)

	for {
		var msg map[string]interface{}

		if err := tts.conn.ReadJSON(&msg); err != nil {
			log.Printf("[TTS] receive error: %v", err)
			return
		}

		// Kiểm tra lỗi
		if errMsg, ok := msg["error"].(string); ok {
			log.Printf("[TTS] error: %s", errMsg)
			continue
		}

		// Kiểm tra reset response
		if status, ok := msg["status"].(string); ok && status == "reset" {
			log.Println("[TTS] reset confirmed")
			continue
		}

		// Parse audio chunk
		chunk := &TTSChunk{}

		if audioB64, ok := msg["audio"].(string); ok && audioB64 != "" {
			pcm, err := base64.StdEncoding.DecodeString(audioB64)
			if err != nil {
				log.Printf("[TTS] base64 decode error: %v", err)
			} else {
				chunk.RawPCM = pcm // Lưu thẳng bytes vào đây
			}
		}

		if isFinal, ok := msg["isFinal"].(bool); ok {
			chunk.IsFinal = isFinal
		}

		if duration, ok := msg["duration"].(float64); ok {
			chunk.Duration = duration
		}

		if sr, ok := msg["sample_rate"].(float64); ok {
			chunk.SampleRate = int(sr)
		}

		if text, ok := msg["text"].(string); ok {
			chunk.Text = text
		}

		if originText, ok := msg["origin_text"].(string); ok {
			chunk.OriginText = originText
		}

		tts.resultChan <- chunk
		if chunk.IsFinal {
			log.Println("[TTS] final chunk received")
			return
		}
	}
}

// GetResultChannel trả về channel để nhận audio chunks
func (tts *ViettelTTS) GetResultChannel() <-chan *TTSChunk {
	return tts.resultChan
}

// DecodeAudio decode base64 PCM audio thành bytes
func (tts *ViettelTTS) DecodeAudio(audioBase64 string) ([]byte, error) {
	audioBytes, err := base64.StdEncoding.DecodeString(audioBase64)
	if err != nil {
		return nil, fmt.Errorf("[TTS] failed to decode base64: %w", err)
	}
	return audioBytes, nil
}

func writeUint32(b []byte, v uint32) {
	b[0] = byte(v)
	b[1] = byte(v >> 8)
	b[2] = byte(v >> 16)
	b[3] = byte(v >> 24)
}

func writeUint16(b []byte, v uint16) {
	b[0] = byte(v)
	b[1] = byte(v >> 8)
}

func (tts *ViettelTTS) Close() error {
	tts.mu.Lock()
	defer tts.mu.Unlock()

	if tts.conn != nil {
		return tts.conn.Close()
	}
	return nil
}

func (tts *ViettelTTS) StreamPCMToFIFO(fifoPath string, onChunkReceived func(*TTSChunk)) error {
	log.Printf("[TTS] Opening FIFO for writing: %s", fifoPath)

	// Mở FIFO
	fifoFile, err := os.OpenFile(fifoPath, os.O_WRONLY, 0666)
	if err != nil {
		return fmt.Errorf("[TTS] failed to open FIFO: %w", err)
	}
	defer fifoFile.Close()

	log.Printf("[TTS] FIFO link established with FreeSwitch")
	for {
		select {
		case <-tts.ctx.Done():
			log.Println("[TTS] Stop streaming PCM: call ended")
			return nil

		case chunk, ok := <-tts.resultChan:
			log.Println("[TTS] PMC to FIFO")
			if !ok {
				return nil
			}

			if onChunkReceived != nil {
				onChunkReceived(chunk)
			}

			if len(chunk.RawPCM) > 0 {
				// log.Printf("[TTS] Writing %d bytes to FIFO", len(chunk.RawPCM))
				if _, err := fifoFile.Write(chunk.RawPCM); err != nil {
					if strings.Contains(err.Error(), "broken pipe") {
						log.Printf("[TTS] FIFO closed (barge-in)")
						return nil
					}
					return fmt.Errorf("[TTS] FIFO write error: %w", err)
				}
			}

			if chunk.IsFinal {
				return nil
			}
		}
	}
}
