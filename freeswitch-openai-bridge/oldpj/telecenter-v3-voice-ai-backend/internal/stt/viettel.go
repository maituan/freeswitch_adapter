package stt

import (
	"context"
	"fmt"
	"io"
	"log"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	"voicebot/config"
	pb "voicebot/proto/streaming_voice"
)

type ViettelSTT struct {
	config *config.ViettelConfig
	client pb.StreamVoiceClient
	conn   *grpc.ClientConn
}

func NewViettelSTT(cfg *config.ViettelConfig) *ViettelSTT {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, cfg.STTGrpcAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		log.Fatalf("[STT] Failed to connect to Viettel STT gRPC: %v", err)
	}

	client := pb.NewStreamVoiceClient(conn)

	log.Printf("[STT] Connected to Viettel STT gRPC at %s", cfg.STTGrpcAddr)

	return &ViettelSTT{
		config: cfg,
		client: client,
		conn:   conn,
	}
}

// RecognizeStream tạo streaming connection với metadata
func (stt *ViettelSTT) RecognizeStream(ctx context.Context, sessionID string) (pb.StreamVoice_SendVoiceClient, error) {
	// Tạo metadata theo tài liệu
	md := metadata.New(map[string]string{
		"channels":        "1",
		"rate":            "8000",
		"format":          "S16LE",
		"token":           stt.config.STTToken,
		"id":              sessionID,
		"single-sentence": "true",
		"silence_timeout": stt.config.SilenceTimeout,
		"speech_timeout":  stt.config.SpeechTimeout,
		"speech_max":      "30",
	})

	ctx = metadata.NewOutgoingContext(ctx, md)

	stream, err := stt.client.SendVoice(ctx)
	if err != nil {
		return nil, fmt.Errorf("[STT] failed to create stream: %w", err)
	}

	return stream, nil
}

// SendAudio gửi audio chunk qua stream
func (stt *ViettelSTT) SendAudio(stream pb.StreamVoice_SendVoiceClient, audioData []byte) error {
	req := &pb.VoiceRequest{
		ByteBuff: audioData,
	}

	return stream.Send(req)
}

func (stt *ViettelSTT) ReceiveResults(
	stream pb.StreamVoice_SendVoiceClient,
	resultChan chan<- *STTResult,
) {
	defer close(resultChan)

	for {
		reply, err := stream.Recv()
		if err == io.EOF {
			log.Println("[STT] Stream ended by server (EOF)")
			return
		}
		if err != nil {
			log.Printf("[STT] Receive error: %v", err)
			return
		}

		// Kiểm tra status từ server Viettel (0 thường là thành công)
		if reply.Status != 0 {
			log.Printf("[STT] Server returned error status: %d, msg: %s", reply.Status, reply.Msg)
			continue
		}

		// Kiểm tra dữ liệu result và hypotheses
		// Lưu ý: Sau khi sửa proto lồng nhau, kiểm tra kỹ tên trường sinh ra trong file .pb.go
		if reply.Result == nil || len(reply.Result.GetHypotheses()) == 0 {
			continue
		}

		// Lấy kết quả đầu tiên (thường là kết quả tốt nhất)
		h := reply.Result.GetHypotheses()[0]

		// Tạo struct kết quả để đẩy ra channel
		res := &STTResult{
			Text:          h.GetTranscriptNormed(),
			OriginalText:  h.GetTranscript(),
			Confidence:    h.GetConfidence(),
			IsFinal:       reply.Result.GetFinal(), // final nằm trong Result
			SegmentStart:  reply.GetSegmentStart(),
			SegmentLength: reply.GetSegmentLength(),
			TotalLength:   reply.GetTotalLength(),
		}

		// Gửi kết quả vào channel để xử lý AI/Logic tiếp theo
		resultChan <- res
		log.Printf("[STT] full reply: %v", reply)
		// Log để debug - Sử dụng %q để bao quanh chuỗi bằng dấu ngoặc kép, dễ nhìn ký tự trống
		log.Printf("[STT] %s | Final: %v | Conf: %.2f",
			res.Text, res.IsFinal, res.Confidence)

		// Nếu muốn đóng stream ngay khi nhận được Final (tùy logic của bạn)
		// if res.IsFinal {
		//    return
		// }
	}
}

type STTResult struct {
	Text          string
	OriginalText  string
	Confidence    float32
	IsFinal       bool
	SegmentStart  float32
	SegmentLength float32
	TotalLength   float32
}

func (stt *ViettelSTT) Close() error {
	if stt.conn != nil {
		return stt.conn.Close()
	}
	return nil
}
