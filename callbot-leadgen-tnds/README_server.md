# Callbot Leadgen TNDS

Hệ thống callbot outbound cho kịch bản bán bảo hiểm TNDS ô tô, xây trên Next.js + OpenAI Realtime Agents SDK.

README này mô tả theo code hiện tại trong `src/app/agentConfigs/leadgenMultiAgent`.

## Tổng quan

- Scenario mặc định: `leadgenMultiAgent`.
- Mô hình: 2-agent (`greetingAgent` -> `mainSaleAgent`).
- Agent đầu tiên: `greetingAgent`.
- Có tích hợp ASR proxy để hỗ trợ voice input.
- UI chạy tại `http://localhost:3000`.

## Kiến trúc agent

### Thư mục chính

```
src/app/agentConfigs/leadgenMultiAgent/
├── index.ts              # Wiring: build agents, export scenario
├── prompts.ts            # Shared prompts (STYLE_RULE, FORMAT_OUTPUT_RULE, CORE_OBJECTION_PROMPT)
├── tools.ts              # Tool definitions (getLeadgenContext, updateLeadgenState, calcTndsFee)
└── agents/
    ├── greetingAgent/
    │   ├── greetingAgent.ts    # Agent definition, handoff -> mainSaleAgent
    │   └── instructions.ts     # Instruction prompt
    └── mainSaleAgent/
        ├── mainSaleAgent.ts    # Agent definition
        └── instructions.ts     # Instruction prompt
```

### Danh sách agent

| Agent | Vai trò | Tools | Handoffs |
|-------|---------|-------|----------|
| `greetingAgent` | Mở cuộc gọi, xử lý phản ứng đầu tiên, thuyết phục đầu phễu | `getLeadgenContext`, `updateLeadgenState` | -> `mainSaleAgent` |
| `mainSaleAgent` | Khai thác thông tin xe, báo giá, xử lý objection sâu, chốt đơn, xin Zalo/email | `getLeadgenContext`, `calcTndsFee`, `updateLeadgenState` | (không) |

### Flow

```
┌─────────────────┐         handoff          ┌─────────────────┐
│  greetingAgent   │ ──────────────────────► │  mainSaleAgent   │
│  (BUC_1, BUC_2)  │  khi khách sẵn sàng    │  (BUC_3~BUC_5)   │
│                   │  nghe tư vấn tiếp      │                   │
└─────────────────┘                          └─────────────────┘
```

## Handoff logic

### greetingAgent (initial)

- Chào khách, giới thiệu đơn vị, mục đích gọi.
- Xử lý objection đầu phễu: bận, sai số, người nhà nghe máy, xe đã bán, đã gia hạn, từ chối...
- Khi khách xác nhận đúng người và sẵn sàng nghe tiếp:
  - Gọi `updateLeadgenState` chuyển `currentBuc` sang `BUC_3`.
  - Gọi `transferAgents` sang `mainSaleAgent`.
  - Không tạo text output trung gian.

### mainSaleAgent

- Xác nhận thông tin xe, khai thác slot còn thiếu (số chỗ, mục đích sử dụng, tải trọng).
- Báo giá bằng `calcTndsFee`, đọc sát `replyText` từ tool.
- Xử lý objection sâu: chê đắt, sợ lừa đảo, muốn ra đăng kiểm mua...
- Chốt đơn: xin Zalo hoặc email, hướng dẫn thanh toán online.

## Tooling

### 1. `getLeadgenContext`

Lấy context hiện tại của cuộc gọi. Gọi ở đầu lượt đầu tiên của mỗi agent.

**Parameters:** không có.

**Response:**

| Field | Mô tả |
|-------|-------|
| `state` | Session state đầy đủ (slots, pricing, outcome, counters) |
| `runtime` | Runtime context (override từ FE) |
| `scriptVars` | Biến dùng trong prompt (`{gender}`, `{BKS}`, `{discount_price}`...) |
| `pricingContext` | `{ vehicleType, missingSlots, canQuote }` |

### 2. `updateLeadgenState`

Cập nhật trạng thái cuộc gọi: chuyển BUC, lưu slot, đánh dấu outcome.

**Parameters:**

```json
{
  "currentBuc": "BUC_1 | BUC_2 | BUC_3 | BUC_4 | BUC_5",
  "slots": {
    "vehicleType": "car | pickup | truck",
    "numSeats": 5,
    "isBusiness": false,
    "weightTons": 2.5,
    "expiryDate": "2025-06-15",
    "brand": "Toyota",
    "color": "trắng",
    "zaloNumber": "0912345678",
    "email": "kh@mail.com",
    "address": "123 ABC",
    "paymentPreference": "cod | online"
  },
  "outcome": {
    "report": "Kết bạn Zalo thành công",
    "issueType": "Rejection | Technical | Action",
    "level": 2,
    "callOutcome": "Success | Rejection | Callback | NoAnswer",
    "followupAt": "2025-06-16T09:00:00Z"
  }
}
```

Tất cả field đều optional. Chỉ gửi field cần cập nhật.

### 3. `calcTndsFee`

Tính phí TNDS. Gọi trước khi báo giá cho khách hàng.

**Parameters:**

| Field | Type | Mô tả |
|-------|------|-------|
| `vehicleType` | `string` | `car`, `pickup`, `truck` |
| `seats` / `numSeats` | `number` | Số chỗ ngồi |
| `isBusiness` | `boolean` | Có kinh doanh vận tải không |
| `weightTons` | `number` | Tải trọng (tấn), dùng cho xe tải |
| `discountPercent` | `number` | Phần trăm giảm giá (mặc định 10) |

Tất cả optional. Tool tự fallback sang state nếu không truyền.

**Response quan trọng:**

| Field | Mô tả |
|-------|-------|
| `needMoreInfo` | `true` nếu chưa đủ dữ liệu để tính giá |
| `missing` | Danh sách slot còn thiếu |
| `replyText` | Câu báo giá đã format sẵn, agent phải đọc sát |
| `pricingContext` | Thông tin giá chi tiết |

## Input data (custom_data)

Dữ liệu đầu vào được truyền từ FE qua URL query params hoặc API trước khi kết nối cuộc gọi.

### Cấu trúc custom_data

```json
{
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
```

### Bảng field chi tiết

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `session_id` | `string` | Có | ID phiên gọi |
| `lead_id` | `string` | Có | ID lead |
| `phone_number` | `string` | Có | SĐT khách hàng |
| `agent_name` | `string` | Không | Tên tư vấn viên hiển thị (mặc định "Thảo") |
| `name` | `string` | Không | Tên khách hàng (mặc định "mình") |
| `gender` | `string` | Không | Xưng hô: "anh", "chị", "anh/chị" |
| `plate` | `string` | Có | Biển số xe |
| `vehicle_type` | `string` | Không | `car`, `pickup`, `truck` |
| `num_seats` | `number` | Không | Số chỗ ngồi |
| `is_business` | `boolean` | Không | Xe kinh doanh vận tải hay không |
| `weight_tons` | `number` | Không | Tải trọng xe tải (tấn) |
| `expiry_date` | `string` | Không | Ngày hết hạn bảo hiểm (YYYY-MM-DD) |
| `brand` | `string` | Không | Hãng xe (Toyota, Hyundai...) |
| `color` | `string` | Không | Màu xe |

## Session state

State được quản lý in-memory, cấu trúc đầy đủ:

### Slots (thông tin xe + liên hệ)

| Nhóm | Field | Type | Mô tả |
|------|-------|------|-------|
| Lead | `leadGender` | `string` | Xưng hô khách |
| Lead | `leadName` | `string` | Tên khách |
| Lead | `plateNumber` | `string` | Biển số xe |
| Xe | `vehicleType` | `string` | `car`, `pickup`, `truck` |
| Xe | `numSeats` | `number` | Số chỗ |
| Xe | `isBusiness` | `boolean` | Kinh doanh hay không |
| Xe | `purpose` | `string` | Derived từ `isBusiness` |
| Xe | `weightTons` | `number` | Tải trọng (tấn) |
| Xe | `expiryDate` | `string` | Ngày hết hạn BH |
| Xe | `brand` | `string` | Hãng xe |
| Xe | `color` | `string` | Màu xe |
| Liên hệ | `zaloNumber` | `string` | Số Zalo |
| Liên hệ | `email` | `string` | Email |
| Liên hệ | `address` | `string` | Địa chỉ |
| Liên hệ | `paymentPreference` | `string` | `cod` hoặc `online` |

### Pricing

| Field | Type | Mô tả |
|-------|------|-------|
| `listPrice` | `number` | Giá niêm yết |
| `discountPercent` | `number` | % giảm giá |
| `discountPrice` | `number` | Giá sau giảm |
| `savings` | `number` | Số tiền tiết kiệm |
| `giftInfo` | `string` | Quà tặng kèm |
| `priceQuoted` | `boolean` | Đã báo giá chưa |
| `priceAccepted` | `boolean` | Khách đã đồng ý giá chưa |

### Outcome

| Field | Type | Mô tả |
|-------|------|-------|
| `report` | `string` | Tóm tắt kết quả cuộc gọi |
| `issueType` | `string` | `Rejection`, `Technical`, `Action` |
| `level` | `number` | Mức độ (1-4) |
| `callOutcome` | `string` | `Success`, `Rejection`, `Callback`, `NoAnswer` |
| `followupAt` | `string` | Thời gian gọi lại (ISO) |
| `endedAt` | `string` | Thời gian kết thúc (auto) |

### Counters

| Field | Mô tả |
|-------|-------|
| `noHearCount` | Số lần khách bảo không nghe rõ |
| `silenceCount` | Số lần khách im lặng |
| `refusalCount` | Số lần khách từ chối |

## Script variables

Các biến được inject vào prompt, build từ state hiện tại:

| Biến | Nguồn | Mô tả |
|------|-------|-------|
| `{gender}` | `slots.leadGender` | Xưng hô |
| `{name}` | `slots.leadName` | Tên khách |
| `{agent_name}` | `runtime.displayAgentName` | Tên tư vấn viên |
| `{BKS}` | `slots.plateNumber` | Biển số xe |
| `{phone_number}` | `runtime.phoneNumber` | SĐT khách |
| `{num_seats}` | `slots.numSeats` | Số chỗ |
| `{purpose}` | derived từ `isBusiness` | "không kinh doanh" / "kinh doanh" |
| `{expiry_date}` | `slots.expiryDate` | Ngày hết hạn (dạng đọc tự nhiên) |
| `{list_price}` | `pricing.listPrice` | Giá niêm yết |
| `{discount_price}` | `pricing.discountPrice` | Giá sau giảm |
| `{savings}` | `pricing.savings` | Tiết kiệm |
| `{discount_percent}` | `pricing.discountPercent` | % giảm giá |
| `{gifts}` | `pricing.giftInfo` | Quà tặng |
| `{zalo_number}` | `slots.zaloNumber` | Số Zalo |
| `{email}` | `slots.email` | Email |
| `{vehicle_type}` | `slots.vehicleType` | Loại xe |
| `{weight_tons}` | `slots.weightTons` | Tải trọng |
| `{vehicle_description}` | derived | Mô tả xe tổng hợp |

## BUC stages

| Stage | Mô tả | Agent phụ trách |
|-------|-------|-----------------|
| `BUC_1` | Chào hỏi, giới thiệu, xác nhận đúng người | `greetingAgent` |
| `BUC_2` | Xử lý từ chối đầu phễu | `greetingAgent` |
| `BUC_3` | Xác nhận thông tin xe, khai thác slot còn thiếu | `mainSaleAgent` |
| `BUC_4` | Báo giá, nêu ưu đãi, thuyết phục | `mainSaleAgent` |
| `BUC_5` | Chốt đơn, xin Zalo/email, hướng dẫn thanh toán | `mainSaleAgent` |

## Chạy local

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

Các biến môi trường khác (tham khảo `.env.example`):

| Biến | Mô tả | Mặc định |
|------|-------|----------|
| `OPENAI_API_KEY` | API key OpenAI | (bắt buộc) |
| `NEXT_PUBLIC_OPENAI_MODEL` | Model Realtime | `gpt-realtime-mini` |
| `OPENAI_REWRITE_MODEL` | Model rewrite | `gpt-4.1-mini` |
| `REDIS_URL` | Redis connection | `redis://localhost:6372` |
| `NEXT_PUBLIC_TTS_MODE` | Chế độ TTS | `offline` |
| `TTS_WEBSOCKET_URI` | URI TTS WebSocket | |
| `ASR_PROXY_PORT` | Port ASR proxy | `8082` |
| `ASR_TOKEN` | Token xác thực ASR | |

### Chạy dev

```bash
npm run dev
```

Hoặc chạy background:

```bash
bash start.sh
```

`start.sh` sẽ tự kill tiến trình cũ trên port 8085 (web) và 8084 (ASR proxy), sau đó chạy ngầm.

### Mở browser

```
http://localhost:3000/?agentConfig=leadgenMultiAgent
```

## Lưu ý triển khai

- App chạy ở text-only mode cho output audio Realtime; audio phát ra được xử lý qua TTS service riêng.
- State được quản lý in-memory qua `leadgenV1/internal/sessionState.ts`.
- Runtime context được set từ `App.tsx` trước khi connect, nhận input từ URL query params.
- Nếu cần đổi scenario mặc định, sửa `defaultAgentSetKey` trong `src/app/agentConfigs/index.ts`.