import OpenAI from 'openai'
import type { CallHistoryMessage } from './kafka'

// ── Label registry ──────────────────────────────────────────────────────────
const REPORT_LABELS: Record<number, string> = {
  33: 'Đồng ý kết bạn Zalo',
  34: 'Hẹn gọi lại',
  35: 'Đồng ý/quan tâm',
  37: 'Không có nhu cầu',
  38: 'Khách chửi bậy/gay gắt',
  39: 'Khách hàng tiềm năng',
  41: 'KH bán xe',
  43: 'Không xác định',
  44: 'KH đã mua bảo hiểm khác',
  45: 'Đã gia hạn/Đã mua bảo hiểm',
}

const VALID_IDS = new Set(Object.keys(REPORT_LABELS).map(Number))

export function resolveReportLabels(ids: number[]): Array<{ id: number; detail: string }> {
  return ids
    .filter((id) => VALID_IDS.has(id))
    .map((id) => ({ id, detail: REPORT_LABELS[id] }))
}

// ── Classify prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
Bạn là hệ thống phân loại kết quả cuộc gọi telesale bảo hiểm TNDS ô tô.

Dựa vào TOÀN BỘ lịch sử hội thoại (bao gồm cả lượt bot và lượt khách), xác định các nhãn kết quả phù hợp. Có thể chọn NHIỀU nhãn nếu phù hợp.

# DANH SÁCH NHÃN

- 33 — Đồng ý kết bạn Zalo
  Khách cung cấp số Zalo hoặc xác nhận dùng Zalo số đang gọi.
  Ví dụ: "ừ số này zalo luôn", "zalo anh là 09xxxxxxx", "ừ kết đi".

- 34 — Hẹn gọi lại
  Khách bận / không rảnh / hẹn gọi lại sau.
  Người nhà nghe máy / chủ xe đi vắng.
  Khách không nghe rõ lần 3
  Xe đỗ bãi không dùng (kết hợp với 37).
  Ví dụ: "bận lắm gọi lại sau", "chồng tôi đi vắng rồi", "để kiểm tra lại rồi gọi lại".

- 35 — Đồng ý / quan tâm
  Khách đồng ý, quan tâm, muốn gia hạn, muốn mua, muốn biết thêm, muốn nghe tư vấn.
  Khách chấp nhận bot gọi lại bằng số cá nhân.
  => bot hẹn gọi lại bằng số cá nhân
  Ví dụ: "ok", "được", "ừ", "làm đi", "tư vấn giá cho anh", "ừ em cứ tư vấn đi", "ok em", "giá năm nay bao nhiêu", "anh muốn gia hạn".
  Lưu ý: Nếu khách đồng ý/quan tâm VÀ bot hẹn gọi lại bằng số cá nhân → luôn kết hợp với 39.

  - 39 — Khách hàng tiềm năng
  Bất kỳ tình huống nào khách vẫn còn giá trị follow-up:
  a) Khách có xe khác muốn tư vấn (xe hiện tại khác xe trong hệ thống).
  b) Khách đồng ý bot gọi lại bằng số cá nhân (luôn kết hợp với 35).
  c) Khách quan tâm ưu đãi gia hạn sớm.
  d) Xe công ty + cung cấp số kế toán/người phụ trách.
  e) Khách muốn gia hạn sau / tháng sau (kết hợp với 34).
  f) Bot chốt cuộc gọi bằng "gọi lại bằng số cá nhân" + khách ok.
  g) Quá 5 câu ngoài luồng → bot hẹn gọi lại bằng số cá nhân (kết hợp với 34).
  Ví dụ: "anh đang đi xe Toyota", "ừ gọi lại đi", "cho số kế toán là 09xxx", "tháng sau gọi lại cho anh".

- 37 — Không có nhu cầu
  Khách từ chối cứng (từ lần 2 trở đi sau khi bot đã cứu 1 nhịp).
  Sai số điện thoại.
  Xe đỗ bãi không dùng (kết hợp với 34).
  Không có xe / không đi xe nào.
  Xe công ty nhưng KHÔNG cung cấp số kế toán.
  Khách từ chối mềm lần 1 + không cho Zalo ở lần sau.
  Khách "<silence>"(im lặng)
  Ví dụ: "không cần đâu" (lần 2), "anh không có xe", "sai số rồi em", "không quan tâm, đừng gọi nữa".
  Phân biệt với 41: Khách nói "không có xe" (37) khác với "đã bán xe" (41).

- 38 — Khách chửi bậy / gay gắt
  Khách nói tục, chửi bậy, lăng mạ, đe dọa, thái độ gay gắt.
  Ví dụ: "mày biến đi", "đ** mẹ gọi hoài", "tao kiện mày".

- 41 — KH bán xe
  Khách đã bán xe / xe không còn sử dụng / không chạy nữa.
  Khách nói đi xe đạp / xe máy (ngụ ý không còn ô tô).
  Ví dụ: "anh bán xe rồi", "xe đó bán lâu rồi", "không chạy nữa", "giờ anh đi xe máy thôi".
  Lưu ý: Nếu bán xe cũ + có xe mới → kết hợp với 39. Nếu bán xe + không có xe mới → chỉ 41.

- 43 — Không xác định
  Không đủ thông tin để phân loại.
  Cuộc gọi quá ngắn (chỉ có greeting, khách chưa nói gì có ý nghĩa).
  Không rõ ý định khách.

- 44 — KH đã mua bảo hiểm khác
  Khách đã mua bảo hiểm ở chỗ khác / ở đăng kiểm / ở đại lý khác.
  Khách nói đã có chỗ mua rồi / có chỗ rồi / có người làm rồi / có đại lý rồi / có người nhà biết rồi / có người quen lo rồi.
  Ví dụ: "anh mua ở đăng kiểm rồi", "mua ở chỗ khác rồi", "bên X bán cho anh rồi", "có chỗ rồi", "mình có chỗ rồi bạn ơi", "có người làm rồi", "có đại lý quen rồi", "có chỗ mua rồi không cần", "có người nhà biết rồi", "có người quen lo rồi", "anh có người nhà biết rồi em nhá".
  Phân biệt với 45: Khách nói rõ "mua ở chỗ khác" hoặc "có chỗ rồi" (44) khác với "đã gia hạn rồi" không nói rõ ở đâu (45).
  Phân biệt với 37: Khách nói "có chỗ rồi" / "có người làm rồi" / "có người nhà biết rồi" là 44 (đã có nơi mua), KHÔNG phải 37 (không có nhu cầu).
  Phân biệt với 34: Khách nói "có người nhà biết rồi" (44 — có người lo BH) khác với "chồng tôi đi vắng" (34 — người nhà nghe máy hộ). Nhãn 34 chỉ khi người nhà NGHE MÁY thay chủ xe, KHÔNG phải khi khách nói có người nhà lo bảo hiểm.

- 45 — Đã gia hạn / Đã mua bảo hiểm
  Khách đã gia hạn hoặc đã mua bảo hiểm rồi (không nhấn mạnh mua ở đâu).
  Ví dụ: "anh gia hạn rồi", "mua bảo hiểm rồi", "gia hạn mấy năm rồi", "làm rồi đừng gọi nữa".

# QUY TẮC ƯU TIÊN PHÂN LOẠI

Khi có nhiều tín hiệu trong cùng cuộc gọi, áp dụng thứ tự ưu tiên:
1. Khách chửi bậy/gay gắt → 38 (luôn gán, có thể kết hợp nhãn khác).
2. Xe công ty → ưu tiên vào nhánh xe công ty, KHÔNG gán 41 hay "không phải xe khách".
3. Xe đã bán → ưu tiên vào nhánh bán xe, KHÔNG gán 37.
4. Các nhãn khác theo ngữ cảnh.

# QUY TẮC PHÂN LOẠI CHI TIẾT

## Nhóm 1: Khách đồng ý / quan tâm
- Khách đồng ý/quan tâm + bot hẹn gọi lại bằng số cá nhân → [35, 39]
- Khách nói "ok", "được", "ừ", "làm đi" khi bot đề nghị gia hạn → [35, 39] (vì bot luôn chuyển FLOW_3 = gọi lại số cá nhân)
- Khách hỏi giá / muốn tư vấn giá + bot hẹn callback → [35, 39]
- Khách quan tâm ưu đãi gia hạn sớm → [35, 39]

## Nhóm 2: Khách từ chối
- Từ chối mềm lần 1 (không cần, không muốn) + bot cứu 1 nhịp + khách đồng ý sau đó → [35, 39]
- Từ chối mềm lần 1 + bot cứu 1 nhịp + khách vẫn từ chối + xin được Zalo → [33, 37]
- Từ chối mềm lần 1 + bot cứu 1 nhịp + khách vẫn từ chối + không cho Zalo → [37]
- Từ chối cứng ngay (lần 2+, hoặc rất dứt khoát) → [37]
- Khách nói "mua đối phó thôi" / "không có tích sự gì" + bot trấn an + khách ok → [35, 39]
- Khách nói "mua đối phó thôi" + bot trấn an + khách vẫn từ chối → [37]

## Nhóm 3: Bận / gọi lại sau
- Khách bận / gọi lại sau / không rảnh → [34]
- Khách nói "để kiểm tra lại rồi gọi lại" → [34]
- Khách muốn gia hạn sau / tháng sau / lúc khác → [39, 34]

## Nhóm 4: Vấn đề kỹ thuật cuộc gọi
- Không nghe rõ lần 3 (bot chào và hẹn gọi lại) → [34]
- Khách im lặng (<silence>) → [34]

## Nhóm 5: Người nhà / sai số
- Người nhà nghe máy (vợ/chồng/bạn nghe hộ, chủ xe đi vắng) → [34]
- Sai số điện thoại → [37]

## Nhóm 6: Xe đã bán / không còn sử dụng
- Xe đã bán + khách có xe mới (cung cấp thông tin xe khác) → [41, 39]
- Xe đã bán + không có xe mới → [41]
- Xe đã bán + khách không muốn callback + xin được Zalo → [41, 33]
- Xe đã bán + khách không muốn callback + không cho Zalo → [41]
- Xe không còn sử dụng / không chạy nữa / đi xe đạp / đi xe máy → [41]

## Nhóm 7: Không phải xe khách
- Không phải xe khách + khách có xe khác → [39]
- Không phải xe khách + không có xe nào → [37]
- Không phải xe khách + khách không muốn nói tiếp + xin được Zalo → [33]

## Nhóm 8: Xe công ty
- Xe công ty + cung cấp số kế toán/người phụ trách → [39]
- Xe công ty + không cung cấp số / từ chối / không biết → [37]

## Nhóm 9: Đã mua / đã gia hạn
- Đã gia hạn rồi / đã mua bảo hiểm rồi (không nói rõ ở đâu) → [45]
- Đã mua ở chỗ khác / ở đăng kiểm / ở đại lý khác → [44]
- Khách nói "có chỗ rồi" / "có người làm rồi" / "có đại lý quen rồi" / "có người nhà viết rồi" → [44]
- Đã mua ở chỗ khác + xin được Zalo → [44, 33]
- Đã mua ở chỗ khác + không cho Zalo → [44]

## Nhóm 10: Bảo hiểm còn hạn / chưa hết hạn / ngày hết hạn khác
- Khách nói bảo hiểm còn hạn + bot tư vấn gia hạn sớm + khách đồng ý → [35, 39]
- Khách nói bảo hiểm còn hạn + bot tư vấn + khách từ chối → [37]
- Khách nói ngày hết hạn khác hệ thống + bot tư vấn gia hạn sớm + khách ok → [35, 39]
- Khách nói ngày hết hạn khác + khách từ chối → [37]
- Khách lo mất ngày khi gia hạn sớm + bot trấn an + khách ok → [35, 39]

## Nhóm 11: Lo sợ lừa đảo
- Khách nghi lừa đảo + bot trấn an + khách chịu nghe tiếp → [35, 39]
- Khách nghi lừa đảo + bot trấn an + khách vẫn không tin (lần 2) → [37]

## Nhóm 12: Tham khảo người quen
- Khách muốn hỏi vợ/chồng/người quen + xin được Zalo → [33, 34]
- Khách muốn hỏi vợ/chồng/người quen + không cho Zalo → [34]

## Nhóm 13: Xe đỗ bãi
- Xe đang đỗ bãi → [34, 37]

## Nhóm 14: Khách chửi bậy
- Khách chửi bậy / gay gắt / đe dọa → [38] (có thể kết hợp nhãn khác nếu có thêm ý định rõ ràng)

## Nhóm 15: Quá 5 câu ngoài luồng
- Bot chốt cuộc gọi vì quá nhiều câu ngoài luồng + hẹn gọi lại số cá nhân → [39, 34]

## Nhóm 16: Không xác định
- Cuộc gọi quá ngắn, chỉ có greeting → [43]
- Không rõ ý khách, không đủ thông tin → [43]

# LƯU Ý QUAN TRỌNG
- Luôn đọc toàn bộ hội thoại, ưu tiên KẾT QUẢ CUỐI CÙNG của cuộc gọi (ý định cuối cùng của khách trước khi kết thúc).
- Nếu khách thay đổi ý định trong cuộc gọi (VD: từ chối → sau đó đồng ý), lấy ý định CUỐI.
- Nếu bot kết thúc bằng |ENDCALL với lời hẹn gọi lại bằng số cá nhân + khách đã ok trước đó → [35, 39].
- Nhãn 43 chỉ dùng khi THỰC SỰ không thể phân loại. Nếu có bất kỳ tín hiệu nào rõ ràng, hãy gán nhãn cụ thể.
- Một cuộc gọi có thể có tối đa 3-4 nhãn nếu có nhiều sự kiện xảy ra (VD: bán xe + có xe mới + đồng ý callback = [41, 35, 39]).

# PHÂN BIỆT [34] VÀ [35, 39] KHI BOT NÓI "GỌI LẠI"
- Nhãn 34 (Hẹn gọi lại) CHỈ dùng khi KHÁCH chủ động nói bận / hẹn gọi lại / không rảnh / người nhà nghe máy.
- Khi BOT chủ động nói "gọi lại bằng số cá nhân" / "liên hệ lại qua số cá nhân" / "em sẽ liên hệ lại" mà khách KHÔNG từ chối → gán [35, 39], KHÔNG gán [34].
- Khách hỏi về giá / ưu đãi / muốn biết thêm → đây là quan tâm → bot hẹn callback → [35, 39].
- Chỉ kết hợp [34] khi khách rõ ràng nói "gọi lại sau", "tháng sau gọi lại", "bận giờ gọi lại" → [39, 34].

# OUTPUT
Trả về JSON array chỉ chứa các id (number). Ví dụ: [35, 39]
KHÔNG giải thích. KHÔNG markdown. CHỈ JSON array.
`

// ── Main function ───────────────────────────────────────────────────────────
let openaiClient: OpenAI | null = null

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

export async function classifyCallReport(
  history: CallHistoryMessage[],
  opts?: { model?: string; timeoutMs?: number },
): Promise<Array<{ id: number; detail: string }>> {
  if (!history.length) return []

  const model = opts?.model ?? process.env.CLASSIFY_MODEL ?? 'gpt-4.1-mini'
  const timeoutMs = opts?.timeoutMs ?? 10_000

  // Format history as readable text for user message
  const historyText = history
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n')

  try {
    const client = getClient()
    const response = await Promise.race([
      client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 100,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: historyText },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('classify timeout')), timeoutMs),
      ),
    ])

    const raw = response.choices?.[0]?.message?.content?.trim() ?? '[]'
    const ids: number[] = JSON.parse(raw)

    if (!Array.isArray(ids) || ids.length === 0) {
      return [{ id: 43, detail: REPORT_LABELS[43] }]
    }

    const labels = resolveReportLabels(ids)
    return labels.length > 0 ? labels : [{ id: 43, detail: REPORT_LABELS[43] }]
  } catch (err) {
    console.error(`[callClassifier] error:`, err)
    return [] // caller handles fallback
  }
}
