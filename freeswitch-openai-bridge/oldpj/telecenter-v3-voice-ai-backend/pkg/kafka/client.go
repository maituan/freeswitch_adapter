package kafka

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"voicebot/config"
	"voicebot/internal/session"

	"github.com/segmentio/kafka-go"
)

type KafkaClient struct {
	Writers map[string]*kafka.Writer
	config  *config.KafkaConfig
}

// Khởi tạo Kafka Client quản lý nhiều topic
func NewKafkaClient(config *config.KafkaConfig) *KafkaClient {
	return &KafkaClient{
		config:  config,
		Writers: make(map[string]*kafka.Writer),
	}
}

// Hàm khởi tạo/lấy writer cho một topic cụ thể (Lazy Loading)
func (k *KafkaClient) getWriter(topic string) *kafka.Writer {
	if writer, ok := k.Writers[topic]; ok {
		return writer
	}

	newWriter := &kafka.Writer{
		Addr:                   kafka.TCP(k.config.Host),
		Topic:                  topic,
		Balancer:               &kafka.LeastBytes{},
		Async:                  true,
		MaxAttempts:            5,
		WriteTimeout:           10 * time.Second,
		ReadTimeout:            10 * time.Second,
		RequiredAcks:           kafka.RequireOne,
		AllowAutoTopicCreation: true,
	}
	k.Writers[topic] = newWriter
	return newWriter
}

func (k *KafkaClient) SendCallResult(call_bot_id, result, detail string) {
	payload := map[string]interface{}{
		"result":      result,
		"detail":      detail,
		"call_bot_id": call_bot_id,
	}
	k.sendMessage(k.config.Topic.CallResult, call_bot_id, payload)
}

func (k *KafkaClient) SendCallHistory(session *session.CallSession) {
	payload := session.GetKafkaPayload()

	k.sendMessage(k.config.Topic.CallHistory, session.CallBotID, payload)
}

// Hàm dùng chung để gửi message
func (k *KafkaClient) sendMessage(topic string, key string, data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		log.Printf("[Kafka] Marshal error: %v", err)
		return
	}

	writer := k.getWriter(topic)
	msg := kafka.Message{
		Key:   []byte(key),
		Value: payload,
		Time:  time.Now(),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := writer.WriteMessages(ctx, msg); err != nil {
		log.Printf("[Kafka] Error sending to %s: %v", topic, err)
	} else {
		log.Printf("[Kafka] Sent to %s | Key: %s", topic, key)
	}
}

func (k *KafkaClient) Close() {
	for topic, writer := range k.Writers {
		log.Printf("[Kafka] Closing writer for topic: %s", topic)
		writer.Close()
	}
}
