# Review prompt `leadgenMultiAgent`

## Phạm vi

Đã đọc và đánh giá:

- `src/app/agentConfigs/leadgenMultiAgent/agents/mainSaleAgent/instructions.ts`
- `src/app/agentConfigs/leadgenMultiAgent/agents/greetingAgent/instructions.ts`
- `src/app/agentConfigs/leadgenMultiAgent/prompts.ts`

Mục tiêu của bản review này là chỉ ra các điểm thực sự ảnh hưởng đến chất lượng vận hành của callbot, không sa vào chỉnh câu chữ bề mặt.

## Điểm tốt nên giữ

- Tách flow theo `BUC` khá rõ, giúp model có khung vận hành ổn định hơn khi xử lý từng pha của cuộc gọi.
- Ràng buộc phải gọi `calcTndsFee` trước khi báo giá là đúng hướng và rất quan trọng để chặn việc tự bịa giá.
- Quy tắc handoff nội bộ được nhấn mạnh khá nhiều lớp, giúp giảm nguy cơ agent nói lộ chuyện chuyển agent.
- `FORMAT_OUTPUT_RULE` đủ rõ để ép output về dạng thống nhất `|CHAT` hoặc `|ENDCALL`.
- `mainSaleAgent` đã có ý thức tốt về việc hỏi đúng slot còn thiếu thay vì hỏi tràn lan.
- Có rule riêng để hiểu các câu trả lời ngắn như "ừ", "ok", "đúng" trong bước xác nhận Zalo, đây là một điểm thực dụng và nên giữ.

## Điểm chưa tốt cần tập trung

### 1. Ranh giới trách nhiệm giữa 2 agent chưa sạch

`greetingAgent` đang dùng nguyên `CORE_OBJECTION_PROMPT`, trong khi prompt dùng chung này chứa nhiều action thuộc flow bán hàng chính hoặc chốt đơn như chuyển sang `BUC_5`, xin Zalo, xin email. Điều này làm agent mở đầu có thể bị "rò vai trò", xử lý vượt phạm vi của mình.

Đây là vấn đề có tác động lớn nhất vì nó ảnh hưởng trực tiếp tới sự ổn định của multi-agent flow.

### 2. `mainSaleAgent` có xung đột rule ở lượt đầu sau handoff

Có một nhánh rule nói rằng sau handoff agent được phép:

- xác nhận thông tin
- hỏi đúng 1 slot còn thiếu
- hoặc báo giá ngay nếu tool đã đủ dữ liệu

Nhưng ở flow cứng lại ghi rõ phải luôn mở `BUC_3` bằng câu xác nhận thông tin xe trước mọi câu hỏi khai thác.

Hai rule này chưa có thứ tự ưu tiên rõ ràng. Khi chạy thật, model có thể dao động giữa:

- xác nhận xe trước
- hỏi slot còn thiếu ngay
- hoặc báo giá ngay nếu khách giục nghe giá

### 3. Rule tool và handoff đang bị lặp nhiều nơi

Trong `mainSaleAgent`, phần `# TOOL PHẢI DÙNG` bị lặp thành 2 block. Ngoài ra, rule handoff lại xuất hiện trong cả prompt dùng chung và instruction riêng. Việc lặp như vậy không làm prompt mạnh hơn, mà thường làm loãng attention và tăng nguy cơ model không biết rule nào là ưu tiên chính.

### 4. Script mở đầu của `greetingAgent` quá dài và nặng

Câu mở đầu hiện dồn quá nhiều biến trong một lượt:

- tên
- đơn vị gọi
- biển số
- hãng xe
- màu xe
- số chỗ
- ngày hết hạn
- mục đích gọi

Trong khi `STYLE_RULE` lại yêu cầu câu ngắn, rõ, mỗi lượt một mục tiêu chính. Với voice call, đây là dạng mở đầu dễ khiến khách ngắt lời hoặc mất chú ý.

### 5. Một số nhánh objection có ngữ nghĩa kết thúc nhưng chưa đóng cuộc gọi rõ

Một vài case như:

- xe không còn sử dụng
- đã mua ở chỗ khác

đang có lời thoại mang nghĩa đã kết thúc xử lý, nhưng action vẫn trả `|CHAT` thay vì `|ENDCALL`. Điều này dễ làm model tiếp tục nói thêm sau khi đáng ra nên dừng.

### 6. Một số mẫu thoại còn dài và nặng hơn mức tối ưu cho voice bot

Điều này xuất hiện ở:

- objection về giá
- lo lừa đảo online
- muốn ra đăng kiểm mua
- một số câu closing ở `BUC_5`

Vấn đề không phải là nội dung sai, mà là quá nhiều ý trong một lượt nói. Callbot thường hiệu quả hơn khi giữ mỗi lượt chỉ 1 mục tiêu chính và 1 ý thuyết phục chính.

## Mâu thuẫn hoặc trùng lặp cần ưu tiên dọn

- `mainSaleAgent` lặp phần `# TOOL PHẢI DÙNG`.
- Rule handoff đang nằm rải ở `STYLE_RULE`, `FORMAT_OUTPUT_RULE` và instruction riêng của `mainSaleAgent`.
- FAQ như "em là ai", "sao có số", "không nghe rõ" đang tồn tại ở cả `greetingAgent` lẫn `mainSaleAgent`, nhưng chưa có quy ước rõ cái nào là shared, cái nào là local.
- `greetingAgent` nói phải handoff ngay khi khách muốn nghe tiếp, nhưng local instruction chưa neo rõ tool `transferAgents` như một action bắt buộc.
- `STYLE_RULE` yêu cầu câu ngắn, nhưng một số script cứng lại dài hơn chính style mà nó áp đặt.

## Rủi ro vận hành khi chạy thật

- Agent mở đầu có thể đi quá sâu vào flow bán hàng hoặc chốt thông tin online thay vì chỉ làm bước mở và xác nhận.
- Agent sau handoff có thể hỏi lại không cần thiết hoặc chọn sai bước đầu tiên.
- Agent có thể lặp rule hoặc lặp ý vì nhiều đoạn instruction đang nói cùng một điều theo cách khác nhau.
- Agent có thể bị kéo giữa script cứng và objection prompt, dẫn tới câu trả lời vừa đúng rule này nhưng lệch rule kia.
- Một số nhánh có thể treo hội thoại vì lời thoại đã kết thúc nhưng tag chưa kết thúc.

## Ưu tiên sửa

### Ưu tiên 1

Tách hoặc giới hạn `CORE_OBJECTION_PROMPT` theo từng agent.

Nếu chưa muốn tách file, ít nhất cần thêm hard rule cho `greetingAgent`:

- không tự vào `BUC_5`
- không tự xin Zalo/email
- không tự làm flow chốt đơn
- chỉ mở, xác nhận đúng người hoặc xác định khách có muốn nghe tiếp để handoff

### Ưu tiên 2

Chốt thứ tự ưu tiên ở lượt đầu của `mainSaleAgent`.

Cần viết rất rõ một trong hai hướng:

- luôn xác nhận thông tin trước, trừ trường hợp khách yêu cầu giá ngay và tool đủ dữ liệu
- hoặc nếu khách yêu cầu giá ngay thì `calcTndsFee` là rule ưu tiên cao nhất, thắng rule xác nhận

Hiện tại prompt chưa chốt đủ rõ chuyện này.

### Ưu tiên 3

Gom các rule tool và handoff về một nơi chính.

Mục tiêu là để model nhìn vào là biết ngay:

- lượt đầu phải gọi tool nào
- khi nào phải `updateLeadgenState`
- khi nào phải `calcTndsFee`
- khi nào phải `transferAgents`

### Ưu tiên 4

Rút gọn câu mở đầu của `greetingAgent`.

Mục tiêu của lượt đầu chỉ nên là:

- xác nhận đúng người
- nhắc xe sắp hết hạn
- xin phép hỗ trợ gia hạn

Không nên cố nhồi tất cả thông tin xe vào cùng một câu đầu tiên.

### Ưu tiên 5

Chuẩn hóa các nhánh objection có tính chất kết thúc.

Case nào đã xong về mặt nghiệp vụ thì nên:

- cập nhật outcome
- kết thúc lịch sự
- trả `|ENDCALL`

### Ưu tiên 6

Làm gọn các mẫu thoại thuyết phục dài.

Không cần rewrite toàn bộ. Chỉ cần rút mỗi câu còn:

- 1 ý chính
- 1 lợi ích chính
- 1 câu chốt nhẹ

## Kết luận

Prompt hiện tại có nền khá ổn ở phần khung `BUC`, format output, handoff nội bộ và rule báo giá qua tool. Tuy nhiên, chất lượng vận hành sẽ tăng rõ nếu xử lý 4 nhóm vấn đề sau:

- làm sạch ranh giới giữa `greetingAgent` và `mainSaleAgent`
- gỡ xung đột ưu tiên ở lượt đầu của `mainSaleAgent`
- giảm trùng lặp rule
- rút gọn các câu quá dài hoặc các branch kết thúc chưa đóng đúng

Đây đều là các thay đổi nhỏ nhưng có xác suất cải thiện cao, không cần rewrite toàn bộ prompt.
