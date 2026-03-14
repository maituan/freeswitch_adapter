package utils

import (
	"fmt"
	"regexp"
	"strings"
)

func ReplaceTemplate(template string, info map[string]interface{}) string {
	result := template
	for key, value := range info {
		placeholder := "{" + key + "}"
		// Chuyển interface{} sang string an toàn
		valStr := fmt.Sprintf("%v", value)
		result = strings.ReplaceAll(result, placeholder, valStr)
	}
	return result
}

func CleanAmountForTTS(text string) string {
	// Regex tìm: (chữ số) (dấu chấm hoặc phẩy) (chữ số)
	// Ví dụ: 1.000 -> 1000, 1,000 -> 1000
	re := regexp.MustCompile(`(\d)[.,](\d)`)

	// Thực hiện replace cho đến khi không còn dấu phân cách nào nằm giữa các số
	result := text
	for re.MatchString(result) {
		result = re.ReplaceAllString(result, "$1$2")
	}
	return result
}

func CleanAllCommands(text string) string {
	// Regex này sẽ xóa mọi thứ từ [ đến ]
	re := regexp.MustCompile(`\[[^\]]*\]`)
	cleaned := re.ReplaceAllString(text, "")
	// Xử lý thêm để xóa khoảng trắng thừa sau khi xóa lệnh
	return strings.TrimSpace(cleaned)
}
