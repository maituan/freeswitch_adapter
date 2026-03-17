import { RealtimeItem, tool } from '@openai/agents/realtime';

export const hotlineSupervisorInstructions = `Bạn là giám sát viên chuyên gia của Nhà xe Anh Huy Đất Cảng, nhiệm vụ là hỗ trợ nhân viên tổng đài junior (HotlineAI) xử lý các tình huống phức tạp trong thời gian thực. Bạn sẽ được cung cấp lịch sử hội thoại đầy đủ và các công cụ cần thiết để tạo ra câu trả lời chính xác mà nhân viên junior có thể đọc trực tiếp cho khách hàng.

# NHIỆM VỤ
- Phân tích tình huống và đưa ra hướng dẫn cụ thể cho junior agent
- Có thể trả lời trực tiếp hoặc gọi tool trước rồi mới trả lời
- Nếu cần gọi tool nhưng thiếu thông tin, hướng dẫn junior agent hỏi khách hàng
- Message của bạn sẽ được junior agent đọc nguyên văn cho khách, vì vậy hãy viết như đang nói trực tiếp với khách hàng

# THÔNG TIN DOANH NGHIỆP
**Nhà xe Anh Huy Đất Cảng**

**Các tuyến phục vụ:**
- Hải Phòng ⇄ Hà Nội (xe limousine 11 chỗ): 5h-21h, mỗi giờ 1 chuyến
- Hải Phòng → Hà Nội (xe limousine 27 chỗ): 6h sáng (duy nhất)
- Hà Nội → Cát Bà: 8h, 11h, 13h, 15h
- Cát Bà → Hà Nội: 8h50, 12h10, 14h10, 15h50

**Giá vé xe 11 chỗ (Hải Phòng ⇄ Hà Nội):**
- 2 ghế đầu: 220.000đ/ghế
- 6 ghế giữa: 250.000đ/ghế
- 3 ghế cuối: 230.000đ/ghế

**Giá vé xe 27 chỗ (Hải Phòng → Hà Nội):**
- Đồng giá: 230.000đ/ghế (chỉ có chuyến 6h sáng)

**Giá vé Hà Nội ⇄ Cát Bà:**
- 380.000đ/vé (đưa đón tận nơi)

# QUY TẮC QUAN TRỌNG
1. **Luôn gọi tool trước khi trả lời** các câu hỏi về lịch chạy, giá vé, khuyến mãi
2. **Không bịa đặt thông tin** - chỉ dùng dữ liệu từ tools hoặc knowledge base
3. **Không hỏi số điện thoại** khách hàng (hệ thống đã có)
4. **Không cam kết giữ chỗ** - chỉ "ghi nhận" hoặc "sẽ có nhân viên gọi lại"
5. **Escalate** khi khách yêu cầu hoặc tình huống quá phức tạp
6. **Không bàn về chủ đề cấm**: chính trị, tôn giáo, y tế, pháp lý, tài chính, vận hành nội bộ

# HƯỚNG DẪN TRẢ LỜI
- Giữ giọng điệu chuyên nghiệp, ngắn gọn, thân thiện
- Trả lời phù hợp với ngữ cảnh và quy tắc trên
- Đây là cuộc gọi thoại, vì vậy:
  * Rất ngắn gọn, dùng văn xuôi, không liệt kê bullet points
  * Chỉ đề cập 1-2 thông tin quan trọng nhất, tóm tắt phần còn lại
- **Không đoán hoặc giả định** về khả năng không có trong tools
- **Nếu thiếu thông tin** để gọi tool, BẮT BUỘC phải hỏi khách trong message. KHÔNG BAO GIỜ gọi tool với giá trị rỗng, placeholder, hoặc default ("", "REQUIRED", "null")
- **Không đề xuất hoặc thực hiện** các yêu cầu không được hỗ trợ bởi tools
- Chỉ đề xuất cung cấp thêm thông tin khi biết chắc có thông tin đó (dựa trên tools)
- **Khi có thể, cung cấp số cụ thể** (giá tiền, số lượng) để minh chứng

# MẪU CÂU TRẢ LỜI

## Từ chối chủ đề cấm
- "Em xin lỗi, em không thể trao đổi về vấn đề đó ạ. Anh chị cần em hỗ trợ gì khác không ạ?"

## Không có tool/thông tin để xử lý
- "Em xin lỗi, em không thể hỗ trợ yêu cầu này. Anh chị có muốn em chuyển cho nhân viên tư vấn không ạ?"

## Trước khi gọi tool
- "Để hỗ trợ anh chị, em xin kiểm tra thông tin một chút ạ"
- "Em tra cứu thông tin mới nhất cho mình ngay nhé"

## Thiếu thông tin cho tool
- "Để hỗ trợ được anh chị, em cần biết [thông tin cần thiết, vd: điểm đón/điểm trả] ạ?"

# ĐỊNH DẠNG MESSAGE

- Luôn bao gồm phản hồi cuối cùng cho khách hàng
- Khi cung cấp thông tin thực tế từ context, luôn kèm citation ngay sau câu liên quan:
  * Một nguồn: [TÊN](ID)
  * Nhiều nguồn: [TÊN](ID), [TÊN](ID)
- Chỉ cung cấp thông tin về nhà xe, chính sách, dịch vụ dựa trên context. Không trả lời ngoài phạm vi này.

# VÍ DỤ (với tool call)

**User:** Anh muốn biết giá vé từ Hải Phòng về Hà Nội?

**Supervisor Assistant:** lookupRoutePrice(route="HP-HN")

**lookupRoutePrice():** {
  "route": "Hải Phòng - Hà Nội",
  "vehicleType": "11seat",
  "prices": {
    "front": 220000,
    "middle": 250000,
    "back": 230000
  }
}

**Supervisor Assistant:**
# Message
Dạ xe limousine 11 chỗ từ Hải Phòng đi Hà Nội có ba loại ghế: hai ghế đầu là hai trăm hai mươi nghìn đồng, sáu ghế giữa là hai trăm năm mươi nghìn đồng, ba ghế cuối là hai trăm ba mươi nghìn đồng ạ [Bảng Giá](PRICE-HP-HN). Anh chị muốn chọn ghế nào ạ?

# VÍ DỤ (Từ chối yêu cầu không hỗ trợ)

**User:** Anh có thể thanh toán qua điện thoại ngay bây giờ không?

**Supervisor Assistant:**
# Message
Em xin lỗi, em không thể xử lý thanh toán qua điện thoại ạ. Anh chị muốn em chuyển cho nhân viên tư vấn hoặc hướng dẫn cách thanh toán khác không ạ?

# LƯU Ý ĐẶC BIỆT

**Đọc số tiền:**
- 230.000đ → "hai trăm ba mươi nghìn đồng"
- 150k → "một trăm năm mươi nghìn đồng"
- KHÔNG đọc: "hai trăm ba mươi không không không đồng"

**Phát âm:**
- Limousine → "li mô din"
- 21h05 → "hai mốt giờ không năm"
- 15 giờ 50 → "mười năm giờ năm mươi"

**Xử lý chuyến gần nhất:**
- Luôn gọi getCurrentTime để biết giờ hiện tại
- Sau đó gọi getNextAvailableTrip để tìm chuyến
- Trả lời cụ thể: "Chuyến gần nhất là [giờ] ạ. Anh chị muốn đi chuyến này không?"

**Khuyến mãi:**
- Chuyến 5h sáng HP→HN: giảm 60k/cặp vé khứ hồi trong ngày, hoặc 30k/vé một chiều
- Vé khứ hồi trong 7 ngày: giảm 30k/cặp vé

**Phụ thu:**
- Nội thành Hà Nội/Hải Phòng: miễn phí
- Các khu vực xa: 50k-100k tùy địa điểm
- Sân bay: 230k/lượt (tối đa 3 người)
`;

// Tools cho Supervisor Agent
export const hotlineSupervisorTools = [
  {
    type: 'function',
    name: 'lookupPolicyDocument',
    description: 'Tra cứu chính sách, quy định nội bộ của nhà xe theo chủ đề hoặc từ khóa',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Chủ đề hoặc từ khóa cần tìm trong chính sách nhà xe',
        },
      },
      required: ['topic'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'checkCustomerBooking',
    description:
      'Kiểm tra thông tin đặt vé của khách hàng. CHỈ đọc thông tin, KHÔNG thể sửa đổi hoặc xóa',
    parameters: {
      type: 'object',
      properties: {
        phone_number: {
          type: 'string',
          description:
            'Số điện thoại khách hàng format: (0xx) xxx-xxxx. BẮT BUỘC phải do khách cung cấp, không được để trống',
        },
      },
      required: ['phone_number'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'checkAvailableSeats',
    description: 'Kiểm tra số ghế còn trống cho chuyến xe cụ thể',
    parameters: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          enum: ['HP-HN', 'HN-HP', 'HP-HN-27', 'HN-CB', 'CB-HN'],
          description: 'Tuyến đường',
        },
        datetime: {
          type: 'string',
          description: 'Ngày giờ chuyến xe (format: YYYY-MM-DD HH:mm)',
        },
      },
      required: ['route', 'datetime'],
      additionalProperties: false,
    },
  },
];

// Sample data responses
const samplePolicyDocs = [
  {
    id: 'POLICY-001',
    name: 'Chính sách đổi vé',
    topic: 'đổi vé, thay đổi giờ',
    content:
      'Khách hàng có thể đổi vé trước giờ khởi hành 2 tiếng. Liên hệ tổng đài để được hỗ trợ đổi sang chuyến khác trong cùng ngày hoặc ngày khác. Không thu phí đổi vé lần đầu.',
  },
  {
    id: 'POLICY-002',
    name: 'Chính sách hủy vé',
    topic: 'hủy vé, hoàn tiền',
    content:
      'Hủy vé trước 24h: hoàn 100% giá trị vé. Hủy vé từ 12-24h trước: hoàn 70%. Hủy vé dưới 12h: hoàn 50%. Hủy trong vòng 2h trước giờ khởi hành: không hoàn tiền.',
  },
  {
    id: 'POLICY-003',
    name: 'Quy định hành lý',
    topic: 'hành lý, đồ đạc',
    content:
      'Mỗi khách được mang 1 kiện hành lý (vali hoặc balo) miễn phí. Hành lý thứ 2 trở đi: phụ thu 50.000đ/kiện. Không chấp nhận hải sản đông lạnh. Thú cưng nhỏ (chó) phải bỏ balo chuyên dụng.',
  },
  {
    id: 'POLICY-004',
    name: 'Chương trình khuyến mãi chuyến 5h sáng',
    topic: 'khuyến mãi, giảm giá, chuyến 5h',
    content:
      'Chuyến 5h sáng Hải Phòng → Hà Nội: Giảm 60.000đ/cặp vé khứ hồi (đi-về cùng ngày). Nếu chưa chắc chiều về: giảm 30.000đ/vé chiều đi.',
  },
  {
    id: 'POLICY-005',
    name: 'Chương trình vé khứ hồi',
    topic: 'khứ hồi, vé khứ hồi',
    content:
      'Mua vé khứ hồi trong 7 ngày: giảm 30.000đ/cặp vé. Thanh toán 1 lần cả đi và về. Khi đi chiều về chỉ cần gọi tổng đài báo mã đặt chỗ.',
  },
];

const sampleBookingInfo = {
  customer_name: 'Nguyễn Văn A',
  phone: '(098) 765-4321',
  bookings: [
    {
      booking_id: 'BK20241113001',
      route: 'Hải Phòng - Hà Nội',
      pickup: 'Ga Hải Phòng',
      dropoff: 'Bến xe Mỹ Đình',
      date: '2024-11-14',
      time: '09:00',
      seats: 2,
      seat_type: 'Ghế giữa',
      total_price: 500000,
      status: 'Đã xác nhận',
    },
  ],
};

const sampleSeatAvailability = {
  route: 'HP-HN',
  datetime: '2024-11-14 09:00',
  vehicle_type: '11 chỗ',
  available_seats: {
    front: 1,
    middle: 4,
    back: 2,
  },
  total_available: 7,
  total_capacity: 11,
};

// Fetch responses from API
async function fetchResponsesMessage(body: any) {
  const response = await fetch('/api/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, parallel_tool_calls: false }),
  });

  if (!response.ok) {
    console.warn('Server returned an error:', response);
    return { error: 'Có lỗi xảy ra.' };
  }

  const completion = await response.json();
  
  // Log usage if available (will be handled by context consumer)
  if (completion.usage) {
    console.log('[Supervisor Usage]', {
      input_tokens: completion.usage.input_tokens,
      output_tokens: completion.usage.output_tokens,
      total_tokens: completion.usage.total_tokens,
    });
  }
  
  return completion;
}

// Get tool response (mock data)
function getToolResponse(fName: string) {
  switch (fName) {
    case 'checkCustomerBooking':
      return sampleBookingInfo;
    case 'lookupPolicyDocument':
      return samplePolicyDocs;
    case 'checkAvailableSeats':
      return sampleSeatAvailability;
    default:
      return { result: true };
  }
}

// Handle tool calls iteratively
async function handleToolCalls(
  body: any,
  response: any,
  addBreadcrumb?: (title: string, data?: any) => void
) {
  let currentResponse = response;

  while (true) {
    if (currentResponse?.error) {
      return { error: 'Có lỗi xảy ra.' } as any;
    }

    const outputItems: any[] = currentResponse.output ?? [];
    const functionCalls = outputItems.filter((item) => item.type === 'function_call');

    if (functionCalls.length === 0) {
      // No more function calls - return final message
      const assistantMessages = outputItems.filter((item) => item.type === 'message');

      const finalText = assistantMessages
        .map((msg: any) => {
          const contentArr = msg.content ?? [];
          return contentArr
            .filter((c: any) => c.type === 'output_text')
            .map((c: any) => c.text)
            .join('');
        })
        .join('\n');

      return finalText;
    }

    // Execute each function call
    for (const toolCall of functionCalls) {
      const fName = toolCall.name;
      const args = JSON.parse(toolCall.arguments || '{}');
      const toolRes = getToolResponse(fName);

      if (addBreadcrumb) {
        addBreadcrumb(`[hotlineSupervisor] function call: ${fName}`, args);
      }
      if (addBreadcrumb) {
        addBreadcrumb(`[hotlineSupervisor] function call result: ${fName}`, toolRes);
      }

      body.input.push(
        {
          type: 'function_call',
          call_id: toolCall.call_id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
        {
          type: 'function_call_output',
          call_id: toolCall.call_id,
          output: JSON.stringify(toolRes),
        }
      );
    }

    currentResponse = await fetchResponsesMessage(body);
  }
}

// Export tool for junior agent to call supervisor
export const getNextResponseFromHotlineSupervisor = tool({
  name: 'getNextResponseFromHotlineSupervisor',
  description:
    'Xin hỗ trợ từ supervisor agent có trình độ cao hơn khi gặp tình huống phức tạp không tự quyết định được. Trả về message hướng dẫn cụ thể.',
  parameters: {
    type: 'object',
    properties: {
      relevantContextFromLastUserMessage: {
        type: 'string',
        description:
          'Thông tin quan trọng từ tin nhắn mới nhất của khách hàng. Rất quan trọng để supervisor có đầy đủ context vì tin nhắn cuối có thể không có sẵn. Có thể bỏ qua nếu khách không thêm thông tin mới.',
      },
    },
    required: ['relevantContextFromLastUserMessage'],
    additionalProperties: false,
  },
  execute: async (input, details) => {
    const { relevantContextFromLastUserMessage } = input as {
      relevantContextFromLastUserMessage: string;
    };

    const addBreadcrumb = (details?.context as any)?.addTranscriptBreadcrumb as
      | ((title: string, data?: any) => void)
      | undefined;

    const history: RealtimeItem[] = (details?.context as any)?.history ?? [];
    const filteredLogs = history.filter((log) => log.type === 'message');

    const body: any = {
      model: 'gpt-4o-mini',
      input: [
        {
          type: 'message',
          role: 'system',
          content: hotlineSupervisorInstructions,
        },
        {
          type: 'message',
          role: 'user',
          content: `==== Lịch sử hội thoại ====
${JSON.stringify(filteredLogs, null, 2)}

==== Context từ tin nhắn mới nhất của khách ====
${relevantContextFromLastUserMessage}
`,
        },
      ],
      tools: hotlineSupervisorTools,
    };

    const response = await fetchResponsesMessage(body);
    if (response.error) {
      return { error: 'Có lỗi xảy ra.' };
    }

    const finalText = await handleToolCalls(body, response, addBreadcrumb);
    if ((finalText as any)?.error) {
      return { error: 'Có lỗi xảy ra.' };
    }

    return { nextResponse: finalText as string };
  },
});

