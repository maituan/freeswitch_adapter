package utils

import (
	"math"
	"strings"
)

func IsNoise(text string) bool {
	text = strings.ToLower(strings.TrimSpace(text))
	if text == "" {
		return true
	}

	// 1. Lọc nhiễu vật lý (Cực ngắn hoặc ký tự rác từ STT)
	// Các ký tự đơn lẻ như "s", "v", "a", "." thường là lỗi nhận diện do tiếng ồn
	if len([]rune(text)) < 2 {
		// Ngoại trừ chữ "có" (trong trường hợp STT nhận diện ngắn)
		if text != "có" && text != "ừ" {
			return true
		}
	}

	// 2. Danh sách "Rác âm thanh" (Filler words)
	// Những từ này đứng một mình thì CHẮC CHẮN không mang ý nghĩa nghiệp vụ
	trashWords := map[string]bool{
		"à":  true,
		"ừm": true,
		"ờ":  true,
		"ơ":  true,
		"hả": true,
		"ê":  true,
	}

	if trashWords[text] {
		return true
	}

	// LƯU Ý: "vâng", "dạ", "ừ", "được", "ok" KHÔNG ĐƯỢC cho vào đây
	// vì chúng là câu trả lời mang tính quyết định.

	return false
}

func GetRMS(data []byte) float64 {
	var sum float64
	// PCM 16-bit: mỗi mẫu (sample) chiếm 2 byte
	for i := 0; i < len(data); i += 2 {
		if i+1 >= len(data) {
			break
		}
		// Chuyển 2 byte thành số nguyên 16-bit (Little Endian)
		sample := int16(data[i]) | (int16(data[i+1]) << 8)
		sum += float64(sample) * float64(sample)
	}
	// Tính trung bình bình phương rồi lấy căn (Root Mean Square)
	return math.Sqrt(sum / (float64(len(data)) / 2))
}
