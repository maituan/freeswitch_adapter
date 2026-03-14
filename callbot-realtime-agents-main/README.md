# Realtime API Agents - Leadgen TNDS

Hệ thống callbot outbound cho kịch bản bán bảo hiểm TNDS ô tô, xây trên Next.js + OpenAI Realtime Agents SDK.

README này mô tả theo code hiện tại trong `src/app/agentConfigs/leadgenTNDS`.

## Tổng quan

- Scenario mặc định của app là `leadgenTNDS`.
- Agent mặc định là router `leadgenTNDS`.
- Luồng chạy theo mô hình multi-agent: router -> pricing/faq/closer/fallback.
- Có tích hợp ASR proxy (`ws://localhost:8082`) để hỗ trợ voice input.
- UI chạy tại `http://localhost:3000`.

## Kiến trúc agent `leadgenTNDS`

Thư mục chính:

```text
src/app/agentConfigs/leadgenTNDS/
├── index.ts
├── tools.ts
├── pricingData.ts
├── faqData.ts
├── router/
│   ├── agent.ts
│   └── instructions.ts
├── pricing/
│   ├── agent.ts
│   └── instructions.ts
├── faq/
│   ├── agent.ts
│   └── instructions.ts
├── closer/
│   ├── agent.ts
│   └── instructions.ts
└── fallback/
    ├── agent.ts
    └── instructions.ts
```

Danh sách agent trong scenario:

1. `leadgenTNDS` (router, root agent)
2. `leadgenPricingAgent`
3. `leadgenFaqAgent`
4. `leadgenCloserAgent`
5. `leadgenFallbackAgent`

## Routing logic (cấp 1)

Router `leadgenTNDS` chịu trách nhiệm:

- Lượt đầu bắt buộc gọi tool `getLeadContext` để lấy call context.
- Mở đầu theo `openingText` từ context (không hardcode thông tin khách).
- Chuyển đúng agent theo intent:
  - xác thực đơn vị / "em ở đâu" -> `leadgenFaqAgent`
  - hỏi giá / ưu đãi / chiết khấu -> `leadgenPricingAgent`
  - đồng ý đi tiếp / chốt kênh -> `leadgenCloserAgent`
  - bận / từ chối / sai người / ngoài phạm vi -> `leadgenFallbackAgent`

## Tooling trong `leadgenTNDS`

Hiện tại có 6 tools chính:

1. `getLeadContext`
   - Đọc dữ liệu lead từ `/api/leadgen/call-context`.
   - Trả về `openingText` đã chuẩn hóa xưng hô để mở lời.
2. `calcTndsFee`
   - Tính phí TNDS theo loại xe, số chỗ/trọng tải, kinh doanh/không kinh doanh.
   - Trả giá niêm yết + giá theo mức chiết khấu.
3. `lookupTndsFaq`
   - Tra FAQ theo câu hỏi khách (match theo keyword + normalize tiếng Việt).
4. `createLeadOrUpdate`
   - Lưu/cập nhật lead state trong memory store.
5. `scheduleFollowup`
   - Lên lịch follow-up D1/D2/D3 theo kênh `zalo` hoặc `call`.
6. `handoffHuman`
   - Đánh dấu yêu cầu chuyển tư vấn viên.

## Pricing data

Bảng phí nằm tại `pricingData.ts`:

- `nonBusinessBands`: xe không kinh doanh.
- `businessBands`: xe kinh doanh theo số chỗ.
- `truckBands`: xe tải theo trọng tải / đầu kéo.
- VAT hiện dùng `vatRate = 0.1`.
- Có hỗ trợ discount: `20 | 25 | 30 | 35 | 40`.

## FAQ data

Nguồn FAQ nằm tại `faqData.ts`, gồm các nhóm chính:

- xác thực đơn vị / nguồn data
- quy trình mua online, thanh toán, hóa đơn
- giao nhận bản cứng, bản điện tử, tra cứu QR
- so sánh giá, quyền lợi, tình huống đã gia hạn

`leadgenFaqAgent` bắt buộc gọi `lookupTndsFaq` trước khi trả lời.

## Guardrails đang bật cho leadgen

Tại `App.tsx`, khi chạy scenario `leadgenTNDS`:

- Bật `createLeadgenOpeningGuardrail()`
  - Chặn các lỗi mở lời sai quy tắc (ví dụ dùng "anh/chị" sai format).
  - Ép router handoff đúng hướng theo intent.
- Bật `createLeadgenFaqToolRequiredGuardrail()`
  - Ép `leadgenFaqAgent` phải gọi `lookupTndsFaq`.
  - Ép handoff đúng trong các trường hợp cần chuyển pricing/fallback.

## API liên quan leadgen

- `GET /api/leadgen/call-context`
  - Query: `leadId` hoặc `phoneNumber` (optional).
  - Nếu không truyền, route trả lead demo mặc định `LD001`.
- `GET /api/state` và `POST /api/state`
  - Dùng để lưu/đọc trạng thái cuộc gọi theo `agentConfig` + `sessionId`.

## Chạy local

## 1) Yêu cầu

- Node.js 18+
- npm
- `OPENAI_API_KEY`

## 2) Cài đặt

```bash
npm install
cp .env.sample .env
```

Cập nhật `.env` tối thiểu:

```env
OPENAI_API_KEY=your_api_key
ASR_TOKEN=test_token
```

## 3) Chạy dev

```bash
npm run dev
```

Lệnh dev sẽ chạy đồng thời:

- Next.js app tại `http://localhost:3000`
- ASR proxy tại `ws://localhost:8082`

## 4) Mở đúng scenario

Mặc định đã là `leadgenTNDS`. Có thể mở trực tiếp:

- `http://localhost:3000/?agentConfig=leadgenTNDS`

## Một số lưu ý triển khai

- App đang chạy ở text-only mode cho output audio Realtime; audio phát ra được xử lý qua TTS service riêng.
- Router có cơ chế inject opening từ API bằng `createLeadgenRouterAgent(openingText)`.
- Nếu cần đổi scenario mặc định, sửa `defaultAgentSetKey` trong `src/app/agentConfigs/index.ts`.

## License

MIT - xem file `LICENSE`.
