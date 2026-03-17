import { tool } from '@openai/agents/realtime';
import { faqs } from './sampleData';

export const lookupFAQTool = tool({
  name: 'lookupFAQ',
  description: 'Tra cứu câu hỏi thường gặp (FAQ) về thẻ tín dụng và quy trình mở thẻ. Sử dụng khi khách hàng hỏi về điều kiện, phí, lãi suất, giấy tờ, ưu đãi, an toàn, trả góp, thời gian, v.v.',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Câu hỏi hoặc từ khóa liên quan đến vấn đề khách hàng quan tâm (VD: điều kiện, phí, lãi suất, hạn mức, giấy tờ, ưu đãi, an toàn)',
      },
    },
    required: ['question'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { question } = args as { question: string };
    const lowerQuestion = question.toLowerCase();
    
    // Exact match first
    const exactMatch = faqs.find((faq) =>
      faq.question.toLowerCase().includes(lowerQuestion) ||
      lowerQuestion.includes(faq.question.toLowerCase())
    );

    if (exactMatch) {
      return {
        found: true,
        question: exactMatch.question,
        answer: exactMatch.answer,
        formatted: exactMatch.answer,
      };
    }

    // Keyword-based search with scoring
    const keywords = lowerQuestion.split(/\s+/).filter(k => k.length > 2);
    const scored = faqs.map((faq) => {
      let score = 0;
      
      // Check keywords in FAQ
      keywords.forEach((keyword) => {
        if (faq.question.toLowerCase().includes(keyword)) score += 3;
        if (faq.answer.toLowerCase().includes(keyword)) score += 2;
        if (faq.keywords && faq.keywords.some(k => k.includes(keyword))) score += 2;
      });
      
      // Check FAQ keywords in question
      if (faq.keywords) {
        faq.keywords.forEach((faqKeyword) => {
          if (lowerQuestion.includes(faqKeyword.toLowerCase())) score += 2;
        });
      }
      
      return { faq, score };
    });

    // Sort by score and get best match
    const bestMatch = scored.sort((a, b) => b.score - a.score)[0];

    if (bestMatch && bestMatch.score > 0) {
      return {
        found: true,
        question: bestMatch.faq.question,
        answer: bestMatch.faq.answer,
        formatted: bestMatch.faq.answer,
        confidence: bestMatch.score > 5 ? 'high' : 'medium',
      };
    }

    return {
      found: false,
      message: "Xin lỗi, em chưa tìm thấy thông tin chính xác cho câu hỏi này. Anh chị có thể hỏi cụ thể hơn hoặc em xin phép chuyển sang bộ phận tư vấn chuyên sâu ạ.",
    };
  },
});

export const registerCardTool = tool({
  name: 'registerCard',
  description: 'Ghi nhận yêu cầu đăng ký mở thẻ tín dụng của khách hàng. Sử dụng khi khách hàng đồng ý mở thẻ.',
  parameters: {
    type: 'object',
    properties: {
      customerName: {
        type: 'string',
        description: 'Tên khách hàng (nếu có)',
      },
      phoneNumber: {
        type: 'string',
        description: 'Số điện thoại liên hệ (nếu có)',
      },
      preferredContactTime: {
        type: 'string',
        description: 'Thời gian khách hàng muốn được liên hệ lại (tùy chọn)',
      },
      note: {
        type: 'string',
        description: 'Ghi chú về nhu cầu hoặc câu hỏi của khách hàng (tùy chọn)',
      },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { customerName, phoneNumber, preferredContactTime, note } = args as { 
      customerName?: string, 
      phoneNumber?: string,
      preferredContactTime?: string,
      note?: string
    };
    
    const timestamp = new Date().toISOString();
    const registrationId = `REG-${Date.now()}`;
    
    console.log(`[MotheAI] Card registration at ${timestamp}`);
    console.log(`  - Registration ID: ${registrationId}`);
    console.log(`  - Customer: ${customerName || 'Unknown'}`);
    console.log(`  - Phone: ${phoneNumber || 'Unknown'}`);
    if (preferredContactTime) console.log(`  - Preferred time: ${preferredContactTime}`);
    if (note) console.log(`  - Note: ${note}`);
    
    return {
      success: true,
      registrationId,
      message: `Đã ghi nhận yêu cầu mở thẻ${customerName ? ` của ${customerName}` : ''}. Nhân viên tư vấn sẽ liên hệ lại sớm.`,
      timestamp,
    };
  },
});

export const transferToAgentTool = tool({
  name: 'transferToAgent',
  description: 'Chuyển cuộc gọi sang nhân viên tư vấn (CSKH) hoặc bộ phận liên quan. Sử dụng khi câu hỏi ngoài phạm vi (khoản vay, nợ xấu, v.v.) hoặc cần tư vấn chuyên sâu.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Lý do chuyển cuộc gọi (VD: Khách hỏi khoản vay tiền mặt, cần tư vấn về nợ xấu, yêu cầu hạn mức cụ thể, v.v.)',
      },
      customerConcern: {
        type: 'string',
        description: 'Vấn đề cụ thể mà khách hàng quan tâm (tùy chọn)',
      },
    },
    required: ['reason'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { reason, customerConcern } = args as { reason: string, customerConcern?: string };
    
    const timestamp = new Date().toISOString();
    console.log(`[MotheAI] Transferring to agent at ${timestamp}`);
    console.log(`  - Reason: ${reason}`);
    if (customerConcern) console.log(`  - Customer concern: ${customerConcern}`);
    
    return {
      success: true,
      message: `Đang chuyển cuộc gọi sang bộ phận CSKH. Lý do: ${reason}`,
      timestamp,
    };
  },
});
