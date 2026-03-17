- **Context Engineering: Optimizing LLM Performance**
    - **1) Bài viết đang định nghĩa “Context Engineering” là gì?**
        
        Bài viết coi **context engineering** là **thiết kế kiến trúc thông tin đưa vào LLM** để tối ưu chất lượng trả lời trong **giới hạn kỹ thuật** (context window, chi phí/độ trễ, suy giảm chú ý).
        
        Điểm nhấn rất rõ:
        
        - Không phải “nhét nhiều dữ liệu hơn” → mà là **chọn đúng, cấu trúc đúng, đặt đúng chỗ**.
    - **2) Những “thực tế kỹ thuật” (technical realities)**
        
        ### (a) “Lost in the middle”
        
        Model thường chú ý tốt ở **đầu** và **cuối** hơn là phần **giữa** của context dài.
        
        → Hàm ý thiết kế: cái “quan trọng nhất” phải nằm ở **đầu/cuối**, đừng bury vào giữa.
        
        ### (b) “Theoretical vs effective capacity”
        
        Ví dụ model có 128k tokens không có nghĩa là 128k tokens đều “hiệu quả như nhau”. Sau một ngưỡng (bài gợi ý khoảng 32k–64k) thường có suy giảm độ chính xác.
        
        → Hàm ý: **đừng mặc định “càng dài càng tốt”**.
        
        ### (c) Chi phí/độ trễ tăng mạnh theo độ dài context
        
        Bài nói nhiều hệ kiến trúc có chi phí tăng “rất nhanh” (thường được mô tả là gần-quadratic theo độ dài).
        
        → Hàm ý: context engineering là **bài toán chất lượng *và* economics**.
        
    - **3) 4 “core lessons”**
        - **Lesson 1 — Relevance & recency > volume**
            
            Giảm context nhưng tăng “đúng cái cần” thì chất lượng tăng.
            
            Ví dụ trong CRM: chỉ gửi email liên quan deal đang active thay vì toàn bộ lịch sử email.
            
            **Áp vào agent:**
            
            - Đừng đưa “toàn bộ KB / toàn bộ log” vào mỗi lượt.
            - Chỉ đưa “facts cần để ra quyết định ở bước hiện tại”.
        - **Lesson 2 — Structure quan trọng ngang nội dung**
            
            LLM đọc tốt hơn khi context có **khung**: heading, delimiter, XML/JSON, section rõ ràng.
            
            **Áp vào agent:**
            
            - Luôn chia: `INSTRUCTIONS / USER / RETRIEVED FACTS / TOOLS RESULTS / CONSTRAINTS / OUTPUT FORMAT`.
            - Với dữ liệu: ưu tiên “schema-like” thay vì văn xuôi.
            
            **1) Vì sao “luôn chia khối” lại quan trọng?**
            
            Khi bạn trộn mọi thứ vào một đoạn dài, AI phải tự đoán:
            
            - đâu là **luật bắt buộc** (không được vi phạm),
            - đâu là **dữ liệu sản phẩm**,
            - đâu là **kết quả tool** (facts mới),
            - đâu là **câu hỏi hiện tại**,
            - đâu là **yêu cầu định dạng trả lời**.
            
            => Việc “tự đoán vai trò của từng đoạn” làm AI dễ nhầm và dễ bịa.
            
            **Ý nghĩa từng khối (nói theo ngôn ngữ agent)**
            
            - **INSTRUCTIONS**: “Bạn là ai, nhiệm vụ là gì, phong cách giao tiếp”
            - **CONSTRAINTS**: “Luật cứng / điều cấm” (không bịa, không hứa giữ hàng…)
            - **RETRIEVED FACTS**: “Dữ liệu tham chiếu đã chọn lọc từ KB/DB/RAG” (giá, màu, size rule…)
            - **TOOLS RESULTS**: “Facts vừa lấy từ công cụ” (tồn kho, ảnh theo màu, phí ship tính theo địa chỉ…)
            - **USER**: “Câu khách vừa hỏi (hiện tại)”
            - **OUTPUT FORMAT**: “Trả lời theo format nào” (ngắn, 2 câu, có link ảnh…)
            
            > Điểm mấu chốt: **tool results phải tách riêng** để AI hiểu đó là “thông tin mới vừa tra”, không lẫn với mô tả chung.
            > 
            
            ---
            
            **2) Ví dụ “chia khối” cho bot bán hàng thời trang (ngắn)**
            
            **Case: khách xin mẫu màu đen + tư vấn size**
            
            ```
            [INSTRUCTIONS]
            Bạn là nhân viên tư vấn thời trang trung niên. Trả lời ngắn gọn, thân thiện.
            
            [CONSTRAINTS]
            - Không hứa giữ hàng.
            - Không bịa tồn kho/giá.
            - Nếu thiếu dữ liệu để tư vấn size, chỉ hỏi 1 câu.
            
            [RETRIEVED_FACTS]
            product: {id: QVT, name: "Quần vải tăm", colors: [đen, kem, xanh than], size_range: [29..35]}
            pricing: {unit_price: 229000, ship_fee_if_qty1: 20000, ship_fee_if_qty_gte2: 0}
            size_rule: {need: [height_m, weight_kg], no_size_if_weight_gt: 90}
            
            [TOOLS_RESULTS]
            images_for_color_black:
            - url: https://.../QVT/black.webp
            
            [USER]
            "Cho em xem mẫu màu đen và tư vấn size, cao 1m68 nặng 82kg."
            
            [OUTPUT_FORMAT]
            Trả lời tối đa 2 câu. Gồm: (1) link ảnh màu đen, (2) 1 size đề xuất + lý do ngắn.
            ```
            
            Với format này, AI gần như “không có cửa” trả lung tung vì:
            
            - Luật nằm riêng (CONSTRAINTS)
            - Facts nằm riêng (RETRIEVED_FACTS)
            - Tool results nằm riêng (TOOLS_RESULTS)
            - Câu hỏi hiện tại nằm riêng (USER)
            - Format trả lời nằm riêng (OUTPUT_FORMAT)
            
            ---
            
            **3) “Schema-like” là gì? (và vì sao nó hơn văn xuôi)**
            
            **3.1 Hiểu đơn giản**
            
            **Schema-like** = dữ liệu dạng “biểu mẫu/bảng có nhãn”, kiểu:
            
            - mỗi ý là **field rõ ràng**
            - danh sách là **list thật**
            - quy tắc là **rule có điều kiện**
            - càng ít câu văn càng tốt
            
            AI xử lý schema-like tốt hơn vì nó có thể **tra cứu** (“lookup”) thay vì phải **đọc hiểu văn**.
            
            ---
            
            **4) Ví dụ schema-like vs văn xuôi (cùng nội dung)**
            
            **❌ Văn xuôi (dễ nhầm / dễ bịa)**
            
            > “Quần vải tăm giá 229k, mua 1 cái thêm 20k ship, mua 2 cái miễn ship, có nhiều màu đen kem xanh than. Size từ 29 đến 35, chọn theo chiều cao cân nặng…”
            > 
            
            Lỗi hay gặp:
            
            - AI trả thiếu điều kiện
            - AI lẫn “combo” với “mua 2”
            - AI bịa thêm ưu đãi
            
            **✅ Schema-like (AI tra nhanh, ổn định)**
            
            ```yaml
            product:
            id:QVT
            name:Quầnvảităm
            colors: [đen,kem,xanhthan]
            size_range: [29,35]
            
            pricing:
            unit_price:229000
            shipping_rule:
            -when:qty==1
            fee:20000
            -when:qty>=2
            fee:0
            
            size_guide:
            required_inputs: [height_m,weight_kg]
            no_size_when:
            -weight_kg>90
            
            ```
            
            **Hỏi “mua 2 cái có ship không?”** → AI chỉ cần nhìn rule `qty >= 2` → `fee: 0`
            
            Không phải “đọc văn và suy diễn”.
            
            ---
            
            **5) Ví dụ schema-like cho “ảnh theo màu” (cái này cực đáng làm)**
            
            Thay vì nhét ảnh thành một đoạn dài lặp đi lặp lại, hãy đưa thành list object:
            
            ```json
            "images":[
            {"kind":"color","color":"đen","url":"https://.../black.webp"},
            {"kind":"color","color":"kem","url":"https://.../cream.webp"},
            {"kind":"material","url":"https://.../fabric1.webp"}
            ]
            
            ```
            
            => Khi user nói “cho xem mẫu đen”, AI chọn đúng object `color=đen`.
            
        - **Lesson 3 — Context hierarchy & ordering (đặt đúng chỗ)**
            
            Bài đề xuất một ordering “tận dụng attention”:
            
            - Đầu: system instructions + user query
            - Sau đó: retrieved info liên quan nhất
            - Giữa: supporting context
            - Gần cuối: examples/edge cases
            - Cuối cùng: final constraints/instructions “chốt”
            
            **Áp vào agent:**
            
            - Các “hard rules” nên nằm **cuối** (để model “đọc lại trước khi trả lời”).
            - Các “facts quyết định hành động” nên ở **đầu** hoặc **rất gần đầu**.
            
            **1) Vì sao “đặt đúng chỗ” lại quan trọng?**
            
            AI không đọc ngữ cảnh kiểu “đọc sách từ đầu đến cuối và nhớ hết”. Khi ngữ cảnh dài:
            
            - Thông tin ở **đầu** và **cuối** thường được chú ý tốt hơn.
            - Phần **giữa** dễ bị “chìm” (đặc biệt khi bạn nhét nhiều thứ lặt vặt).
            
            Vì vậy, cùng một dữ liệu, chỉ cần đổi vị trí là chất lượng trả lời có thể khác hẳn:
            
            - Quên luật cứng
            - Nhầm facts quan trọng
            - Làm sai hành động (ví dụ: tự ý “cam kết còn hàng”)
            
            ---
            
            **2) “Context hierarchy” nghĩa là gì (dịch dễ hiểu)**
            
            Là **xếp hạng mức quan trọng** của từng loại thông tin và **đặt chúng theo thứ tự ưu tiên**.
            
            Bạn có thể chia thông tin thành 4 nhóm:
            
            1. **Luật cứng / điều cấm** (vi phạm là sai nghiêm trọng)
            2. **Câu hỏi hiện tại + mục tiêu hiện tại**
            3. **Facts quyết định trả lời/hành động** (giá/ship/size rule/ảnh đúng màu/kết quả tool)
            4. **Hỗ trợ / ví dụ / edge cases / ghi chú dài**
            
            ---
            
            **3) Thứ tự đề xuất (chuẩn để dùng trong agent)**
            
            Bài gợi ý ordering kiểu “tận dụng attention”, mình chuyển thành 2 dạng template phổ biến:
            
            **Template A (an toàn, dễ triển khai)**
            
            **Đầu → cuối:**
            
            1. **System/Role + cách làm chung** (ổn định, ngắn)
            2. **User query** (câu hỏi hiện tại)
            3. **Retrieved facts liên quan nhất** (top facts)
            4. **Tool results** (facts mới vừa tra)
            5. **Supporting context** (mô tả thêm nếu cần)
            6. **Examples/edge cases** (nếu thật sự cần)
            7. **Final constraints “chốt”** (nhắc lại luật cứng ngay trước khi model trả lời)
            8. **Output format** (nếu bạn dùng)
            
            > Ý chính: **facts quan trọng nằm gần đầu**, **luật cứng nhắc lại ở cuối** để “đọc lại trước khi trả lời”.
            > 
            
            ---
            
            **Template B (khi luật cực quan trọng / dễ bị vi phạm)**
            
            **Luật cứng xuất hiện 2 lần**: đầu + cuối (rất hiệu quả trong production)
            
            1. **Hard rules (bản ngắn 3–7 dòng)**
            2. System/Role
            3. User query
            4. Facts / Tool results
            5. Supporting / examples
            6. **Hard rules (nhắc lại bản ngắn y hệt)**
            7. Output format
            
            > Dạng này giảm mạnh lỗi “quên luật”, nhất là với bot dễ bịa/đưa cam kết.
            > 
            
            ---
            
            **4) Giải thích 2 ý “áp vào agent”**
            
            **(1) “Hard rules nên nằm cuối”**
            
            Đúng trong thực tế vì:
            
            - Nếu hard rules chỉ nằm đầu, model có thể “trôi” khi đọc nhiều facts ở giữa.
            - Đặt hard rules ở cuối giống như “đọc lại checklist” ngay trước khi trả lời.
            
            **Ví dụ hard rules (ngắn, đặt cuối)**
            
            ```
            [FINAL CHECK]
            - Không hứa giữ hàng.
            - Không bịa tồn kho/giá.
            - Nếu thiếu dữ liệu, hỏi đúng 1 câu.
            
            ```
            
            ✅ Cách này đặc biệt hữu ích khi bạn có nhiều retrieved facts/tool results.
            
            ---
            
            **(2) “Facts quyết định hành động nên ở đầu hoặc rất gần đầu”**
            
            Đúng vì “facts quyết định” là thứ model cần dùng để trả lời đúng ngay lập tức.
            
            Trong agent, “facts quyết định” thường là:
            
            - giá + rule freeship
            - rule chọn size
            - ảnh theo màu user yêu cầu
            - kết quả tool (tồn kho, phí ship theo địa chỉ, seat map…)
            
            **Nguyên tắc:** đưa “facts quyết định” **ngay sau user query**, đừng để chúng nằm sâu sau mô tả dài.
            
            ---
            
            **5) Ví dụ ngắn (bán hàng thời trang) — cùng dữ liệu, khác thứ tự**
            
            **Ví dụ “đặt đúng chỗ”**
            
            ```
            [INSTRUCTIONS]
            Bạn là nhân viên tư vấn thời trang. Trả lời ngắn gọn.
            
            [USER_QUERY]
            "Cho xem mẫu màu đen và tư vấn size, cao 1m68 nặng 82kg."
            
            [TOP FACTS]
            product: QVT
            colors: [đen, kem, xanh than]
            size_rule: cần height_m + weight_kg; nếu weight_kg > 90 thì không có size
            
            [TOOLS_RESULTS]
            black_image: https://.../black.webp
            
            [FINAL CHECK]
            Không hứa giữ hàng. Không bịa. Nếu thiếu thông tin thì hỏi 1 câu.
            
            [OUTPUT_FORMAT]
            2 câu: (1) link ảnh, (2) size + lý do.
            
            ```
            
            **Ví dụ “đặt sai chỗ” (hay gặp)**
            
            - Để mô tả chất liệu dài + ảnh lộn xộn ở giữa,
            - Size rule nằm sâu,
            - Hard rules nằm đầu rồi “trôi mất”.
            
            Kết quả: AI dễ quên luật, dễ trả dài dòng hoặc nhầm.
            
            ---
            
            **6) Quy tắc chọn “cái gì lên đầu, cái gì xuống cuối”**
            
            Bạn có thể dùng 3 câu hỏi để quyết định vị trí:
            
            ### A) Nếu sai cái này có “nguy hiểm” không?
            
            - Có → đưa vào **Hard rules**, và đặt **cuối** (hoặc cả đầu + cuối)
            
            ### B) Nếu thiếu cái này AI sẽ trả lời sai ngay không?
            
            - Có → đưa vào **Top facts**, đặt **ngay sau user query**
            
            ### C) Cái này chỉ để hỗ trợ thêm, không bắt buộc?
            
            - Có → đẩy xuống **supporting / examples**
        - **Lesson 4 — Embrace stateless calls (đừng cố nhét toàn bộ lịch sử)**
            
            Mỗi call là stateless → hãy quản lý state ở application layer:
            
            - gửi “một phần lịch sử liên quan”
            - summarization cho phần cũ
            - semantic chunking để kéo đúng đoạn
            
            **Áp vào agent:**
            
            - Agent tốt không phải agent “nhớ dai”, mà là agent “được cấp đúng trí nhớ đúng lúc”.
            
            ```jsx
            [HISTORY_STATE]
            {...conversation_state...}
            [OLDER_SUMMARY]
            - tóm tắt turn xa, 3–7 bullet facts
            [RECENT_TURNS_VERBATIM]
            U: ...
            A: ...
            U: ...
            
            [USER_QUERY]
            "Cho em xem mẫu màu đen và tư vấn size giúp em, cao 1m68 nặng 82kg"
            ```
            
            ## 4 tiêu chí để history của bạn “ăn chắc”
            
            ### (1) HISTORY_STATE phải là “nguồn sự thật”
            
            State phải chứa:
            
            - `selected_product_id` (hoặc active_product)
            - `intent`
            - `filled_slots` (màu/size/số lượng…)
            - `pending_questions` (còn thiếu gì)
            - `last_agent_action` (lượt trước bot đang làm gì)
            
            Nếu có đủ, LLM sẽ ít hỏi lại và ít nhầm sản phẩm.
            
            ### (2) OLDER_SUMMARY chỉ là “facts”, không kể chuyện
            
            Đừng tóm tắt kiểu văn dài. Chỉ 3–7 dòng facts dạng:
            
            - “User đổi từ màu đen sang kem”
            - “User muốn mua 2 cái để miễn ship”
            - “User cao 1m68 nặng 82kg, chưa chốt size”
            
            ### (3) RECENT_TURNS_VERBATIM giữ đúng 3–5 lượt
            
            - Ít quá (1–2) → dễ mất ngữ cảnh câu chữ
            - Nhiều quá (10+) → nhiễu + tốn token
            
            ### (4) USER_QUERY luôn đặt cuối
            
            Để model “thấy câu hỏi cuối cùng” ngay trước khi trả lời.
            
    - **4) Các kỹ thuật thực dụng đáng dùng**
        - **(1) Semantic chunking + retrieval**
            
            Chia tài liệu theo “ngữ nghĩa” (topic/section), embed, top-k retrieve, có thể rerank.
            
            Bài claim: giảm 60–80% context; chất lượng tăng ~20–30% (đây là con số kinh nghiệm, không phải định luật).
            
            **Áp vào agent:**
            
            - Chunk theo “đơn vị hành động” (rule / procedure / policy / mapping table) thay vì chunk theo số ký tự.
        - **(2) Progressive context loading**
            
            Bắt đầu tối giản; chỉ add thêm khi model “uncertain”.
            
            **Áp vào agent:**
            
            - Turn 1: rules + query + top facts
            - Nếu thiếu: add docs liên quan
            - Nếu vẫn thiếu: add examples/edge cases
        - **(3) Context compression**
            - Entity extraction (facts/relations)
            - Summarization (đặc biệt cho lịch sử hội thoại dài)
            - Structured format (JSON/XML) để “nén token” tốt hơn văn xuôi
        - **(4) Multi-window cho hội thoại dài**
            - Immediate window: 3–5 turns gần nhất (verbatim)
            - Recent window: tóm tắt 10–20 turns
            - Historical window: tóm tắt mức cao
            
            Ý tưởng: **không nhét nguyên lịch sử** vào 1 context, mà chia thành **nhiều “cửa sổ” (windows)** với **mức chi tiết khác nhau**, để vừa rẻ vừa ít nhiễu.
            
            ### 4.1 Immediate window (3–5 turns gần nhất, verbatim)
            
            **Mục đích:** giữ *ngữ cảnh câu chữ* và “tone” của đoạn đang nói, tránh trả lời lạc mạch.
            
            - Chỉ giữ **3–5 lượt gần nhất** (U/A xen kẽ).
            - Không cần sạch đẹp; giữ nguyên như chat.
            
            **Ví dụ**
            
            ```
            [RECENT_TURNS_VERBATIM]
            U: "Cho em xem mẫu màu đen"
            A: "Dạ được ạ. Anh cho em xin chiều cao cân nặng để em tư vấn size luôn nha?"
            U: "cao 1m68 nặng 82kg"
            A: "Dạ em ghi nhận ạ."
            ```
            
            ### 4.2 Recent window (tóm tắt 10–20 turns gần đây)
            
            **Mục đích:** gom “facts” quan trọng đã thu thập trong 10–20 lượt, để model không phải đọc lại từng câu.
            
            - Dạng tốt nhất: **bullet facts / state delta**, không kể chuyện.
            - Giữ những thứ ảnh hưởng quyết định: sản phẩm đang tư vấn, màu, số lượng, địa chỉ, đổi ý, ràng buộc.
            
            **Ví dụ**
            
            ```yaml
            [RECENT_SUMMARY]
            -selected_product_id:QVT
            -user_pref_color:đen
            -user_height_m:1.68
            -user_weight_kg:82
            -user_goal:"xem mẫu + tư vấn size"
            -unresolved:"chưa chốt số lượng"
            ```
            
            ### 4.3 Historical window (tóm tắt mức cao / “bền”)
            
            **Mục đích:** lưu những thứ *bền theo thời gian* (thói quen, sở thích, điều kiêng kỵ), không cần lặp lại ở mọi turn.
            
            - Rất ngắn: 3–7 dòng.
            - Ví dụ bán hàng: “khách hay mặc suông rộng”, “dị ứng chất liệu”, “hay mua 2 cái để miễn ship”, “khu vực giao hàng thường là…”.
            
            **Ví dụ**
            
            ```json
            [HISTORICAL_MEMORY]
            {
            "customer_profile":{
            "style_preference":"thoải mái, suông rộng",
            "typical_purchase_qty":2
            }
            }
            
            ```
            
            ### 4.4 Khi nào dùng multi-window?
            
            - Dưới ~20 lượt: thường **state + recent verbatim** là đủ.
            - Trên ~20 lượt hoặc nhiều lần đổi ý: thêm **recent summary** (và có thể historical).
            
            > Mấu chốt: **State là nguồn sự thật**, summary chỉ là “nén thông tin”, verbatim là “ngữ cảnh gần”.
            > 
        - **(5) Prompt caching / smart caching**
            
            Đặt phần “ổn định” ở đầu (system + stable reference) để cache; phần động phía sau.
            
        - **(6) Measure context utilization(đo “xài context” có hiệu quả không)**
            
            Track: avg context size, cache hit, retrieval relevance, quality vs size.
            
            Insight hay: nhiều hệ thống đang dùng context gấp 2–3 lần mức tối ưu.
            
            Không đo thì dễ rơi vào tình trạng: **nhét 2–3 lần context cần thiết** mà không biết.
            
            ### 6.1 Track những gì?
            
            **(a) Token / độ dài**
            
            - avg input tokens / request
            - p95 input tokens (turn xấu nhất)
            - output tokens (hay dài bất thường không)
            
            **(b) Retrieval quality (nếu có RAG)**
            
            - top-k retrieval score / rerank score
            - % chunk được dùng (hoặc “attributed citations” nếu bạn có cơ chế)
            - duplication rate (cùng 1 facts xuất hiện nhiều lần)
            
            **(c) Cache**
            
            - cache hit rate (nếu nền tảng hỗ trợ)
            - token saved via cache (ước lượng)
            
            **(d) Quality vs size**
            
            - Tỉ lệ trả lời đúng (manual label hoặc eval set)
            - Tỉ lệ hỏi lại (bot hỏi vòng vo)
            - Tỉ lệ hallucination (đặc biệt: bịa tồn kho/giá/ship)
            
            ### 6.2 Cách dùng số đo để tối ưu (rất thực dụng)
            
            Bạn làm 1 vòng lặp:
            
            1. Baseline: chạy 100–500 cuộc hội thoại thật
            2. Giảm context theo “ưu tiên” (bỏ log xa, nén size guide, chỉ load ảnh khi cần)
            3. So sánh:
                - cost ↓ ?
                - latency ↓ ?
                - quality ↑ hay ↓ ?
            4. Chốt “ngưỡng tối ưu” theo use-case (bán hàng thường ưu tiên ổn định + rẻ)
        - **(7) Overflow handling**
            
            Khi quá giới hạn: ưu tiên user query + hard constraints; truncate middle trước; hoặc auto-summarize; tránh “cắt im lặng”.
            
            Mục tiêu: **không cắt im lặng** và không “đứt mạch” ở phần quan trọng.
            
            ### 7.1 Thứ tự ưu tiên khi thiếu budget
            
            1. **USER_QUERY** (câu hiện tại)
            2. **Hard constraints / policies** (không bịa, không hứa giữ hàng, v.v.)
            3. **HISTORY_STATE** (facts đã chốt)
            4. **Most relevant retrieved facts** (giá/ship/màu/size rules đúng phần được hỏi)
            5. **Recent summary**
            6. **Recent verbatim** (giảm từ 5 xuống 3)
            7. **Hình ảnh / ví dụ dài / phần mô tả dài** (cắt trước)
            
            > Quy tắc “truncate middle first” là vì phần giữa hay chứa “supporting noise” nhất.
            > 
            
            ### 7.2 Chiến lược xử lý overflow hay dùng
            
            - **Progressive loading:** chỉ load size guide khi user hỏi size; chỉ load images khi user xin xem mẫu.
            - **Auto-summarize:** nếu history dài, summarize theo facts và thay verbatim xa.
            - **Fail loudly (tốt hơn fail silently):**
                - nếu bắt buộc cần tài liệu mà không đủ chỗ, trả “thiếu dữ liệu” thay vì đoán.
    - **5) Khung áp dụng nhanh**
        
        Nếu coi agent = **planner + tools + memory + policies**, thì context engineering là thiết kế “bộ nạp context” (context loader) với 4 nhiệm vụ:
        
        1. **Select**: chọn đúng thông tin (retrieval + filtering)
        2. **Shape**: định dạng/structure (schema, headings, delimiters)
        3. **Place**: đặt thứ tự (đầu/cuối cho cái quan trọng)
        4. **Refresh**: cập nhật theo turn (windowing + summarization + cache)
        
        Hãy coi bạn có 1 hàm:
        
        `build_context(state, user_query) -> prompt_sections`
        
        Nó làm 4 việc: **Select, Shape, Place, Refresh**.
        
        ### 1) Select (chọn đúng thông tin)
        
        Bạn quyết định **lấy cái gì** vào context.
        
        - Chọn đúng *product active* (tránh lẫn áo sơ mi vs quần QVT)
        - Chọn đúng phần KB theo intent:
            - hỏi giá → pricing + ship rules
            - hỏi size → size_guide
            - xin mẫu → images (lọc theo color)
        - Lọc noise: bỏ mô tả dài nếu không liên quan
        
        **Ví dụ select theo intent**
        
        - Intent = “xem mẫu màu đen” → chỉ lấy `images[kind=color,color=đen]` + `product.name`
        
        ### 2) Shape (định dạng/structure)
        
        Bạn biến dữ liệu thành dạng **schema-like** để LLM “lookup”.
        
        - List phải là list thật (không phải chuỗi đánh số)
        - Rule phải có điều kiện rõ (qty>=2 thì ship=0)
        - Dùng JSON/YAML/khung section cố định
        
        ### 3) Place (đặt thứ tự)
        
        Bạn đặt cái quan trọng ở nơi model dễ “thấy”:
        
        - Policy/hard rules ở chỗ nổi bật (thường đầu +/hoặc ngay trước output)
        - User query cuối cùng
        - Facts liên quan nhất ngay gần user query
        - Tránh bury thông tin quyết định ở giữa đống mô tả
        
        ### 4) Refresh (cập nhật theo turn)
        
        Mỗi lượt bạn cập nhật:
        
        - state slots (màu/size/qty/height/weight…)
        - recent verbatim (trượt cửa sổ)
        - recent summary (nếu dài)
        - cache boundary (stable prefix giữ nguyên)
    - **6) Checklist triển khai theo bài (cực sát production)**
        - [ ]  Tách rõ **stable** vs **dynamic** để cache
        - [ ]  Có **schema** cho “facts” (thay vì dump văn)
        - [ ]  Retrieval top-k + rerank + threshold (lọc noise)
        - [ ]  Ordering theo “đầu/cuối” (hard rules ở cuối)
        - [ ]  Windowing 3 tầng (verbatim gần, summary gần, summary xa)
        - [ ]  Summarize theo “facts cần cho quyết định”, không tóm tắt kiểu kể chuyện
        - [ ]  Instrument metrics: context size, relevance, quality, cost/latency
        - [ ]  Overflow strategy minh bạch (truncate middle / summarize)
- **Beyond the Prompt: Why Context Engineering is the Future of Production AI**
    - **Memory Spec**
        
        ## 1) “Phân tầng trí nhớ” là gì?
        
        Hãy tưởng tượng agent có 3 tầng chính:
        
        ### A. Working memory (trí nhớ làm việc) — *RAM thật sự*
        
        - Là những thứ **đang cần ngay** để trả lời đúng ở turn hiện tại.
        - Ví dụ callbot đặt vé: `{tuyến, ngày đi, giờ chọn, điểm đón, điểm trả, số vé, tên}` + “đang ở bước A3”.
        
        Đặc điểm:
        
        - Nhỏ, luôn nằm trong context.
        - Thay đổi nhanh theo từng câu.
        
        ### B. Episodic memory (ký ức theo “tập”) — *nhật ký sự kiện theo thời gian*
        
        - Lưu **“chuyện đã xảy ra”**: ai nói gì, quyết định gì, kết quả gì, khi nào.
        - Ví dụ: “Hôm qua khách hỏi tuyến HN–ĐN, muốn đi 19:00 nhưng hết ghế, chuyển sang 21:00.”
        
        Đặc điểm:
        
        - Có timestamp, có ngữ cảnh.
        - Hữu ích khi bạn cần “nhớ lại cuộc trao đổi trước đó” hoặc “khách hay hỏi kiểu gì”.
        
        ### C. Semantic memory (tri thức bền vững) — *facts đã được chưng cất*
        
        - Lưu **sự thật ổn định** rút ra từ nhiều episode.
        - Ví dụ: “Khách thích ghế gần cửa sổ”, “Khách thường đi tuyến ĐN→HN”, “Ngôn ngữ: Việt”.
        
        Đặc điểm:
        
        - Ít đổi, dùng lại nhiều lần.
        - Không phải “chuyện”, mà là “sự thật/thuộc tính”.
        
        > Tóm gọn: **Episodic = logs**, **Semantic = profile/knowledge distilled**, **Working = state hiện tại**.
        > 
        
        ---
        
        ## 2) Vấn đề của “sliding window chat history”
        
        Nếu bạn chỉ dùng sliding window (lấy N tin nhắn gần nhất):
        
        - Context sẽ **phình**, tốn tiền, tăng latency.
        - Thông tin quan trọng có thể bị **trôi khỏi cửa sổ**.
        - Hoặc bị “loãng”: model đọc nhiều mà không biết cái nào quan trọng.
        
        Cho nên cần một hệ: **lưu trữ ngoài context + chỉ nạp phần cần**.
        
        ---
        
        ## 3) Ẩn dụ MemGPT: Context window như RAM, storage như Disk (virtual memory)
        
        Đây là điểm “OS/virtual memory”:
        
        ### Context window = RAM (nhỏ nhưng nhanh)
        
        - LLM chỉ “thấy” những gì bạn đưa vào context.
        - RAM có giới hạn ⇒ không thể giữ mọi thứ.
        
        ### Vector DB / SQL / object store = Disk (to nhưng chậm)
        
        - Bạn lưu toàn bộ episode, facts, tài liệu… ở ngoài.
        - Khi cần, bạn **page in** (nạp vào) vài “mẩu” liên quan.
        
        ### Page out / Page in là gì trong agent?
        
        - **Page out (xả ra)**: khi một đoạn hội thoại đã xong hoặc context sắp đầy → tóm tắt/chuẩn hóa và lưu ra ngoài (episodic store).
        - **Page in (nạp vào)**: trước khi trả lời turn mới → truy hồi (retrieve) đúng vài mẩu relevant từ store để đưa lại vào context.
        
        Điểm quan trọng: **LLM không tự nhớ**; “nhớ” là do hệ thống của bạn làm *load/store*.
        
        ---
        
        ## 4) “MemGPT” (ý tưởng cốt lõi) nằm ở “Memory Manager”
        
        Thay vì bạn hardcode kiểu “luôn nhét 10 tin nhắn gần nhất”, MemGPT-style là có một lớp **memory manager/controller** quyết định:
        
        1. **Khi nào phải lưu? (write policy)**
        - Cuối một task (đặt vé xong).
        - Khi phát hiện “thông tin bền vững” (preference).
        - Khi gần chạm giới hạn context.
        1. **Lưu cái gì? (what to write)**
        - Episodic: tóm tắt cuộc trao đổi + outcome + slots cuối.
        - Semantic: chỉ những fact ổn định, đã đủ tin cậy.
        1. **Khi nào phải nạp lại? (read policy)**
        - Turn mới mở đầu / user quay lại sau lâu.
        - Khi thiếu slot quan trọng.
        - Khi user nhắc “lần trước”, “như hôm qua”.
        1. **Nạp cái gì? (what to read)**
        - Top-k episodic gần đây + liên quan theo embedding/keyword.
        - Semantic profile ngắn gọn (1–5 dòng).
        - Các “facts” liên quan trực tiếp intent hiện tại.
        
        ---
        
        ## 5) Ví dụ rất sát callbot: đặt vé xe
        
        ### Working memory (context luôn có)
        
        - `intent=dat_ve`, `route=DN-HN`, `date=05/02`, `step=A3`, `missing={pickup,dropoff,qty,name}`
        
        ### Episodic store (log)
        
        - `[2026-02-01] khách hỏi DN-HN, thích đi tối, đổi chuyến do hết ghế`
        
        ### Semantic store (profile)
        
        - `khách thường chọn chuyến tối`
        - `ưu tiên ghế gần cửa sổ` (nếu hệ thống cho phép lưu)
        
        ### Page in ở turn mới
        
        User: “Anh đặt lại như lần trước”
        
        → controller retrieve semantic “chuyến tối” + episodic gần nhất “DN-HN đổi chuyến do hết ghế”
        
        → LLM hỏi đúng: “Dạ mình vẫn đi tuyến Đà Nẵng ra Hà Nội và ưu tiên chuyến buổi tối đúng không ạ?”
        
        ---
        
        ## 6) 2 lỗi hay gặp khi làm memory (và cách tránh)
        
        1. **Memory bẩn / không đáng tin**
            - LLM suy diễn rồi lưu thành “sự thật” ⇒ sai dài hạn.
                
                Cách tránh: semantic memory chỉ update khi:
                
            - user nói rõ ràng, hoặc
            - lặp lại nhiều lần, hoặc
            - có xác nhận.
        2. **Prompt injection qua memory**
            - Nếu bạn lưu nguyên văn nội dung “không tin cậy”, sau này retrieve lại sẽ tự phá luật.
                
                Cách tránh:
                
            - Tách “untrusted transcript” và “trusted distilled facts”.
            - Khi retrieve, ưu tiên facts đã chuẩn hóa.
    - **Workbench**
        
        ## 1) “Context window là cái bàn thợ mộc hữu hạn” nghĩa là gì?
        
        Bài bảo bạn **đừng coi context window là cái hố không đáy**. Dù 8k hay 200k tokens, hãy tưởng tượng nó như **một cái bàn thợ mộc**: đặt gì lên bàn cũng **chiếm chỗ**, đặt quá nhiều thì **không còn “khoảng trống” để làm việc**. Nói cách khác: context không chỉ để “chứa thông tin”, mà còn cần **chừa chỗ cho suy luận**.
        
        ### “Clutter problem” (bàn bừa) trong LLM
        
        Bài dùng ví dụ: nếu bạn phủ 80% bàn bằng “giấy vụn/hoá đơn/đồ không liên quan”, người thợ mộc sẽ **bị tê liệt vì rác**, không phân biệt được “bản vẽ quan trọng” với nhiễu. LLM cũng vậy: nhồi nhiều thứ không liên quan làm model khó tập trung và dễ trả lời kém chính xác.
        
        ### “Attention dilution” & “Lost in the Middle”
        
        Khi context dài và lộn xộn, **attention bị dàn mỏng** → thông tin quan trọng (đặc biệt ở giữa) dễ bị “mờ”. Bài gọi đây là **Lost in the Middle**.
        
        Paper *Lost in the Middle* cũng quan sát hiện tượng này: mô hình thường dùng thông tin **tốt hơn ở đầu/cuối** và **giảm mạnh khi thông tin nằm giữa**.
        
        > Tóm lại: **workbench hữu hạn** ⇒ phải **cắt rác** và **sắp xếp đồ đúng chỗ** để LLM còn “chỗ trống” mà suy nghĩ.
        > 
        
        ---
        
        ## 2) Từ workbench, bài chốt “3 trụ” để bạn “bày đồ lên bàn” đúng cách
        
        Bài nói context engineer giỏi sẽ curate workbench bằng **3 loại “đồ nghề”**, mỗi loại có vai trò khác nhau.
        
        ### Trụ 1 — System Instructions = “Blueprint” (bản vẽ/luật xây dựng)
        
        Đây là **luật bất biến**: model là ai, được/không được làm gì, phải trả lời theo format nào. Nó giống “building code” mà thợ mộc **bắt buộc tuân thủ**.
        
        **Ý quan trọng:** system instructions phải là **ràng buộc chính xác**, không phải lời dặn chung chung (vì lời dặn mơ hồ tạo “độ tự do” → dễ hallucinate).
        
        **Ví dụ callbot:** “Không cam kết giữ chỗ”, “chỉ hỏi 1 câu mỗi lượt”, “chỉ xác nhận cấp tỉnh/quận”…
        
        ---
        
        ### Trụ 2 — Few-shot Examples = “Prototypes” (mẫu thành phẩm để bắt chước)
        
        Bài nói thẳng: LLM **giỏi bắt chước pattern hơn là ‘tuân thủ luật dài’**. Thay vì giải thích 500 chữ cách output JSON, hãy đưa vài cặp **input → output** chuẩn để “neo” hành vi.
        
        **Ví dụ callbot:** 3 đoạn hội thoại mẫu:
        
        - Khách nói mơ hồ → bot hỏi đúng 1 câu để làm rõ
        - Khách cung cấp nhiều thông tin một lần → bot chỉ hỏi phần còn thiếu
        - Khách đổi giờ/đổi tuyến → bot cập nhật state đúng
        
        ---
        
        ### Trụ 3 — Retrieved Knowledge (RAG) = “Encyclopedia” (bách khoa thư đặt dưới bàn)
        
        Bài ví RAG như **catalog/bách khoa thư để dưới bàn**: **có sẵn nhưng không đặt hết lên bàn**. Bạn **không đổ cả 500 trang** lên workbench; bạn chờ user hỏi “stand mixer” rồi chỉ lấy **đúng trang 42** đặt lên đúng lúc. Bài gọi đây là “surgical context insertion” (tiêm context phẫu thuật, đúng-chỗ-đúng-lúc).
        
        **Ví dụ callbot:** user hỏi “giờ chạy/giá/điểm đón” → retrieve đúng đoạn KB cho tuyến đó, ngày đó (không nhét toàn bộ KB nhà xe).
        
        ---
        
        ## 3) Cách áp dụng ngay (rất thực dụng)
        
        Bạn có thể coi đây là “layout bàn”:
        
        - **Blueprint (System)**: chỉ giữ **luật cốt lõi** (đừng nhét guideline dài dòng).
        - **Prototypes (Few-shot)**: 3–7 mẫu cho các case hay lỗi nhất.
        - **Encyclopedia (RAG)**: chỉ bơm **đoạn liên quan trực tiếp** tới intent/slot hiện tại.
- **Prompt Engineering Is Dead. Long Live Context Engineering**
    
    ## 1) Luận điểm chính của bài
    
    Bài nói: *vấn đề không nằm ở “viết prompt hay hơn”*, mà nằm ở **tạo ra “môi trường thông tin” đủ đúng** để model **chỉ còn một đường hợp lý để trả lời**. Tác giả gọi đó là chuyển từ “nói cho model làm” sang “chuẩn bị ngữ cảnh để model tự làm đúng”.
    
    ---
    
    ## 2) Khái niệm lõi: “Giảm nhiễu/giảm mơ hồ” (Entropy Reduction)
    
    Tác giả dùng ẩn dụ *chơi đoán chữ*:
    
    - Bạn vẫy tay mơ hồ → người khác phải đoán giữa vô số khả năng (**mơ hồ cao**).
    - Bạn chỉ vào poster phim → đáp án gần như “lộ diện” (**mơ hồ thấp**).
    
    Trong paper mà bài dẫn, nhóm tác giả định nghĩa context engineering là nỗ lực biến “ý định mơ hồ” thành “biểu diễn ít mơ hồ” để máy hiểu tốt hơn.
    
    ### Dịch sang ngôn ngữ agent
    
    - **Prompt** = cố gắng “nói thật khéo” để model đoán đúng.
    - **Context engineering** = làm sao để **input đã đủ rõ**, model *không cần đoán*.
    
    ---
    
    ## 3) “Context 1.0 vs 2.0” (tư duy đổi vai)
    
    Bài (và paper) chia thời kỳ:
    
    - **1.0**: máy “kém hiểu” → con người phải dịch ý định thành lệnh/menus rất cụ thể.
    - **2.0**: agent/LLM hiểu ngôn ngữ tốt hơn → con người nên chuyển sang **cung cấp tài nguyên + bối cảnh**, thay vì micromanage bằng prompt dài.
    
    **Ý quan trọng:** trong 2.0, prompt dài kiểu “điều khiển từng li từng tí” thường làm tệ đi vì tăng nhiễu.
    
    ---
    
    ## 4) Framework 3 trụ cột trong bài: Collection / Management / Usage
    
    ### Pillar 1 — Collection: “Chỉ lấy đủ dùng” (Minimal Sufficiency)
    
    Đừng “đổ cả đống” (context dump). Hãy **chỉ kéo đúng phần cần cho câu hỏi hiện tại**.
    
    **Ví dụ bán hàng thời trang**
    
    Khách: “Cho xem mẫu **màu đen** và tư vấn size (1m68, 82kg)”
    
    - ✅ Nạp: ảnh màu đen + size rule + giá/ship rule
    - ❌ Không nạp: toàn bộ ảnh mọi màu + toàn bộ mô tả dài + mọi ví dụ size
    
    > “Đủ dùng” = đủ để trả lời đúng, không phải đủ để kể hết catalog.
    > 
    
    ---
    
    ### Pillar 2 — Management: “Self-baking” (ngữ cảnh tự nén lại)
    
    Bài gọi hiện tượng hội thoại dài bị “mốc/loãng” là context rots và gợi ý “self-baking”: cuối phiên dài thì **tóm tắt thành ghi chú có cấu trúc** (tác giả gợi ý JSON) để dùng lại lần sau.
    
    **Ví dụ self-baking summary cho sales thời trang**
    
    ```json
    {
    "customer":{"needs":["xem_mau_den","tu_van_size"],"height_m":1.68,"weight_kg":82},
    "product_focus":"QVT",
    "decisions":["uu_tien_mau_den","size_de_xuat=34"],
    "policies":["khong_hua_giu_hang","mua>=2_mien_ship"]
    }
    
    ```
    
    Bạn dùng khối này thay vì giữ 30 turns verbatim.
    
    ---
    
    ### Pillar 3 — Usage: “Chủ động suy ra” (Proactive Inference)
    
    Mục tiêu cuối là: nếu bạn phải nhắc “viết Python chuẩn của team” hay “đừng dùng từ X” mỗi lần → nghĩa là **môi trường chưa đủ rõ**. Context tốt khiến model tự mặc định đúng “đường ray”.
    
    **Ví dụ**
    
    - Có “Brand voice” + “format trả lời” ổn định → bạn chỉ cần hỏi: “Soạn tin nhắn chốt đơn”.
    - Agent tự ra đúng tone, đúng cấu trúc, đúng chính sách.
    
    ---
    
    ## 5) 2 “đường triển khai” mà bài gợi ý (rất hợp production)
    
    ### Path A (Developer): “Context as Code”
    
    Bài đưa ví dụ kiểu Gemini CLI: tạo file `CONTEXT.md`/`.cursorrules`/`GEMINI.md` trong repo, ghi các “điều không thương lượng”.
    
    **Áp vào agent của team**
    
    - repo/prompt pack có: `POLICY.md`, `STYLE.md`, `TOOL_RULES.md`
    - runtime chỉ nạp phần cần + cache phần ổn định
    
    ### Path B (Non-dev): “Manual cho chính mình”
    
    Tạo “hồ sơ làm việc” (ai là tôi, style, mục tiêu quý này…) để khỏi phải giới thiệu lại.
    
    ---
    
    ## 6) Mapping trực tiếp sang “context loader” cho agent của bạn
    
    Bài này thực chất đang mô tả đúng 4 nhiệm vụ bạn đã tổng hợp:
    
    - **Select** = Minimal sufficiency (chọn đúng mảnh cần)
    - **Shape** = đóng gói thành “biểu mẫu” (JSON/schema) để giảm mơ hồ
    - **Place** = đặt “đường ray” (policy/stable rules) thành môi trường mặc định
    - **Refresh** = self-baking + multi-window + cập nhật theo turn
    
    ---
    
    ## 7) Nhận xét nhanh: cái gì “chắc”, cái gì “mang tính viễn cảnh”
    
    - Phần **entropy reduction**, **collection/management/usage**, **self-baking** có nền từ paper và rất thực dụng cho production.
    - Phần “Context 3.0 AI tự quan sát bạn, tự update sở thích…” là **dự đoán tương lai** (đọc để định hướng, không nên coi là yêu cầu hệ thống ngay bây giờ).
    
    ---
    
    ## 8) Checklist áp dụng ngay cho team (ngắn, dễ triển khai)
    
    1. **Đặt “context budget” theo slot**: instructions / facts / tool results / history
    2. **RAG theo câu hỏi**: chỉ top-k chunks liên quan, không dump catalog
    3. **Self-baking trigger**: ≥20 turns hoặc khi “đổi chủ đề” → tạo summary JSON
    4. **Context as code**: stable rules để file (dễ versioning, dễ review PR)
    5. **Đặt mục tiêu**: giảm prompt dài; tăng “mặc định đúng” nhờ môi trường
- **Memory for AI Agents: A New Paradigm of Context Engineering 🧠**
    
    ## 1) Tư tưởng chính của bài: “Memory không còn là tối ưu, mà là xương sống”
    
    Bài lập luận rằng cách làm kiểu “mỗi lần gọi LLM là một lần quên sạch” (stateless) không còn phù hợp khi bạn xây **agent** (có kế hoạch, theo mục tiêu dài hơi, tự sửa sai, làm việc qua nhiều lượt). Trong thế giới agent, **memory trở thành “khối kiến trúc lõi”** chứ không phải tính năng phụ.
    
    ### Từ prompt → context engineering (dịch sang ngôn ngữ hệ thống)
    
    - Prompt engineering hỏi: “Viết câu này sao cho *lần này* model trả lời hay?”
    - Context engineering hỏi sâu hơn: “Agent cần **nhớ gì, quên gì, tìm lại gì, ưu tiên gì theo thời gian**?”
    
    ---
    
    ## 2) “Memory” trong bài nghĩa là gì (không phải chat history)
    
    Bài nhấn mạnh: **memory ≠ lịch sử chat**. Memory của agent bao gồm:
    
    - quyết định & kết quả trước đó
    - sở thích người dùng & kiểu hành vi lặp lại
    - luật/ràng buộc học được (constraints)
    - “ảnh chụp kiến thức” từ nguồn ngoài (external snapshots)
    - sai lầm & các lần người dùng sửa bot
    
    Điểm quan trọng: memory phải **có cấu trúc**, **truy hồi được**, và **có chọn lọc** (không phải cái gì cũng nhớ).
    
    ---
    
    ## 3) 4 lớp memory (rất hợp để thiết kế hệ thống)
    
    Bài chia memory thành các lớp tự nhiên của agent:
    
    1. **Working memory (bộ nhớ đang làm việc)**
        
        Là phần nằm trong context window hiện tại — thứ agent “đang nghĩ” ngay lúc này.
        
    2. **Short-term memory (ngắn hạn)**
        
        Các tương tác gần đây / trạng thái tạm thời, thường sẽ “mờ dần” hoặc được tóm tắt theo thời gian.
        
    3. **Long-term memory (dài hạn)**
        
        Lưu bên ngoài (vector DB, key-value, record có cấu trúc). Đây là nơi “kiến thức tích luỹ”.
        
    4. **Episodic memory (ký ức theo sự kiện/phiên)**
        
        Lưu lại “đã xảy ra gì, đã thử gì, cái gì hiệu quả/không hiệu quả” — rất quan trọng cho phản tư và cải thiện.
        
    
    > Sức mạnh không đến từ 1 lớp, mà đến từ **orchestration** (điều phối) giữa các lớp.
    > 
    
    ---
    
    ## 4) “Memory là truy hồi, không phải lưu trữ” (cái câu đáng dán tường)
    
    Bài cảnh báo anti-pattern: **lưu hết rồi hy vọng retrieval tự đúng** → sẽ hỏng nhanh.
    
    Một hệ memory tốt được định nghĩa bởi 4 câu hỏi:
    
    - **Viết gì vào memory** (write)
    - **Index thế nào** để tìm lại nhanh/đúng (index)
    - **Khi nào lôi ra** (retrieve)
    - **Vì sao lôi ra** (why surfaced)
    
    Retrieval bản chất là “một hành vi có lý do”: agent phải tự quyết **cái gì từ quá khứ liên quan đến hiện tại** (kết hợp semantic search, độ mới, hiểu nhiệm vụ).
    
    ---
    
    ## 5) Memory làm agent “đổi tính cách hành vi” như thế nào
    
    Không có memory → agent phản ứng kiểu “hỏi gì đáp nấy”.
    
    Có memory → agent bắt đầu **thích nghi**:
    
    - cá nhân hoá (“người này thích câu trả lời ngắn”)
    - học từ thất bại (“lần trước cách này fail”)
    - theo mục tiêu dài (“mục tiêu kéo dài nhiều phiên”)
    - tự sửa (“mình đã hiểu sai trước đây”)
    
    ---
    
    ## 6) Rủi ro: memory tệ còn nguy hiểm hơn không có memory
    
    Bài liệt kê failure modes:
    
    - **Over-retrieval**: lôi quá nhiều thứ không liên quan
    - **Stale memory**: ký ức cũ ảnh hưởng quyết định mới
    - **Reinforce sai**: củng cố giả định sai thành “sự thật”
    - **Privacy / leakage**: rò rỉ dữ liệu người dùng
    
    > Memory khuếch đại cả thông minh lẫn sai lầm → nếu không có governance thì thành “nợ kỹ thuật”.
    > 
    
    ---
    
    ## 7) Memory là quyết định sản phẩm (không chỉ kỹ thuật)
    
    Những câu “PM-level” mà bài bắt buộc team phải trả lời:
    
    - Có nhớ **qua phiên** không?
    - Memory theo **user** hay “dùng chung”?
    - User có được **xem/sửa/xoá** memory không?
    - Memory tồn tại **bao lâu** (TTL/retention)?
    
    ---
    
    # 8) Ví dụ 1 — Agent bán hàng thời trang (chat)
    
    Giả sử bạn đang tư vấn **QUẦN VẢI TĂM (QVT)** như context bạn gửi.
    
    ## 8.1 Nên nhớ gì? (chọn lọc)
    
    **Nên nhớ (có ích, ít rủi ro):**
    
    - Size profile: chiều cao, cân nặng (và nếu có: vòng bụng, thích ôm hay rộng)
    - Sở thích màu: hay chọn đen/xanh than…
    - “Chính sách mua” mà khách hay áp dụng: thường mua 2 để miễn ship
    - Những lần khách sửa bot: “mình không thích ống rộng”, “mình không mặc màu kem”
    
    **Không nên nhớ lâu (dễ stale / dễ sai):**
    
    - Tồn kho “còn size 34 không” (phải gọi tool/DB realtime)
    - Giá nếu giá thay đổi thường xuyên (nếu thay đổi nhiều, chỉ nên nhớ “range” + luôn lấy lại giá hiện tại từ nguồn chuẩn)
    
    ## 8.2 Schema memory gợi ý (dễ retrieval)
    
    **Long-term (profile)**
    
    ```json
    {
    "user_profile":{
    "height_m":1.68,
    "weight_kg":82,
    "fit_preference":"thoai_mai",
    "color_preference_rank":["den","xanh_than"],
    "notes":["thich_tu_van_ngan"]
    }
    }
    
    ```
    
    **Episodic (phiên gần nhất)**
    
    ```json
    {
    "last_session":{
    "product_focus":"QVT",
    "asked":["xem_mau_den","tu_van_size"],
    "recommended_size":"34",
    "decision":{"color":"den","qty_hint":2}
    }
    }
    
    ```
    
    ## 8.3 Context “nạp vào LLM” (ngắn mà đúng)
    
    Khi khách hỏi:
    
    > “Cho em xem mẫu màu đen và tư vấn size, cao 1m68 nặng 82kg”
    > 
    
    Bạn **không cần dump toàn bộ mô tả + mọi màu**. Chỉ cần:
    
    - Ảnh **màu đen**
    - Rule chọn size (đủ phần liên quan)
    - Giá/ship rule (để gợi ý mua 2 miễn ship)
    - User memory (đã có 1m68/82kg thì khỏi hỏi lại)
    
    Ví dụ assembly:
    
    ```
    [INSTRUCTIONS]
    - Tư vấn 1 câu / 1 ý.
    - Không bịa tồn kho. Nếu thiếu dữ liệu thì hỏi 1 câu.
    
    [USER_MEMORY]
    height_m=1.68, weight_kg=82, prefers_colors=[den,xanh_than]
    
    [PRODUCT_FACTS_QVT_MIN]
    colors: [ghi_nhat, xanh_than, kem, ghi_dam, den]
    black_image: <url>
    size_rule_excerpt:
    - 1m68 & 82kg -> size 34
    pricing_shipping:
    - mua 1: 229k + ship 20k
    - mua >=2: miễn ship
    
    [USER_QUERY]
    ...
    
    ```
    
    ## 8.4 “Write trigger” (khi nào ghi vào memory)
    
    - Khi user cung cấp **số đo** (height/weight/waist) → update profile
    - Khi user nói “mình thích màu đen” → update preference rank
    - Khi user sửa bot (“mình cao 1m66 chứ không phải 1m68”) → ghi correction (episodic + update profile)
    
    ---
    
    # 9) Ví dụ 2 — Chatbot/Voicebot nhà xe (đặt vé, FAQ, tuyến/điểm)
    
    Với nhà xe, memory phải **cẩn thận hơn** vì:
    
    - lịch chạy / chỗ trống thay đổi theo ngày giờ → stale rất nhanh
    - thông tin người gọi có thể nhạy cảm → cần scope + retention rõ
    
    ## 9.1 Chia 2 loại memory: “chung hệ thống” vs “theo khách”
    
    ### A) Memory dùng chung (system/global)
    
    Cái này giống “kiến thức vận hành”, giúp bot ngày càng ít sai:
    
    - alias địa danh: “BX Mỹ Đình” = “Mỹ Đình”, “Gia Nghĩa” thuộc Đắk Nông…
    - luật nghiệp vụ: không hứa giữ chỗ, phải gọi tool để xem chuyến, cách hỏi từng trường…
    - các lỗi hay gặp + cách tránh (episodic dạng “postmortem”)
    
    ### B) Memory theo khách (user-scoped)
    
    Chỉ nên nhớ các thứ thật sự giúp giảm hỏi lại:
    
    - tuyến hay đi (ví dụ: HN ⇄ Đắk Nông)
    - điểm đón/trả hay chọn
    - khung giờ thích (tối/đêm)
    - ngôn ngữ xưng hô / cách nói ngắn gọn
    
    **Không nên nhớ** “còn ghế A1” hay “chuyến 20:00 hôm nay còn 5 chỗ” (stale, phải gọi tool).
    
    ## 9.2 Schema memory gợi ý cho nhà xe
    
    **User-scoped (nếu bạn cho phép nhớ qua phiên)**
    
    ```json
    {
    "rider_profile":{
    "preferred_routes":[{"from":"HaNoi","to":"DakNong","route_code":"HN-DNONG"}],
    "pickup_preferences":["MyDinh"],
    "dropoff_preferences":["GiaNghia"],
    "time_preferences":["toi","dem"],
    "conversation_style":"ngan_gon"
    }
    }
    
    ```
    
    **Episodic (phiên gần nhất)**
    
    ```json
    {
    "last_call_episode":{
    "intent":"dat_ve",
    "route_code":"HN-DNONG",
    "date":"2026-02-10",
    "chosen_departure_time":"20:00",
    "result":"pending_agent_confirm"
    }
    }
    
    ```
    
    **Global “learning log” (giảm lỗi hệ thống)**
    
    ```json
    {
    "ops_memory":[
    {
    "type":"mistake_and_fix",
    "pattern":"User says 'Gia Nghia' -> mapped wrong province",
    "fix":"Alias Gia Nghia => Dak Nong; ask confirm 'Đắk Nông' (tỉnh) trước khi gọi tool",
    "last_seen":"2026-01-28"
    }
    ]
    }
    
    ```
    
    ## 9.3 Retrieval rules (rất quan trọng cho nhà xe)
    
    - Nếu câu hỏi liên quan **còn chỗ / giờ chạy / chuyến** → *luôn* gọi tool realtime, memory chỉ dùng để “gợi ý route_code/điểm đón”.
    - Nếu câu hỏi liên quan **địa danh mơ hồ** → dùng global alias memory để hỏi đúng 1 câu xác nhận (ví dụ xác nhận tỉnh/quận theo quy tắc của bạn).
    - Nếu caller quay lại nhiều lần → user memory giúp bỏ qua các câu hỏi đã chắc chắn (nhưng vẫn phải cho họ cơ hội sửa).
    
    ## 9.4 Write triggers
    
    - Khi khách nói “lần nào em cũng đi từ Mỹ Đình” → update pickup preference
    - Khi khách sửa “không phải Gia Nghĩa, em xuống Đắk Mil” → ghi correction + update dropoff preference
    - Khi bot bị sai mapping → ghi “ops_memory” để cả hệ thống bớt sai lần sau
    
    ---
    
    # 10) Gợi ý “bài bản hoá” thành 1 pipeline memory cho team
    
    Bạn có thể chuẩn hoá thành 4 bước (khớp 4 câu hỏi trong bài):
    
    1. **Memory Write (ghi)**: ghi theo sự kiện (preference / correction / decision / outcome)
    2. **Index (lập chỉ mục)**: theo entity (route_code, stop_id, product_id), theo thời gian, theo “độ tin cậy”
    3. **Retrieve (kéo lên)**: filter theo nhiệm vụ + recency + semantic
    4. **Surface (đưa vào context)**: đưa dạng “schema ngắn”, không dump
    
    Nhìn đúng tinh thần bài: cái khác biệt nằm ở **nhớ/quên/truy hồi có chọn lọc**.
    
- **Agentic Memory**
    
    ## 1) Bài này nói gì khác với các bài “memory” bạn đọc trước?
    
    ### 1.1 “Context window ≠ Memory” (đừng nhầm)
    
    Bài nhấn mạnh: context window chỉ giúp **nhớ trong phiên**, còn memory mới giúp **nhớ qua nhiều phiên** và có **tính chọn lọc + bền vững**. Nạp nhiều tokens không giải quyết được “nhớ lâu” vì vẫn thiếu **persistence + salience (độ nổi bật) + ưu tiên** và còn làm tăng chi phí/độ trễ.
    
    ### 1.2 “RAG ≠ Memory”
    
    RAG kéo “kiến thức” vào để trả lời đúng hơn, nhưng bản chất vẫn **stateless** (không hiểu lịch sử tương tác, không hiểu người dùng là ai). Memory thì lưu **ưu tiên, quyết định, thất bại, sở thích**, giúp agent **cư xử thông minh hơn** chứ không chỉ “trả lời đúng hơn”.
    
    > Tóm gọn theo ngôn ngữ agent: **RAG = biết thêm**, **Memory = hành xử tốt hơn**.
    > 
    
    ---
    
    ## 2) Khung “3 trụ” của Memory trong agent (rất đáng dùng)
    
    Bài định nghĩa memory trong agent dựa trên 3 thứ:
    
    - **State**: biết “đang xảy ra gì ngay bây giờ”
    - **Persistence**: giữ được kiến thức qua nhiều lần tương tác
    - **Selection**: quyết định “cái gì đáng nhớ”
    
    Nếu thiếu “selection” thì memory thành bãi rác (sau này retrieval kéo nhầm → agent tự phá).
    
    ---
    
    ## 3) Các loại memory (bài chia rõ và dễ áp dụng)
    
    ### 3.1 Short-term / Working memory
    
    Những thứ agent cần “giữ trong đầu ngay lúc nói chuyện”: vài lượt chat gần nhất + biến trạng thái tạm + tiêu điểm hiện tại.
    
    ### 3.2 Long-term memory gồm 3 nhánh
    
    1. **Procedural memory**: “cách làm/logic” của agent (giống “cơ bắp” – thành thói quen)
    2. **Episodic memory**: ký ức theo sự kiện/phiên (những lần đã xảy ra, đã phản hồi, đã bị sửa)
    3. **Semantic memory**: facts dạng “bách khoa” (ai là đầu mối, chính sách, dữ liệu chuẩn… thường truy bằng search/semantic)
    
    > Điểm hay của bài: không chỉ nói “nhớ cái gì”, mà còn chỉ cách **dùng procedural + episodic + semantic** để tạo agent “học được và cải thiện”.
    > 
    
    ---
    
    ## 4) Quản lý short-term memory: đừng để hội thoại dài làm nổ context
    
    Bài đưa các chiến thuật phổ biến để không vượt context window:
    
    - **Trimming**: cắt bớt message đầu/cuối trước khi gọi LLM
    - **Summarization**: tóm tắt message cũ rồi thay bằng summary
    - **Delete messages**: xóa khỏi state (khi biết chắc không cần)
    
    Đây chính là multi-window bạn đang dùng, nhưng bài nhấn mạnh “có công cụ/chiến thuật rõ ràng”, không làm kiểu cảm tính.
    
    ---
    
    ## 5) “Viết memory” (write) – có 2 cách và mỗi cách hợp một tình huống
    
    ### 5.1 Viết memory “trên đường chạy chính” (hot path)
    
    Ưu điểm: nhớ ngay, có thể thông báo user, hành vi tức thì. Nhược điểm: tăng latency và dễ “nhớ bừa” nếu không có rule.
    
    ### 5.2 Viết memory “ở nền” (background)
    
    Ưu điểm: không tăng latency, tách logic chính khỏi logic memory, dễ batch/khử trùng lặp.
    
    Nhược điểm: memory “chậm 1 nhịp” (không có ngay trong turn hiện tại).
    
    **Gợi ý thực dụng**
    
    - Thời trang: thường chọn **hot path** cho số đo/sở thích (vì dùng ngay).
    - Nhà xe: ưu tiên **background** cho “postmortem/ops memory”, còn trạng thái đặt vé nên nằm ở state (short-term) và tool/DB.
    
    ---
    
    ## 6) Cách bài “gắn memory vào agent stack” (thực chiến)
    
    Bài dùng mô hình kiểu LangGraph:
    
    - **Short-term**: lưu theo `thread_id` bằng checkpointer → agent có “thread persistence” (nhớ trong một luồng hội thoại).
    - **Long-term**: dùng “store” theo `user_id`, lưu theo namespace và cho phép **search** memory theo query.
    - Có cả phần “manage checkpoints” để xem/xóa state đã lưu.
    
    Điểm quan trọng: memory được tổ chức theo **namespace** (tức là “đúng kho, đúng người”), không trộn lẫn.
    
    ---
    
    ## 7) Case study trong bài: “Email agent” – vì sao đáng học?
    
    Bài dựng một email agent theo từng bước và “dệt” 3 loại long-term memory vào:
    
    - **Procedural memory**: prompt template cho khâu triage được lưu trong store và có thể cập nhật
    - **Episodic memory**: triage kéo các ví dụ phân loại tương tự từ các lần trước (few-shot động)
    - **Semantic memory**: tool để lưu/tìm facts (manage/search memory tool)
    
    Tức là: agent không chỉ “nhớ facts”, mà còn **nhớ cách làm** và **nhớ các ví dụ đã từng xử lý** để phân loại tốt hơn.
    
    ---
    
    # 8) Áp dụng cho bài toán A: Tư vấn bán hàng thời trang
    
    ## 8.1 Map 3 loại memory vào shop thời trang
    
    ### Procedural memory (cách làm)
    
    - Luật đối thoại: “mỗi câu 1 ý”, “không hứa giữ hàng”, “nếu thiếu thông tin thì hỏi 1 câu”
    - Flow chốt đơn / tư vấn size / tư vấn màu
        
        → thứ này nên version hoá như “prompt template” (giống triage prompt trong bài).
        
    
    ### Episodic memory (ký ức)
    
    Lưu những lần quan trọng:
    
    - “Khách này ghét màu kem”
    - “Khách từng phàn nàn tư vấn dài dòng”
    - “Lần trước khách chọn size 34, thích ống suông”
        
        → episodic hợp để kéo lên làm “few-shot cá nhân hoá” (như bài kéo ví dụ triage).
        
    
    ### Semantic memory (facts)
    
    - profile ổn định: chiều cao/cân nặng, fit preference
    - chính sách mua hàng (nếu ít đổi): “mua ≥2 miễn ship”
        
        → dùng semantic retrieval theo query, không nhét hết vào prompt.
        
    
    ## 8.2 Schema memory gợi ý (ngắn – dễ retrieval)
    
    **User semantic profile**
    
    ```json
    {
    "user_profile":{
    "height_cm":168,
    "weight_kg":82,
    "fit_preference":"thoai_mai",
    "color_rank":["den","xanh_than"],
    "response_style":"ngan"
    }
    }
    
    ```
    
    **Episodic: last decisions**
    
    ```json
    {
    "last_episode":{
    "product":"QVT",
    "asked":["xem_mau_den","tu_van_size"],
    "recommended_size":"34",
    "user_feedback":"ok"
    }
    }
    
    ```
    
    ## 8.3 Rule retrieval (quan trọng hơn “lưu”)
    
    - User hỏi **size** → kéo profile (height/weight) + rule size của sản phẩm + trả size
    - User hỏi **mẫu màu đen** → kéo đúng **link ảnh màu đen** (không dump cả album)
    - User hỏi **giá/ship** → kéo block giá/ship (đúng phiên bản)
    
    > Bài nhấn mạnh “selection”: chỉ đưa thứ đáng nhớ/đáng dùng.
    > 
    
    ---
    
    # 9) Áp dụng cho bài toán B: Chatbot/Voicebot nhà xe
    
    Nhà xe khác thời trang ở chỗ: **thông tin “động” rất nhiều** (chuyến, ghế, giá theo ngày), nên memory phải có “kỷ luật”.
    
    ## 9.1 Nguyên tắc vàng
    
    - **Memory không được thay tool realtime** cho các thứ thay đổi theo ngày/giờ (còn ghế, chuyến nào còn chỗ…).
    - Memory chỉ dùng để: **giảm hỏi lại**, **gợi ý route/điểm**, **cá nhân hoá cách nói**, và **học từ lỗi**.
    
    Điều này khớp với ý trong bài: RAG/memory giải 2 vấn đề khác nhau; tool/retrieval phải đúng vai.
    
    ## 9.2 Map 3 loại long-term memory cho nhà xe
    
    ### Procedural memory
    
    - Quy tắc hỏi thông tin đặt vé theo flow (điểm đi/đến → ngày → giờ → điểm đón/trả → số vé → tên…)
    - Quy tắc xác nhận địa danh theo cấp hành chính (bạn đang rất chặt chẽ phần này)
        
        → đây là “muscle memory” của bot.
        
    
    ### Episodic memory
    
    - “Khách A hay đi tuyến HN ↔ Đắk Nông”
    - “Khách B hay đón ở Mỹ Đình”
    - “Lần trước bot mapping sai Gia Nghĩa, cần hỏi xác nhận tỉnh trước”
        
        → episodic rất mạnh để giảm lỗi mapping và giảm số câu hỏi thừa (như bài dùng episodic examples).
        
    
    ### Semantic memory
    
    - Alias địa danh / stop groups / quy ước nội bộ (STOP_MATRIX nếu bạn quyết định đưa vào KB)
    - “Điểm nào thuộc tuyến nào” (tài sản tri thức ổn định)
        
        → semantic search để lôi đúng mảnh.
        
    
    ## 9.3 Schema memory gợi ý (an toàn, ít rủi ro)
    
    **User preference (không lưu PII nhạy cảm)**
    
    ```json
    {
    "rider_pref":{
    "preferred_routes":["DNONG-HN","HN-DNONG"],
    "pickup_rank":["MyDinh"],
    "dropoff_rank":["GiaNghia"],
    "time_pref":["toi","dem"],
    "style":"ngan"
    }
    }
    
    ```
    
    **Ops episodic (học từ lỗi hệ thống)**
    
    ```json
    {
    "ops_episode":{
    "pattern":"Gia Nghia bi nham tinh",
    "fix":"Hoi xac nhan 'Tinh nao' truoc khi goi tool",
    "last_seen":"2026-01-xx"
    }
    }
    
    ```
    
    ## 9.4 Retrieval rules (đặt ưu tiên)
    
    1. Nếu user hỏi “còn chỗ/giờ chạy hôm nay” → **tool realtime** trước
    2. Nếu user nói địa danh mơ hồ → dùng semantic alias + hỏi xác nhận 1 câu
    3. Nếu user hỏi lại cùng tuyến quen thuộc → dùng rider_pref để bỏ qua bước hỏi lại (nhưng vẫn cho phép sửa)
    
    ---
    
    # 10) Checklist “hóa bài này thành quy chuẩn team”
    
    ### A) Memory Spec (mỗi agent nên có 1 trang)
    
    - Nhớ gì? (fields)
    - Không nhớ gì? (anti-fields)
    - Khi nào ghi? (write triggers: hot path hay background)
    - Khi nào kéo lên? (retrieve triggers)
    - TTL/retention + quyền xoá
    
    ### B) Cấu trúc kho (namespace)
    
    - per user / per org / per bot_version
        
        Bài minh hoạ lưu theo namespace user_id để không trộn lẫn.
        
    
    ### C) “Procedural memory” phải version hoá
    
    Giống bài email agent: prompt template triage nằm trong store và được retrieve mỗi lần chạy, nghĩa là bạn có thể cập nhật “cách làm” mà không sửa code nặng.