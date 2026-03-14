## Tổng quan dự án Voice AI Backend

Dự án này là backend VoiceBot cho **telecenter**, kết hợp:
- **FreeSWITCH**: điều khiển cuộc gọi (originate, playback, record, transfer, hangup).
- **Viettel TTS / STT**: chuyển đổi giữa text và tiếng nói.
- **OpenAI/Qwen**: xử lý hội thoại và logic AI.
- **Kafka**: log lịch sử cuộc gọi và kết quả (call history, call result).

Luồng cơ bản cho một cuộc gọi:
1. Hệ thống gọi ra (API `/api/call` → FreeSWITCH originate).
2. Cuộc gọi được trả lời (`CHANNEL_ANSWER` từ FreeSWITCH).
3. Bot phát lời chào (TTS → FreeSWITCH → khách).
4. Khách nói → ghi âm → STT → text.
5. OpenAI xử lý hội thoại → trả về text bot.
6. Bot trả lời qua TTS → FreeSWITCH phát ra.
7. Vòng lặp 4–6 cho tới khi kết thúc / chuyển máy.

---

## Prompt và quản lý hội thoại với OpenAI

### Prompt

Prompt dùng cho OpenAI nằm ở lớp `ai.OpenAI` và `session`:

- **BotPrompt** (system prompt):
  - Truyền vào `GetResponse` / `GetStreamResponse` của `OpenAI` dưới dạng `system` message.
  - Nguồn:
    - Từ API `/api/call` (`bot_prompt`) hoặc mặc định:  
      `"Bạn là trợ lý ảo thân thiện và chuyên nghiệp."`
    - Được `RegisterBotInfo` trong `session.Manager` xử lý thêm:
      - Thay template với `CustomerInfo`.
      - Bổ sung ngữ cảnh thời gian hiện tại (ngày, giờ VN).
      - Ghép thêm `SystemRules` và `CampaignRules` thành phần **quy tắc bắt buộc**.

- **BargeInPrompt**:
  - System prompt dùng cho hàm `DecideBargeIn` (quyết định có cho phép ngắt lời bot hay không).
  - Nguồn:
    - Từ API `/api/call` (`barge_in_prompt`) hoặc mặc định:  
      `"Bạn là bộ phân loại ý định ngắt lời cho Bot. Phân tích câu nói của khách hàng và trả về '0' hoặc '1'."`

### Quản lý lịch sử hội thoại

Lịch sử hội thoại được lưu trong RAM trong từng `CallSession`:

- Cấu trúc:
  - `CallSession.History []Message`
  - `Message` gồm: `Role` (`user`/`assistant`), `Content`, `OriginContent`, `TurnID`, `Timestamp`.
- Ghi message:
  - Khi STT trả về câu cuối cùng (final): thêm `"user"` message.
  - Khi bot phát xong (hoặc bị barge‑in, hoặc hangup): thêm `"assistant"` message (phần text mà khách thực sự nghe).
  - Mỗi lượt hội thoại tăng `TurnID`; logic tránh ghi đè assistant message cho cùng một turn.
- Đọc history:
  - `GetHistory()` trả về bản copy slice để truyền vào:
    - `GetStreamResponse(history, BotPrompt, ...)`.
    - `DecideBargeIn(history, BargeInPrompt, botText, userText)`.

---

## Giao tiếp với FreeSWITCH (Event Socket Layer)

Hệ thống kết nối **trực tiếp** tới **Event Socket Layer (ESL)** do FreeSWITCH cung cấp (`mod_event_socket`), **không qua adapter/proxy**:

- Cấu hình trong `config.yaml`:
  - `freeswitch.host`: ví dụ `127.0.0.1:8021`.
  - `freeswitch.password`: ví dụ `ClueCon`.
  - `freeswitch.domain`: domain để originate/transfer.
- Thư viện: `github.com/fiorix/go-eventsocket/eventsocket`.

### Kết nối & nhận event

- `NewEventSocket` tạo struct `EventSocket` và chạy goroutine `maintainConnection`:
  - Kết nối tới ESL qua `eventsocket.Dial(host, password)`.
  - Đăng ký event bằng lệnh `event plain <EVENT_NAME>`:
    - `CHANNEL_ANSWER`, `CHANNEL_HANGUP`, `CHANNEL_HANGUP_COMPLETE`, `PLAYBACK_STOP`.
  - Gọi `HandleEvents()` để đọc event liên tục (blocking).
- `processEvent`:
  - Lấy `Event-Name` và `Unique-Id` (UUID kênh).
  - Dispatch tới handler đã đăng ký (`RegisterHandler`).
- Trong `main.go`:
  - `CHANNEL_ANSWER` → `handleAnswer`.
  - `CHANNEL_HANGUP` → `handleHangup`.
  - `CHANNEL_HANGUP_COMPLETE` → `handleHangupComplete`.
  - `PLAYBACK_STOP` → `handlePlaybackStop`.

### Gửi lệnh điều khiển

Qua ESL, app gửi lệnh điều khiển call:

- `SendAPI("originate ...")` → gọi ra (outbound) và nhận UUID.
- `uuid_broadcast` → phát audio (TTS) vào kênh.
- `uuid_break` → dừng phát (dùng cho barge‑in).
- `uuid_record start/stop` → ghi âm kênh vào file/FIFO.
- `uuid_setvar`, `uuid_getvar` → set/get biến trên kênh (vd `call_bot_id`, tham số record).
- `uuid_transfer` → chuyển cuộc gọi.
- `uuid_kill` → kết thúc cuộc gọi.

ESL đóng vai trò **kênh điều khiển call & media**, không chở audio payload.

---

## Streaming audio và phối hợp với FreeSWITCH

### Downlink: Bot nói → TTS → FreeSWITCH → khách

1. **AI trả text**:
   - `GetStreamResponse` stream từng phần câu trả lời qua `openaiChan`.
2. **Gửi text tới TTS (WebSocket)**:
   - `ViettelTTS.Connect()`:
     - Kết nối WebSocket tới `viettel.tts_websocket_url`.
     - Authenticate với `tts_api_key`, chọn voice, resample_rate=8000.
     - Bắt đầu goroutine `receiveLoop()` để nhận audio chunks.
   - `SendText(text, endOfInput)` gửi từng đoạn text cho Viettel TTS.
3. **Nhận PCM từ TTS**:
   - `receiveLoop`:
     - `ReadJSON` liên tục, mỗi message chứa `audio` (base64 PCM), `isFinal`, `duration`, `text`...
     - Decode base64 → `TTSChunk.RawPCM []byte`.
     - Đẩy vào `resultChan`.
4. **Ghi PCM vào FIFO cho FreeSWITCH**:
   - App tạo FIFO file TTS (vd `/dev/shm/voicebot/tts/tts_<uuid>.raw`).
   - Gọi `StreamPCMToFIFO(fifoPath, onChunkReceived)`:
     - Mở FIFO để ghi.
     - Với mỗi `TTSChunk` từ `resultChan`:
       - Gọi callback `onChunkReceived` để lưu `Fragments` (text + duration) phục vụ tính phần khách đã nghe (barge‑in).
       - Ghi `chunk.RawPCM` vào FIFO.
       - Khi `IsFinal=true` hoặc FIFO bị đóng (broken pipe) → kết thúc.
   - ESL gọi `uuid_broadcast` / `PlayAudio(uuid, fifoPath)` để FreeSWITCH đọc FIFO và phát ra kênh.
5. **Kết thúc phát**:
   - FreeSWITCH gửi event `PLAYBACK_STOP`.
   - `handlePlaybackStop`:
     - Tính phần khách đã nghe (`CalculateActualSpokenText`) từ `Fragments` và `StartPlayTime`.
     - Lưu `assistant` message tương ứng vào history.
     - Nếu status `pending_hangup` → `uuid_kill`.
     - Nếu `pending_transfer` → `uuid_transfer`.

### Uplink: Khách nói → FreeSWITCH → STT (gRPC) → text

1. **Bắt đầu ghi từ FreeSWITCH**:
   - Trong `startListening(uuid)`:
     - Tạo `ViettelSTT` client (`NewViettelSTT` kết nối gRPC tới `viettel.stt_grpc_addr`).
     - Tạo FIFO record (vd `/dev/shm/voicebot/recordings/record_<uuid>.raw`).
     - Gọi `StartRecording(uuid, recordFile)`:
       - Thiết lập các biến record (mono, 8000Hz, non‑buffered).
       - `uuid_record <uuid> start <file> 8000 1`.
2. **Streaming PCM từ FIFO → STT (gRPC)**:
   - Mở FIFO để đọc, tạo goroutine:
     - Đọc buffer nhỏ (ví dụ 2000 bytes).
     - Đo RMS (`GetRMS`) để log mức âm thanh.
     - Gọi `stt.SendAudio(sttStream, chunk)` với mỗi buffer.
   - Song song đó, goroutine khác gọi:
     - `stt.ReceiveResults(sttStream, resultChan)`:
       - `Recv()` liên tục từ gRPC.
       - Mỗi kết quả → `STTResult{Text, OriginalText, IsFinal, Confidence, ...}` gửi ra `resultChan`.
3. **Kết hợp với VAD & logic AI**:
   - VAD theo dõi luồng `STTResult` và mức âm thanh:
     - Xác định khi nào có tiếng nói, khi nào im lặng đủ để “chốt câu”.
   - Khi chốt được câu cuối cùng `finalText`:
     - Gọi `processSTTResultsStream(uuid, finalText)`:
       - Tăng `TurnID`, lưu `"user"` message vào history.
       - Gọi `GetStreamResponse` với `session.GetHistory()` + `BotPrompt`.
       - Bắt đầu luồng TTS + playback như phần Downlink.
4. **Dừng ghi khi cần**:
   - Khi bot bắt đầu nói hoặc call sắp kết thúc, app có thể:
     - `StopRecording(uuid, recordFile)` qua ESL.
     - Hủy context đọc FIFO/STT.

### Vai trò ESL trong luồng audio

- ESL **không mang data audio**, mà:
  - Ra lệnh cho FreeSWITCH:
    - Ghi âm vào FIFO (uuid_record).
    - Phát audio từ FIFO/file (uuid_broadcast).
    - Ngắt phát (uuid_break).
    - Kết thúc hoặc chuyển cuộc gọi (uuid_kill, uuid_transfer).
  - Cung cấp event signal (CHANNEL_ANSWER, PLAYBACK_STOP, HANGUP, ...) để app đồng bộ trạng thái với media.
- Audio thực tế đi qua:
  - **WebSocket** (Viettel TTS) giữa app ↔ dịch vụ TTS.
  - **gRPC streaming** (Viettel STT) giữa app ↔ dịch vụ STT.
  - **FIFO files** giữa app ↔ FreeSWITCH.

---

## Log và báo cáo kết quả cuộc gọi

### Call History (topic Kafka `call_history`)

- Gửi khi `cleanup(uuid)` chạy (sau `CHANNEL_HANGUP_COMPLETE`).
- Payload từ `CallSession.GetKafkaPayload()`:
  - `call_id`, `call_bot_id`, `phone`, `caller_id`.
  - `status`, `start_time`, `answer_time`, `end_time`.
  - `history`: toàn bộ lịch sử hội thoại (user/assistant + timestamp, turn).

### Call Result (topic Kafka `call_result`)

- Dùng để báo cáo **kết quả/lệnh** mà bot/AI quyết định:
  - Khi AI trả về command trong text (ví dụ `[COMMAND] TRANSFER:1000`):
    - `TRANSFER` → gửi `SendCallResult(call_bot_id, "TRANSFER", value)`.
    - `CALLBACK` → gửi `SendCallResult(call_bot_id, "CALLBACK", value)`.
    - Lệnh khác → `SendCallResult(call_bot_id, cmd, "")`.
- Payload:
  - `call_bot_id`, `result` (tên lệnh), `detail` (tham số kèm theo nếu có).

Nhờ 2 topic này, hệ thống downstream có thể:
- Xây dựng báo cáo, lịch sử chi tiết cho từng cuộc gọi.
- Theo dõi kết quả xử lý (chuyển máy, callback, kết thúc bình thường, ...).

