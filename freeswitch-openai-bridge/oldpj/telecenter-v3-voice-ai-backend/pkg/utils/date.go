package utils

import "time"

// GetVietnameseWeekday trả về tên Thứ trong tuần bằng tiếng Việt
func GetVietnameseWeekday(t time.Time) string {
	weekdays := map[time.Weekday]string{
		time.Sunday:    "Chủ Nhật",
		time.Monday:    "Thứ Hai",
		time.Tuesday:   "Thứ Ba",
		time.Wednesday: "Thứ Tư",
		time.Thursday:  "Thứ Năm",
		time.Friday:    "Thứ Sáu",
		time.Saturday:  "Thứ Bảy",
	}

	if val, ok := weekdays[t.Weekday()]; ok {
		return val
	}
	return ""
}
