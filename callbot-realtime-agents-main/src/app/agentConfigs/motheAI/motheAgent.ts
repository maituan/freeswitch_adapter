import { RealtimeAgent } from '@openai/agents/realtime';
import {
  lookupFAQTool,
  registerCardTool,
  transferToAgentTool
} from './tools';
import { instructions } from './instructions';

export const motheAgent = new RealtimeAgent({
  name: 'motheAI',
  voice: 'shimmer', // Giọng nữ phù hợp cho telesales
  instructions: instructions,
  handoffs: [], 
  tools: [
    lookupFAQTool,
    registerCardTool,
    transferToAgentTool
  ],
  handoffDescription: 'Chuyên viên tổng đài gọi ra (Outbound) tư vấn dịch vụ mở thẻ tín dụng của Ngân hàng Em Pi Ti Bank. Chuyên thuyết phục khách hàng đăng ký mở thẻ thông qua các ưu đãi hấp dẫn.',
});
