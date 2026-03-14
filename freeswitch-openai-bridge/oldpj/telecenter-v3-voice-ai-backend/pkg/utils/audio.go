package utils

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

func GetAudioDuration(filePath string) (time.Duration, error) {
	info, err := os.Stat(filePath)
	if err != nil {
		return 0, err
	}

	fileSize := info.Size()
	if fileSize < 44 {
		return 0, fmt.Errorf("invalid WAV file")
	}

	// WAV calculation: duration = (filesize - 44) / (sampleRate * channels * bytesPerSample)
	// Assuming 16kHz, mono, 16-bit: 16000 * 1 * 2 = 32000 bytes/sec
	durationSeconds := float64(fileSize-44) / 32000.0
	return time.Duration(durationSeconds * float64(time.Second)), nil
}

func GenerateFilename(prefix, ext string) string {
	return fmt.Sprintf("%s.%s", prefix, ext)
}

func FileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func CleanupFile(path string) error {
	if FileExists(path) {
		return os.Remove(path)
	}
	return nil
}

func EnsureFIFO(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// Luôn xóa file cũ để tránh xung đột dữ liệu cũ hoặc lỗi kẹt pipe
	os.Remove(path)

	// Tạo FIFO với quyền 0666 (để mọi user đều có thể đọc/ghi)
	if err := syscall.Mkfifo(path, 0666); err != nil {
		return err
	}

	// Đôi khi umask của hệ thống làm quyền bị giới hạn, cần Chmod lại
	os.Chmod(path, 0666)

	log.Printf("FIFO created with open permissions: %s", path)
	return nil
}

func RemoveFIFO(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	// Optional: check có phải FIFO không
	if info.Mode()&os.ModeNamedPipe == 0 {
		log.Printf("⚠️ Not a FIFO, skip remove: %s", path)
		return nil
	}

	if err := os.Remove(path); err != nil {
		return err
	}

	log.Printf("🗑 FIFO removed: %s", path)
	return nil
}
