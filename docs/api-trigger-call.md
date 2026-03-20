# API Trigger Cuộc Gọi

## Endpoint

```
POST /api/call
Host: <bridge-host>:8083
Content-Type: application/json
```

---

## Request Body

### Các trường cơ bản

| Field | Type | Bắt buộc | Mô tả |
|---|---|---|---|
| `phone` | string | **Có** (hoặc `sip_endpoint`) | Số điện thoại thuê bao, ví dụ `0901234567` |
| `sip_endpoint` | string | **Có** (hoặc `phone`) | SIP URI đầy đủ, ví dụ `0901234567@10.0.0.1` |
| `caller_id` | string | Không | Số hiển thị cho khách. Mặc định: `"callbot"` |
| `scenario` | string | Không | Key kịch bản bot. Mặc định: `"leadgenTNDS"` |
| `call_bot_id` | string | Không | ID định danh bot instance. Mặc định: tự sinh |
| `voice_id` | string | Không | ID giọng TTS. Nếu bỏ trống dùng giọng mặc định |
| `lead_id` | string | Không | Shortcut — tương đương `custom_data.leadId` |
| `gender` | string | Không | Shortcut — tương đương `custom_data.gender` |
| `name` | string | Không | Shortcut — tương đương `custom_data.name` |
| `plate` | string | Không | Shortcut — tương đương `custom_data.plate` |
| `custom_data` | object | Không | Dữ liệu nghiệp vụ truyền vào agent (xem bên dưới) |
| `media_params` | object | Không | Tham số ASR/TTS override cho cuộc gọi này (xem bên dưới) |

> `phone` và `sip_endpoint` chỉ cần truyền 1 trong 2. Nếu có cả hai, `sip_endpoint` được dùng làm đích gọi.

---

## Response

### Thành công — HTTP 200

```json
{
  "status": "dialing",
  "uuid":   "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

| Field | Mô tả |
|---|---|
| `uuid` | FreeSWITCH UUID của cuộc gọi — dùng làm **correlation ID** xuyên suốt |

### Lỗi

```json
HTTP 400  { "error": "phone or sip_endpoint is required" }
HTTP 500  { "error": "originate failed: ..." }
```

---

## Correlation ID

`uuid` trả về là FreeSWITCH UUID, dùng thống nhất để:

- Match kết quả cuộc gọi trên **Kafka** (`call_id` = `uuid`, Kafka message key = `uuid`)
- Lấy file **audio recording** từ FreeSWITCH theo UUID

**Flow:**
```
POST /api/call
  → response.uuid = "a1b2c3d4-..."   ← lưu lại làm correlation ID
  → cuộc gọi diễn ra
  → kết thúc → Kafka message: key="a1b2c3d4-...", call_id="a1b2c3d4-..."
```

---

## Kafka — Cấu trúc message kết quả

Sau khi cuộc gọi kết thúc, hệ thống tự động push lên topic `KAFKA_CALL_HISTORY_TOPIC`:

**Key:** `uuid` (FreeSWITCH UUID)

**Value:**
```json
{
  "call_id":    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "scenario":   "leadgenMultiAgent",
  "phone":      "0901234567",
  "start_time": "2026-03-18T10:00:00.000Z",
  "end_time":   "2026-03-18T10:05:30.123Z",
  "history": [
    {
      "role":           "assistant",
      "content":        "Xin chào anh Văn A, tôi là Minh Anh...",
      "origin_content": "Xin chào anh Văn A, tôi là Minh Anh...",
      "turn_id":        1,
      "timestamp":      "2026-03-18T10:00:02.000Z"
    },
    {
      "role":           "user",
      "content":        "Ừ cho tôi hỏi giá bảo hiểm",
      "origin_content": "Ừ cho tôi hỏi giá bảo hiểm",
      "turn_id":        1,
      "timestamp":      "2026-03-18T10:00:08.000Z"
    }
  ],
  "customer_info": {
    "session_id":   "sess-001",
    "lead_id":      "LEAD-999",
    "name":         "Nguyễn Văn A",
    "plate":        "51G-12345"
  },
  "report": [
    {
      "step":      "quote_sent",
      "detail":    "Báo giá 1.2 triệu/năm",
      "timestamp": "2026-03-18T10:03:00.000Z"
    }
  ]
}
```

> `report` chỉ xuất hiện nếu bot có gọi tool `reportStep` trong quá trình hội thoại.

---

## Danh sách scenario

| `scenario` | Mô tả |
|---|---|
| `leadgenTNDS` | LeadGen TNDS (mặc định) |
| `leadgenMultiAgent` | LeadGen TNDS Multi-Agent |
| `abicHotline` | ABIC Hotline |
| `carebotAuto365` | Carebot Auto 365 |
| `hotlineAI` | Hotline AI |
| `motheAI` | Mothe AI |
| `bidvBot` | BIDV Bot |
| `customerServiceRetail` | Customer Service Retail |
| `chatSupervisor` | Chat Supervisor |
| `simpleHandoff` | Simple Handoff |

---

## `custom_data` cho scenario `leadgenMultiAgent` / `leadgenTNDS`

```json
{
  "custom_data": {
    "session_id":          "unique-session-id-001",
    "lead_id":             "LEAD-12345",
    "display_agent_name":  "Minh Anh",
    "gender":              "female",
    "name":                "Nguyễn Văn A",
    "plate":               "51G-12345",
    "vehicle_type":        "o_to",
    "num_seats":           5,
    "is_business":         false,
    "weight_tons":         1.5,
    "expiry_date":         "2025-12-31",
    "address":             "123 Lê Lợi, Quận 1, TP.HCM",
    "brand":               "Toyota",
    "color":               "Trắng",
    "voice_id":            "vi-VN-HoaiMyNeural"
  }
}
```

| Field | Type | Mô tả |
|---|---|---|
| `session_id` | string | ID phiên do client định nghĩa — xuất hiện trong `customer_info` của Kafka |
| `lead_id` | string | ID lead |
| `display_agent_name` | string | Tên agent bot tự giới thiệu |
| `gender` | string | Giới tính khách: `"male"` / `"female"` |
| `name` | string | Tên khách hàng |
| `plate` | string | Biển số xe |
| `vehicle_type` | string | Loại xe: `"xe_may"`, `"o_to"`, ... |
| `num_seats` | number | Số chỗ ngồi |
| `is_business` | boolean | Xe kinh doanh vận tải |
| `weight_tons` | number | Tải trọng (tấn) |
| `expiry_date` | string | Ngày hết hạn bảo hiểm cũ (`YYYY-MM-DD`) |
| `address` | string | Địa chỉ đăng ký xe |
| `brand` | string | Hãng xe |
| `color` | string | Màu xe |
| `voice_id` | string | Ghi đè giọng TTS (có thể dùng thay field ngoài) |

---

## `media_params` — Tham số ASR/TTS

Dùng để override cấu hình ASR và TTS cho từng cuộc gọi cụ thể, tách biệt hoàn toàn với `custom_data` (dữ liệu nghiệp vụ).

Nếu không truyền, hệ thống dùng giá trị mặc định từ biến môi trường (`deploy/.env`).

```json
{
  "media_params": {
    "asr_speech_timeout":  "2",
    "asr_silence_timeout": "8",
    "asr_speech_max":      "25",
    "tts_tempo":           "1.15"
  }
}
```

| Field | Type | Default (env) | Mô tả |
|---|---|---|---|
| `asr_speech_timeout` | string (số giây) | `ASR_SPEECH_TIMEOUT=1` | Thời gian chờ tối thiểu để xác nhận user bắt đầu nói |
| `asr_silence_timeout` | string (số giây) | `ASR_SILENCE_TIMEOUT=10` | Thời gian im lặng sau khi nói để ASR kết thúc câu |
| `asr_speech_max` | string (số giây) | `ASR_SPEECH_MAX=30` | Độ dài tối đa một câu nói (ASR cắt tại đây) |
| `tts_tempo` | string (float) | `TTS_TEMPO` (unset) | Tốc độ đọc TTS: `1.0` = bình thường, `1.2` = nhanh hơn, `0.8` = chậm hơn |

> **Lưu ý:** Tất cả giá trị truyền dưới dạng **string** để tương thích với gRPC metadata.

---

## Ví dụ

### Gọi cơ bản theo số điện thoại

```bash
curl -X POST http://bridge-host:8083/api/call \
  -H "Content-Type: application/json" \
  -d '{
    "phone":     "0901234567",
    "caller_id": "02812345678",
    "scenario":  "leadgenMultiAgent",
    "voice_id":  "phuongnhi-north",
    "custom_data": {
      "session_id":          "sess-001",
      "lead_id":             "LEAD-999",
      "display_agent_name":  "Minh Anh",
      "name":                "Nguyễn Văn B",
      "gender":              "male",
      "plate":               "30H-88888",
      "vehicle_type":        "o_to",
      "num_seats":           5,
      "is_business":         false,
      "expiry_date":         "2025-06-30",
      "brand":               "Toyota",
      "color":               "Trắng"
    }
  }'
```

### Gọi với override ASR/TTS

```bash
curl -X POST http://bridge-host:8083/api/call \
  -H "Content-Type: application/json" \
  -d '{
    "phone":     "0901234567",
    "caller_id": "02812345678",
    "scenario":  "leadgenMultiAgent",
    "voice_id":  "phuongnhi-north",
    "custom_data": {
      "session_id": "sess-002",
      "lead_id":    "LEAD-1000",
      "name":       "Trần Thị C"
    },
    "media_params": {
      "asr_silence_timeout": "6",
      "asr_speech_max":      "20",
      "tts_tempo":           "1.1"
    }
  }'
```

### Gọi qua SIP endpoint

```bash
curl -X POST http://bridge-host:8083/api/call \
  -H "Content-Type: application/json" \
  -d '{
    "sip_endpoint": "0901234567@10.0.0.5",
    "caller_id":    "02812345678",
    "scenario":     "leadgenMultiAgent",
    "voice_id":     "phuongnhi-north",
    "custom_data": {
      "session_id": "sess-003",
      "lead_id":    "LEAD-1001",
      "name":       "Lê Văn D"
    }
  }'
```
