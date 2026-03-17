# Callbot Leadgen TNDS

Hệ thống callbot outbound cho kịch bản bán bảo hiểm TNDS ô tô, xây trên Next.js + OpenAI Realtime Agents SDK.

## Tổng quan

- Mô hình multi-agent: `greetingAgent` (mở đầu, xử lý từ chối) -> `mainSaleAgent` (báo giá, chốt đơn).
- Scenario mặc định: `leadgenMultiAgent`.
- State quản lý in-memory, runtime context truyền từ FE qua query params.

## Port

| Service | Port | Mô tả |
|---------|------|-------|
| Web UI / API | `8085` | Next.js app |
| ASR Proxy | `8084` | WebSocket proxy cho voice input |

URL mặc định: `http://localhost:8085/?agentConfig=leadgenMultiAgent`

## Chạy

### Yêu cầu

- Node.js 18+
- npm
- `OPENAI_API_KEY`

### Cài đặt

```bash
npm install
cp .env.example .env
```

Cập nhật `.env` tối thiểu:

```env
OPENAI_API_KEY=your_api_key
```

### Chạy dev

```bash
npm run dev
```

Hoặc chạy background (tự kill tiến trình cũ):

```bash
bash start.sh
```

Xem log:

```bash
tail -f app.log
```

### Biến môi trường

| Biến | Mô tả | Mặc định |
|------|-------|----------|
| `OPENAI_API_KEY` | API key OpenAI | (bắt buộc) |
| `NEXT_PUBLIC_OPENAI_MODEL` | Model Realtime | `gpt-realtime-mini` |
| `OPENAI_REWRITE_MODEL` | Model rewrite | `gpt-4.1-mini` |
| `REDIS_URL` | Redis connection | `redis://localhost:6372` |
| `NEXT_PUBLIC_TTS_MODE` | Chế độ TTS | `offline` |
| `TTS_WEBSOCKET_URI` | URI TTS WebSocket | |
| `TTS_OFFLINE_URL` | URL TTS offline | |
| `ASR_GRPC_URI` | URI ASR gRPC | |
| `ASR_PROXY_PORT` | Port ASR proxy | `8082` |
| `NEXT_PUBLIC_ASR_PROXY_URL` | URL ASR proxy cho FE | |
| `ASR_TOKEN` | Token xác thực ASR | |

## Input data (custom_data)

FE truyền dữ liệu khách hàng qua URL query params khi kết nối cuộc gọi. Cấu trúc:

```json
{
  "custom_data": {
    "session_id": "sess-xxx",
    "lead_id": "LD-9981",
    "phone_number": "0912345678",
    "agent_name": "Thảo",
    "name": "Nguyễn Văn A",
    "gender": "anh",
    "plate": "51A-12345",
    "vehicle_type": "car",
    "num_seats": 5,
    "is_business": false,
    "weight_tons": null,
    "expiry_date": "2025-06-15",
    "brand": "Toyota",
    "color": "trắng"
  }
}
```

### Bảng field

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `session_id` | `string` | Có | ID phiên gọi |
| `lead_id` | `string` | Có | ID lead |
| `phone_number` | `string` | Có | SĐT khách hàng |
| `agent_name` | `string` | Không | Tên tư vấn viên hiển thị (mặc định "Thảo") |
| `name` | `string` | Không | Tên khách hàng (mặc định "mình") |
| `gender` | `string` | Không | Xưng hô: `anh`, `chị`, `anh/chị` |
| `plate` | `string` | Có | Biển số xe |
| `vehicle_type` | `string` | Không | `car`, `pickup`, `truck` |
| `num_seats` | `number` | Không | Số chỗ ngồi |
| `is_business` | `boolean` | Không | Xe kinh doanh vận tải hay không |
| `weight_tons` | `number` | Không | Tải trọng xe tải (tấn), `null` nếu không phải xe tải |
| `expiry_date` | `string` | Không | Ngày hết hạn bảo hiểm (`YYYY-MM-DD`) |
| `brand` | `string` | Không | Hãng xe |
| `color` | `string` | Không | Màu xe |

## Lưu ý

- Audio output qua TTS service riêng, app chạy text-only mode cho Realtime API.
- Đổi scenario mặc định: sửa `defaultAgentSetKey` trong `src/app/agentConfigs/index.ts`.
- Dừng project: kill process theo port `8085` (web) và `8084` (ASR proxy).
