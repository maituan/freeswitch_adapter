package utils

import (
	"fmt"
	"log"
	"os"
	"time"
)

// LogWriter định nghĩa cấu trúc custom writer để chèn miliseconds
type LogWriter struct{}

func (writer LogWriter) Write(bytes []byte) (int, error) {
	// Định dạng: 2006/01/02 15:04:05.000 (Năm/Tháng/Ngày Giờ:Phút:Giây.Mili)
	return fmt.Fprint(os.Stdout, time.Now().Format("2006/01/02 15:04:05.000 ")+string(bytes))
}

// InitLogger khởi tạo cấu hình log toàn cục
func InitLogger() {
	// Tắt cờ Ldate và Ltime vì đã tự xử lý ở LogWriter
	// Giữ lại Lshortfile để biết log phát ra từ file/dòng nào
	log.SetFlags(log.Lshortfile)

	// Chuyển hướng đầu ra của log chuẩn sang LogWriter của chúng ta
	log.SetOutput(new(LogWriter))
}
