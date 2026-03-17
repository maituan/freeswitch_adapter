# Phân tích kiến trúc `leadgenTNDSVer02`

Tài liệu này phân tích toàn diện kịch bản trong `code-example/src/app/agentConfigs/leadgenTNDSVer02/` theo 4 trục:
- Agent và trách nhiệm từng agent
- Tool và side-effect dữ liệu
- Luồng vận hành end-to-end
- Ưu/nhược điểm kiến trúc, tập trung vào rủi ro độ trễ (latency)

---

## 1) Bản đồ tổng quan kiến trúc

### 1.1 Thành phần chính
- `router`: tiếp nhận turn đầu và định tuyến.
- `sales`: xử lý tư vấn giá, báo giá, chốt thông tin.
- `objection`: xử lý từ chối/ngoại lệ/callback.
- `tools.ts`: lớp nghiệp vụ trung tâm (state, intent classify, policy, reply template, pricing).
- `internal/*`: logic policy/guardrail/memory/state machine.
- `script/ver02Intents.ts`: kho thoại mẫu (template theo mode).

### 1.2 Quan hệ handoff nội bộ
- `router -> sales | objection`
- `sales -> objection`
- `objection -> sales`

Lưu ý: handoff là nội bộ SDK, prompt của cả 3 agent đều ép không được nói "chuyển bộ phận/chuyển máy" với khách.

---

## 2) Agent làm gì?

## 2.1 `leadgenRouterAgent`
- Vai trò: mở đầu, identity clarification, xử lý `no_hear/silence`, route sang nhánh đúng.
- Không ôm flow báo giá chi tiết.
- Bắt buộc gọi `getLeadgenVer02Context` ở lượt đầu và `evaluateLeadgenTurn` mỗi lượt khách.
- Tools gắn:
  - `getLeadgenVer02Context`
  - `getLeadgenSessionState`
  - `evaluateLeadgenTurn`
  - `updateLeadgenSessionState`
  - `bumpLeadgenCounter`
  - `buildLeadgenReplyHint`

## 2.2 `leadgenSalesAgent`
- Vai trò: BUC_3/BUC_4/BUC_5 (khai thác slot xe, báo giá, FAQ bán hàng, chốt contact).
- Bắt buộc gọi `calcTndsFee` khi đủ slot trước khi đọc giá.
- Tools gắn:
  - `getLeadgenSessionState`
  - `evaluateLeadgenTurn`
  - `updateLeadgenSessionState`
  - `appendLeadgenMemorySummary`
  - `buildLeadgenReplyHint`
  - `calcTndsFee`
  - `createLeadOrUpdate`
  - `scheduleFollowup`

## 2.3 `leadgenObjectionAgent`
- Vai trò: xử lý từ chối cứng/mềm, busy/callback, sai số, xe công ty...
- Có thể handoff ngược về sales khi khách quay lại mạch mua.
- Tools gắn:
  - `getLeadgenSessionState`
  - `evaluateLeadgenTurn`
  - `updateLeadgenSessionState`
  - `bumpLeadgenCounter`
  - `buildLeadgenReplyHint`
  - `appendLeadgenMemorySummary`
  - `markLeadgenOutcome`
  - `createLeadOrUpdate`
  - `scheduleFollowup`

---

## 3) Tool làm gì?

## 3.1 Nhóm context/state
- `getLeadgenVer02Context`: lấy lead context + merge override FE/runtime + trả `openingText`.
- `getLeadgenSessionState`: đọc payload hiện tại (`state`, `memory`, `events`).
- `updateLeadgenSessionState`: merge patch vào state và persist.
- `bumpLeadgenCounter`: tăng/reset counter (`noHear`, `silence`, `refusal`, `clarify`, `callbackRequest`).
- `appendLeadgenMemorySummary`: append memory ngắn (trim 700 ký tự) + ghi event.
- `markLeadgenOutcome`: chốt outcome cuộc gọi + thời điểm kết thúc.

## 3.2 Nhóm quyết định hội thoại
- `evaluateLeadgenTurn`:
  - gọi classifier (`classifyLeadgenVer02Turn`)
  - chạy policy (`decideTurnPolicy`)
  - cập nhật state (`currentBuc`, `lastIntent`, `nextExpectedAction`, `quoteVariant`)
  - sinh `prompts.replyText` theo script mode nếu có
  - trả `policy`, `intent`, `prompts`, `state`
- `buildLeadgenReplyHint`: sinh thoại theo mode từ state hiện tại.

## 3.3 Nhóm pricing/sales side-effect
- `calcTndsFee`:
  - resolve tham số từ args + slot state
  - gọi `calculateTndsFee` (import từ bản leadgen cũ)
  - persist kết quả pricing (`listPrice`, `discountPrice`, `savings`, `quoteVariant`)
  - trả kèm `replyText` quote.
- `createLeadOrUpdate`, `scheduleFollowup`: tool dùng chung từ config cũ, phục vụ CRM/follow-up.

---

## 4) Luồng đi của hệ thống (runtime flow)

## 4.1 Trước khi connect
- `App.tsx` set runtime context cho ver02 bằng:
  - `sessionId`, `leadId`, `phoneNumber`
  - override từ UI: gender/name/plate/vehicleType/seats/isBusiness/weight/expiryDate
- Khi connect scenario `leadgenTNDSVer02`, app rebuild root agent bằng `createLeadgenVer02RouterAgent()`.
- Guardrail output gắn vào session: `createLeadgenVer02EvaluateGuardrail()`.

## 4.2 Turn đầu tiên
1. Router gọi `getLeadgenVer02Context`.
2. Tool lấy call context từ `/api/leadgen/call-context`, merge state hiện có, persist `/api/state`.
3. Router đọc `openingText` đã chuẩn hóa từ script/template.

## 4.3 Mỗi turn khách mới
1. Agent hiện tại gọi `evaluateLeadgenTurn(userMessage, agentName)`.
2. Tool classify intent qua `/api/responses` (model classifier, JSON schema).
3. Tool policy quyết định `requiredAction` (`chat`, `handoff_sales`, `handoff_objection`, `quote`, `capture_contact`, `endcall`, `clarify`).
4. Tool cập nhật/persist state mới vào `/api/state`.
5. Agent:
   - nếu có `prompts.replyText`: bắt buộc đọc đúng câu đó.
   - nếu `requiredAction` là handoff: handoff nội bộ sang agent tương ứng.
   - nếu quote path: sales gọi `calcTndsFee`.

## 4.4 Guardrail can thiệp ở output
Guardrail ver02 chặn các lỗi chính:
- Không gọi `evaluateLeadgenTurn` trước khi trả lời.
- Tự paraphrase khi tool đã trả `replyText`.
- Dùng câu "chờ em kiểm tra giá" sai thời điểm (`calcTndsFee` chưa gọi hoặc đã gọi rồi).
- Dùng wording lộ handoff nội bộ.
- Tự hỏi "1 năm hay 2 năm" trái policy mặc định annual.
- Case handoff mà tự nói filler không đúng chuẩn.

---

## 5) State machine và memory

## 5.1 State session
- State giàu domain, gồm:
  - vị trí flow (`currentAgent`, `currentBuc`)
  - intent gần nhất
  - counters retry/objection/callback
  - slots xe + contact
  - pricing status và quote variant
  - outcome/followup

## 5.2 BUC mapping
- `BUC_1`: opening/identity/no-hear/silence.
- `BUC_2`: objection/callback/wrong number.
- `BUC_3`: thu thập thông tin xe.
- `BUC_4`: pricing/quote/accept.
- `BUC_5`: capture contact/chốt.

## 5.3 Memory/event
- Memory là summary string nén, phục vụ continuity nhanh.
- Events lưu timeline hành động memory/outcome.
- Có local cache theo key `agentConfig:sessionId` để giảm đọc lặp.

---

## 6) Ưu điểm kiến trúc hiện tại

- Tách vai trò agent rõ ràng, đúng domain (router/sales/objection), dễ mở rộng prompt theo nghiệp vụ.
- Tool-centric orchestration: quyết định chính gom về `evaluateLeadgenTurn`, giảm "drift" giữa prompt và code.
- State/policy có cấu trúc tốt, đủ để phục vụ báo cáo và hành động follow-up.
- Guardrail sâu theo nghiệp vụ ver02 (không chỉ moderation chung), giảm sai kịch bản quan trọng.
- Script template + mode giúp thoại nhất quán, giảm nguy cơ model "sáng tác" ngoài kịch bản.
- Runtime override từ FE giúp cá nhân hóa nhanh mà không cần sửa code.

---

## 7) Nhược điểm và rủi ro

## 7.1 Rủi ro latency (điểm bạn đang lo là có cơ sở)
- Mỗi turn có thể gọi nhiều network hop tuần tự:
  - `/api/state` read
  - `/api/responses` classify
  - `/api/state` write
  - có thể thêm `calcTndsFee`, `createLeadOrUpdate`, `scheduleFollowup`
- Nếu agent gọi thêm `getLeadgenSessionState` trước/sau evaluate, số call tăng tiếp.
- Guardrail chạy sau output, parse history/tool calls phức tạp; nếu tripwire nhiều sẽ tăng vòng phản hồi.
- Nhiều tool "bắt buộc" trong prompt -> tăng số bước reasoning + tool invocation.

## 7.2 Rủi ro dữ liệu/state
- `patchLeadgenVer02StoredPayload` trả `{ok: true}` cả khi POST `/api/state` fail (fail-open), có thể lệch giữa local cache và persistent store.
- Local cache chỉ theo process/tab; không giải quyết race giữa nhiều client cùng session.
- `shallowMergeState` không có schema validation runtime ở mức domain logic (chủ yếu shape-level), dễ ghi state "hợp lệ kiểu" nhưng sai nghiệp vụ.

## 7.3 Rủi ro maintainability
- `tools.ts` rất lớn (nhiều trách nhiệm: parser, policy glue, template, side effect), khó test/trace lỗi.
- Logic reply mode/policy phân tán giữa `turnPolicy`, `tools.ts`, `script`, `instructions`, `guardrail` -> nguy cơ lệch behavior khi update một phía.
- Prompt phụ thuộc mạnh vào tuân thủ thủ công của model; dù có guardrail nhưng vẫn có chi phí sửa vòng lặp khi vi phạm.

---

## 8) Vì sao có thể "lâu": phân tích critical path theo turn

Một turn điển hình (sales/objection) thường là:
1. `evaluateLeadgenTurn`:
   - fetch state
   - classify intent (LLM call)
   - patch state
2. Agent tạo câu trả lời hoặc handoff.
3. Có thể gọi thêm:
   - `calcTndsFee` (thêm fetch+compute+patch)
   - `appendLeadgenMemorySummary` (fetch+patch)
   - CRM/followup tools.

=> Nếu network backend/realtime dao động, tổng latency cảm nhận có thể tăng rõ vì nhiều bước nối tiếp, không phải vì 1 call đơn lẻ.

---

## 9) Đề xuất tối ưu thời gian (ưu tiên thực thi)

## 9.1 Quick wins (ít đụng kiến trúc)
- Giảm số lần tool không bắt buộc:
  - Chỉ gọi `getLeadgenSessionState` khi thực sự cần hiển thị/debug.
  - Ưu tiên dùng output từ `evaluateLeadgenTurn` luôn, tránh gọi thêm `buildLeadgenReplyHint` nếu đã có `replyText`.
- Gom update state:
  - Hạn chế gọi `updateLeadgenSessionState` thủ công ngay sau `evaluateLeadgenTurn` nếu không có thay đổi mới.
- Giảm guardrail trip:
  - Tinh chỉnh prompt để model ít vi phạm rule "must use replyText" và "no transfer wording", vì mỗi lần tripwire là thêm vòng trả lời.

## 9.2 Medium-term (nên làm để giảm latency bền vững)
- Tách `evaluateLeadgenTurn` thành fast path:
  - Trường hợp intent rõ và không cần classify sâu (ví dụ empty/no_hear) có thể rule-based trước, chỉ fallback lên LLM classifier khi cần.
- Gộp read+write state trong backend endpoint chuyên dụng cho evaluate (atomic evaluate API), giảm roundtrip.
- Thêm telemetry latency theo từng tool (p50/p95/p99) để biết nghẽn chính xác nằm ở classify, state API hay CRM tool.

## 9.3 Longer-term (nếu scale lớn)
- Refactor `tools.ts` theo module:
  - `stateService`, `replyService`, `policyService`, `pricingService`.
- Dùng hàng đợi/background cho các thao tác không cần blocking ngay (một số memory/event/CRM sync).
- Bổ sung concurrency control/versioning cho state store để tránh lost update.

---

## 10) Kết luận ngắn gọn

Kiến trúc `leadgenTNDSVer02` đang đi đúng hướng về chất lượng hội thoại và kiểm soát nghiệp vụ (state + policy + guardrail rất chặt). Tuy nhiên, cái giá phải trả là nhiều bước tool/network tuần tự trong mỗi turn, nên lo ngại "thời gian phản hồi lâu" là hoàn toàn hợp lý.

Nếu cần tối ưu ngay mà ít rủi ro, ưu tiên:
1) giảm tool call dư thừa quanh `evaluateLeadgenTurn`,
2) giảm guardrail trip loop,
3) đo latency theo từng tool để chốt điểm nghẽn thật.
