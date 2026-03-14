package ai

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"voicebot/config"
	"voicebot/internal/session"
)

type OpenAI struct {
	config *config.OpenAIConfig
	client *http.Client
}

func NewOpenAI(cfg *config.OpenAIConfig) *OpenAI {
	return &OpenAI{
		config: cfg,
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens"`
	Temperature float64       `json:"temperature"`
	Stream      bool          `json:"stream"`
}

type ChatResponseStream struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

type ChatResponse struct {
	Choices []struct {
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (ai *OpenAI) GetResponse(history []session.Message, systemPrompt string) (string, error) {
	log.Printf("[AI] Calling OpenAI Non-stream API")

	messages := []ChatMessage{
		{Role: "system", Content: systemPrompt},
	}
	for _, msg := range history {
		messages = append(messages, ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	payload := ChatRequest{
		Model:       ai.config.Model,
		Messages:    messages,
		MaxTokens:   ai.config.MaxTokens,
		Temperature: ai.config.Temperature,
		Stream:      false, // Tắt stream
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, _ := http.NewRequest("POST", ai.config.BaseURL+"/v1/chat/completions", bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ai.config.APIKey)

	resp, err := ai.client.Do(req)
	if err != nil {
		return "Dạ, kết nối bên em đang gặp sự cố ạ.", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openai error status: %d, body: %s", resp.StatusCode, string(body))
	}

	var fullResp ChatResponse
	if err := json.Unmarshal(body, &fullResp); err != nil {
		return "", err
	}

	if len(fullResp.Choices) > 0 {
		content := fullResp.Choices[0].Message.Content
		log.Printf("[AI] Response received: %d chars", len(content))
		return content, nil
	}

	return "", fmt.Errorf("empty choices in response")
}

func (ai *OpenAI) GetStreamResponse(history []session.Message, systemPrompt string, textChan chan<- string) error {
	log.Printf("[AI] Start call chatbot")
	defer close(textChan)
	messages := []ChatMessage{
		{Role: "system", Content: systemPrompt},
	}

	for _, msg := range history {
		messages = append(messages, ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	payload := ChatRequest{
		Model:       ai.config.Model,
		Messages:    messages,
		MaxTokens:   ai.config.MaxTokens,
		Temperature: ai.config.Temperature,
		Stream:      true,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, _ := http.NewRequest("POST", ai.config.BaseURL+"/v1/chat/completions", bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ai.config.APIKey)

	resp, err := ai.client.Do(req)
	if err != nil {
		textChan <- "Dạ, kết nối bên em đang gặp sự cố, anh vui lòng đợi chút ạ."
		return err
	}
	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)

	// Dùng timer để canh 3 giây cho CHUNK ĐẦU TIÊN
	firstChunkTimer := time.NewTimer(3 * time.Second)
	defer firstChunkTimer.Stop()

	receivedFirst := false

	for {
		// Đọc từng dòng từ Stream
		lineChan := make(chan []byte)
		errReadChan := make(chan error)

		go func() {
			l, e := reader.ReadBytes('\n')
			if e != nil {
				errReadChan <- e
				return
			}
			lineChan <- l
		}()

		select {
		case line := <-lineChan:
			line = bytes.TrimSpace(line)
			if !bytes.HasPrefix(line, []byte("data: ")) {
				continue
			}
			data := bytes.TrimPrefix(line, []byte("data: "))
			if string(data) == "[DONE]" {
				log.Printf("[AI] OpenAI Stream Finished [DONE]")
				return nil
			}

			var streamResp ChatResponseStream
			if err := json.Unmarshal(data, &streamResp); err == nil {
				if len(streamResp.Choices) > 0 {
					content := streamResp.Choices[0].Delta.Content
					if content != "" {
						// Đã nhận được chunk đầu tiên, dừng timer timeout
						if !receivedFirst {
							log.Printf("[AI] Nhận First Chunk")
							firstChunkTimer.Stop()
							receivedFirst = true
						}
						textChan <- content
					}
				}
			}

		case <-firstChunkTimer.C:
			// Quá 3 giây mà chưa nhận được content nào
			log.Printf("[AI] Timeout 3s - Sending default response")
			textChan <- "Dạ, hiện tại hệ thống đang xử lý hơi chậm, anh chờ em một chút nhé."
			return fmt.Errorf("openai_timeout_3s")

		case err := <-errReadChan:
			log.Printf("[AI] Stream read error: %v", err)
			return nil // Thoát vòng lặp để defer close(textChan) chạy
		}
	}
}

func (ai *OpenAI) DecideBargeIn(history []session.Message, bargeInPrompt, botText, userText string) string {
	log.Printf("[AI] Calling OpenAI Non-stream API to Decide Barge In: Bot: %s, User: %s", botText, userText)

	messages := []ChatMessage{
		{Role: "system", Content: bargeInPrompt},
	}
	for _, msg := range history {
		messages = append(messages, ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}
	messages = append(messages, ChatMessage{
		Role:    "assistant",
		Content: botText,
	})
	messages = append(messages, ChatMessage{
		Role:    "user",
		Content: userText,
	})

	payload := ChatRequest{
		Model:       ai.config.Model,
		Messages:    messages,
		MaxTokens:   1,
		Temperature: 0,
		Stream:      false,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "0"
	}

	req, _ := http.NewRequest("POST", ai.config.BaseURL+"/v1/chat/completions", bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+ai.config.APIKey)

	resp, err := ai.client.Do(req)
	if err != nil {
		return "0"
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "0"
	}

	var fullResp ChatResponse
	if err := json.Unmarshal(body, &fullResp); err != nil {
		return ""
	}

	if len(fullResp.Choices) > 0 {
		content := fullResp.Choices[0].Message.Content
		log.Printf("[AI] Response received: %d chars", len(content))
		return content
	}

	return "0"
}
