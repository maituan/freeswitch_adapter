# Đánh giá các phương án kiến trúc cho bài toán Leadgen TNDS

Bài toán Leadgen TNDS của bạn có đặc thù:
1. **Kịch bản rất chặt chẽ (BUC_1 -> BUC_5):** Cần nói đúng câu, đúng từ, đúng luồng.
2. **Nhiều edge cases:** Khách im lặng, không nghe rõ, từ chối nhiều lần, hỏi vặn vẹo.
3. **Yêu cầu độ trễ thấp:** Gọi điện thoại mà bot nghĩ quá 1.5s là khách cúp máy.
4. **Cần thu thập dữ liệu chính xác:** Số chỗ, mục đích kinh doanh, ngày hết hạn để tính phí.

Dưới đây là phân tích 3 cách tiếp cận:

---

## Cách 1: Kiến trúc như `leadgenTNDSVer02` (Code Example cũ)
**Mô tả:** Có 3 agents (`router`, `sales`, `objection`). Mỗi turn đều gọi tool `evaluateLeadgenTurn` (chứa logic phân loại intent bằng rule/LLM) để quyết định policy, sau đó trả về text cho model đọc.

**Ưu điểm:**
- Tách biệt rõ ràng logic điều hướng (code JS/TS) và logic giao tiếp (LLM).
- Dễ dàng can thiệp bằng code (ví dụ: hardcode nếu intent = X thì trả câu Y).

**Nhược điểm (Rất lớn):**
- **Độ trễ cao (Latency):** Mỗi lượt nói, model phải quyết định gọi tool -> đợi tool chạy (có thể gọi thêm LLM để classify) -> nhận kết quả -> sinh câu trả lời. Quá trình này cộng dồn độ trễ mạng và processing, dễ làm cuộc gọi bị "lag".
- **Rối rắm, khó bảo trì:** Logic bị xé lẻ giữa prompt của 3 agents, tool `evaluate`, file `intentClassifier`, file `turnPolicy`. Sửa một câu thoại phải mò qua 3-4 files.
- **Handoff không cần thiết:** Chuyển qua lại giữa `router` và `sales` tốn thời gian session update mà không mang lại nhiều giá trị cho một luồng tuyến tính như Leadgen.

---

## Cách 2: Sequential Handoffs theo nghiệp vụ (Chia nhỏ Agent)
**Mô tả:** Chia luồng thành các agent chuyên biệt: `GreetingAgent` (BUC_1), `ObjectionAgent` (BUC_2), `DataCollectionAgent` (BUC_3), `PricingAgent` (BUC_4), `ClosingAgent` (BUC_5). Các agent tự động handoff cho nhau bằng tool `transferAgents`.

**Ưu điểm:**
- **Prompt rất gọn:** Mỗi agent chỉ tập trung vào 1 BUC, model ít bị "ngáo" hay quên luật.
- **Dễ scale:** Thêm BUC mới (ví dụ: Upsell bảo hiểm thân vỏ) chỉ cần thêm 1 agent.

**Nhược điểm:**
- **Độ trễ khi Handoff:** Mỗi lần chuyển Agent, SDK phải gửi event `session.update` lên OpenAI để đổi instructions/tools. Điều này tạo ra một khoảng lặng (khoảng 0.5s - 1s) ngay giữa cuộc hội thoại.
- **Mất context cục bộ:** Dù có truyền context, đôi khi agent mới mất vài giây để "bắt nhịp" lại với thái độ của khách hàng từ agent cũ.
- **Over-engineering:** Bài toán Leadgen TNDS thực chất là một đường thẳng (có rẽ nhánh nhưng cuối cùng vẫn quay về đường chính). Việc chia 5 agents là quá phức tạp so với nhu cầu thực tế.

---

## Cách 3: Đề xuất tối ưu - "State-Machine Prompting" với Single Agent (Kiểu `leadgenV1` hiện tại nhưng nâng cấp)
**Mô tả:** Dùng **1 Agent duy nhất** (`mainSaleAgent`). Đưa toàn bộ State Machine (BUC_1 -> BUC_5) vào trong Prompt một cách cực kỳ có cấu trúc. Chỉ dùng các Tool thuần túy để **đọc/ghi State** và **tính toán (Pricing)**, tuyệt đối **không dùng Tool để quyết định luồng (Policy)**.

**Cấu trúc Prompt đề xuất (State-Machine Prompting):**
Prompt được viết dưới dạng mã giả/cấu trúc rẽ nhánh rõ ràng, ép model hoạt động như một cỗ máy trạng thái.
```markdown
# HIỆN TẠI BẠN ĐANG Ở TRẠNG THÁI: {currentBuc}

# NẾU currentBuc == BUC_1:
- Khách im lặng -> Đọc câu [silence_1] -> Gọi tool updateState(silenceCount+1)
- Khách hỏi "Ai đấy" -> Đọc câu [identity] -> Gọi tool markOutcome(FAQ)
- Khách "Ừ" -> Đọc câu [no_hear_1] -> Gọi tool updateState(BUC_3)

# NẾU currentBuc == BUC_3:
...
```

**Ưu điểm:**
1. **Độ trễ cực thấp (Low Latency):** Model đọc prompt và trả lời ngay lập tức. Không mất thời gian handoff, không mất thời gian gọi tool `evaluate` trung gian.
2. **Kiểm soát câu từ chuẩn xác:** Bằng cách đưa thẳng các câu mẫu (script) vào prompt hoặc dùng tool `getScript` siêu nhẹ, model bị ép phải nói đúng văn bản.
3. **Dễ bảo trì:** Toàn bộ luồng hội thoại nằm ở 1 file `instructions.ts`. Dễ nhìn, dễ sửa.
4. **Tận dụng tốt Context Window:** Với các model hiện tại (như `gpt-4o-mini`), context window đủ lớn để chứa toàn bộ kịch bản Leadgen mà không bị suy giảm khả năng chú ý (attention).

**Nhược điểm:**
- Nếu kịch bản phình to gấp 3-4 lần hiện tại (thêm nhiều sản phẩm khác nhau), prompt sẽ quá dài và model bắt đầu nhầm lẫn. (Nhưng với Leadgen TNDS hiện tại thì hoàn toàn dư sức).

---

## Đánh giá tổng quan & Lựa chọn

| Tiêu chí | Cách 1 (Code Example cũ) | Cách 2 (Sequential Handoffs) | Cách 3 (Single Agent + State Prompt) |
| :--- | :--- | :--- | :--- |
| **Độ trễ (Latency)** | Cao (Do gọi tool evaluate liên tục) | Trung bình (Bị delay lúc handoff) | **Thấp nhất** (Phản hồi trực tiếp) |
| **Chuẩn xác câu từ** | Cao (Code kiểm soát) | Khá | **Cao** (Ép bằng Prompt structure) |
| **Độ phức tạp code** | Rất rối rắm | Trung bình | **Đơn giản nhất** |
| **Phù hợp bài toán Leadgen**| Không phù hợp | Hơi cồng kềnh | **Rất phù hợp** |

### Kết luận
Tôi đề xuất đi theo **Cách 3**. Đây chính là nền tảng mà chúng ta đang xây dựng trong `leadgenV1`, nhưng cần làm cho Prompt "sắt đá" hơn nữa (State-Machine Prompting) để đảm bảo model không bao giờ đi chệch kịch bản.