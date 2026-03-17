# Tài liệu Kiến trúc Hệ thống Callbot Realtime Agents

Tài liệu này phân tích chi tiết về kiến trúc hệ thống, công nghệ sử dụng, và các luồng hoạt động chính của repository `callbot-realtime-agents`.

---

## 1. Công nghệ sử dụng (Tech Stack)

### Frontend
- **Framework:** Next.js 15 (App Router) với React 19.
- **Styling:** Tailwind CSS.
- **UI Components:** Radix UI Icons, React Markdown (để render transcript).
- **State Management:** React Hooks (`useState`, `useEffect`, `useRef`, Context API).
- **Audio/Media:** WebRTC, Web Audio API.

### Backend
- **Framework:** Next.js API Routes (`/api/*`).
- **Runtime:** Node.js.
- **Database/Cache:** Redis (quản lý state của session cuộc gọi).
- **Giao tiếp dịch vụ ngoài:** gRPC (`@grpc/grpc-js`, `@grpc/proto-loader`) để kết nối với các dịch vụ ASR (Speech-to-Text) và TTS (Text-to-Speech) nội bộ.
- **Proxy:** Sử dụng WebSockets (`ws`) cho ASR Proxy (`src/scripts/asr-proxy.ts`).

### AI & SDK
- **OpenAI Realtime SDK:** `@openai/agents` (phiên bản preview).
- **Mô hình:** `gpt-4o-mini-realtime-preview` (hoặc cấu hình qua biến môi trường).

---

## 2. Kiến trúc Hệ thống (Backend đến Frontend)

Hệ thống được thiết kế theo mô hình Client-Server kết hợp với Realtime WebRTC/WebSockets để xử lý luồng hội thoại độ trễ thấp.

### Frontend (`src/app/`)
- **`App.tsx`:** Component gốc quản lý toàn bộ trạng thái của cuộc gọi (Session Status, Agent hiện tại, cấu hình âm thanh). Nó khởi tạo kết nối với OpenAI Realtime API thông qua custom hook.
- **Hooks (`src/app/hooks/`):**
  - `useRealtimeSession.ts`: Quản lý kết nối WebRTC với OpenAI, xử lý handoff giữa các agent, gửi/nhận event.
  - `useTTS.ts`: Quản lý luồng gọi Text-to-Speech (khi app chạy ở chế độ text-only).
  - `useASR.ts`: Quản lý luồng ghi âm và gọi Speech-to-Text.
  - `useCallSession.ts` / `useHandleSessionHistory.ts`: Quản lý lịch sử và trạng thái cuộc gọi.
- **Contexts (`src/app/contexts/`):** Cung cấp state toàn cục cho Transcript (lịch sử chat), Events (log sự kiện), và Usage (thống kê token).
- **Components (`src/app/components/`):** Các UI component như `Transcript`, `BottomToolbar`, `Events`.

### Backend (`src/app/api/`)
- **`/api/session/route.ts`:** Gọi lên OpenAI API để tạo **Ephemeral Token** (Client Secret). Frontend dùng token này để kết nối trực tiếp với OpenAI Realtime API một cách an toàn mà không lộ API Key gốc.
- **`/api/state/route.ts`:** Lưu trữ và truy xuất trạng thái của cuộc gọi (ví dụ: agent cuối cùng đang nói chuyện) sử dụng Redis. Giúp phục hồi trạng thái nếu rớt mạng.
- **`/api/leadgen/call-context/route.ts`:** API nghiệp vụ để lấy thông tin khách hàng (Lead) từ database/CRM để tiêm (inject) vào lời chào mở đầu của Agent.
- **`/api/tts/route.ts` & gRPC:** Xử lý chuyển đổi văn bản thành giọng nói thông qua dịch vụ TTS riêng biệt.

---

## 3. Kiến trúc OpenAI SDK Realtime & Luồng Dữ Liệu (Data Flow)

Hệ thống sử dụng package `@openai/agents` để quản lý luồng Realtime.

1. **Khởi tạo kết nối:** 
   - Frontend gọi `/api/session` để lấy Ephemeral Token.
   - Sử dụng hàm `connect()` từ SDK, truyền vào danh sách các Agents (`initialAgents`) và cấu hình.
2. **Giao thức:** Kết nối được thực hiện qua WebRTC (hoặc WebSockets) trực tiếp từ trình duyệt của người dùng đến server của OpenAI (`wss://api.openai.com/v1/realtime`).
3. **Events:** Giao tiếp dựa trên kiến trúc hướng sự kiện (Event-driven). Các sự kiện như `session.update`, `conversation.item.create`, `response.create` được gửi qua lại liên tục.

### Chi tiết Luồng Dữ Liệu (Text-Only Mode)
Mặc dù OpenAI Realtime hỗ trợ xử lý âm thanh trực tiếp, hệ thống này được thiết kế và cấu hình ép chạy ở chế độ **Text-Only** (`isTextOnly: true` trong `App.tsx`) cho cả đầu vào và đầu ra. Nghĩa là OpenAI không trực tiếp nghe âm thanh hay phát ra âm thanh, mọi giao tiếp với OpenAI đều được quy về **Văn bản (Text)**.

**A. Luồng Đầu Vào (Input: Người dùng -> Hệ thống)**
Hệ thống hỗ trợ 2 phương thức nhập liệu song song:
- **Luồng Chat Text (Gõ phím):**
  - Người dùng nhập văn bản vào ô input trên giao diện (UI).
  - Khi nhấn gửi, Frontend gọi hàm `sendUserText()` của OpenAI SDK để đóng gói đoạn text thành event `conversation.item.create` và gửi thẳng lên server OpenAI.
- **Luồng Voice (Giọng nói qua Microphone):**
  - **Thu âm:** Microphone thu giọng nói của người dùng thông qua Web Audio API.
  - **Tiền xử lý:** Âm thanh thô được downsample (giảm tần số lấy mẫu) xuống 8000Hz (chuẩn điện thoại) để tối ưu băng thông.
  - **ASR Proxy (Speech-to-Text):** Dữ liệu âm thanh (PCM) được gửi liên tục qua WebSocket đến một module trung gian là **ASR Proxy** (chạy tại `ws://localhost:8082` hoặc cấu hình qua biến môi trường).
  - **Chuyển đổi:** ASR Proxy nhận diện giọng nói và trả về Text liên tục (kết quả `partial` để hiển thị chữ đang nói chạy realtime trên UI, và `isFinal` khi người dùng ngắt câu).
  - **Gửi lên OpenAI:** Khi nhận được câu hoàn chỉnh (`isFinal: true`), Frontend tự động lấy đoạn Text đó và gửi lên OpenAI (giống hệt như luồng Chat Text).
*(Lưu ý: Hệ thống có chế độ **Chat-only** thông qua biến `carebotChatOnly`. Khi bật chế độ này, luồng Voice và ASR sẽ bị vô hiệu hóa hoàn toàn, người dùng chỉ có thể giao tiếp bằng cách gõ Text).*

**B. Luồng Đầu Ra (Output: Hệ thống -> Người dùng)**
- **Nhận Text từ OpenAI:** Do cấu hình `isTextOnly: true`, OpenAI xử lý ngữ cảnh và chỉ trả về phản hồi dưới dạng **Text**.
- **Hiển thị UI:** Text được cập nhật realtime lên màn hình (Transcript) cho người dùng đọc.
- **TTS Service (Text-to-Speech):** Ngay khi có câu trả lời hoàn chỉnh, Frontend gọi API `/api/tts/route.ts` (kết nối với dịch vụ TTS nội bộ qua gRPC) để chuyển đổi đoạn Text đó thành giọng nói tiếng Việt tự nhiên.
- **Phát âm thanh:** File âm thanh/stream trả về từ TTS được phát ra loa cho người dùng nghe.

---

## 4. Kiến trúc Multi-Agent

Hệ thống áp dụng mô hình **Multi-Agent Routing** (Định tuyến đa tác vụ), cụ thể trong thư mục `src/app/agentConfigs/leadgenTNDSVer02/`.

- **Router Agent (`router/agent.ts`):** 
  - Đóng vai trò là "Lễ tân". Đây là agent đầu tiên tiếp nhận cuộc gọi.
  - Nhiệm vụ: Đọc thông tin ngữ cảnh, chào hỏi khách hàng, phân tích ý định (intent) của khách hàng.
  - Sau khi xác định được ý định, Router sẽ thực hiện **Handoff** (chuyển giao) cuộc gọi cho các Sub-agent chuyên trách.
- **Sub-Agents:**
  - **Sales Agent (`sales/agent.ts`):** Chuyên tư vấn giá, chốt sale, xin thông tin lên đơn.
  - **Objection Agent (`objection/agent.ts`):** Chuyên xử lý từ chối (khách chê đắt, khách bận, khách so sánh với bên khác).
- **Cơ chế Handoff:** Các agent được liên kết với nhau qua thuộc tính `handoffs`. Khi một agent nhận thấy câu hỏi vượt quá phạm vi của mình hoặc thuộc chuyên môn của agent khác, nó sẽ gọi một tool nội bộ để chuyển quyền điều khiển.
- **State Machine & Memory (`internal/`):** Lưu trữ ngữ cảnh hội thoại (session state, memory store) để khi chuyển đổi giữa các agent, thông tin không bị mất (ví dụ: agent Sales biết khách đã hỏi gì ở agent Objection).

---

## 5. Giải thích các lưu ý triển khai trong README.md (Dòng 160-164)

Dưới đây là phần làm rõ cho đoạn chú ý trong file `README.md`:

> **"- App đang chạy ở text-only mode cho output audio Realtime; audio phát ra được xử lý qua TTS service riêng."**
- **Giải thích:** Mặc định OpenAI Realtime API có thể tự sinh ra giọng nói (Audio). Tuy nhiên, để có giọng đọc tiếng Việt tự nhiên hơn hoặc theo chuẩn của doanh nghiệp, hệ thống đã tắt tính năng sinh audio của OpenAI (`isTextOnly: true`). Thay vào đó, OpenAI chỉ trả về văn bản (Text), sau đó Frontend sẽ gửi văn bản này đến một dịch vụ TTS (Text-to-Speech) nội bộ qua gRPC để tạo ra file âm thanh và phát cho người dùng nghe.

> **"- Router có cơ chế inject opening từ API bằng `createLeadgenRouterAgent(openingText)`."**
- **Giải thích:** Để tránh việc AI tự bịa (hallucinate) lời chào hoặc xưng hô sai, lời chào đầu tiên không do AI tự nghĩ ra. Hệ thống sẽ gọi API `/api/leadgen/call-context` để lấy dữ liệu thật của khách (Tên, Giới tính, Biển số xe...). Sau đó, một câu chào chuẩn (openingText) được tạo ra và "tiêm" (inject) trực tiếp vào Router Agent ngay khi khởi tạo. Agent sẽ bắt buộc phải đọc đúng câu chào này.

> **"- Nếu cần đổi scenario mặc định, sửa `defaultAgentSetKey` trong `src/app/agentConfigs/index.ts`."**
- **Giải thích:** Hệ thống hỗ trợ nhiều kịch bản (scenario) khác nhau (ví dụ: `leadgenTNDS`, `customerServiceRetail`, `bidvBot`). Biến `defaultAgentSetKey` quy định kịch bản nào sẽ được load lên đầu tiên khi người dùng mở trang web mà không truyền tham số trên URL. Nếu muốn đổi kịch bản mặc định khi khởi động app, chỉ cần thay đổi giá trị của biến này.