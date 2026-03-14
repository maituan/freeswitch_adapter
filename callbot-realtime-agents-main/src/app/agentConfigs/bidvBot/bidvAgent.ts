import { RealtimeAgent } from '@openai/agents/realtime';
import { instructions } from './instructions';
import { createTicketTool, lookupBidvKBTool } from './tools';

export const bidvAgent = new RealtimeAgent({
  name: 'bidvBot',
  // Voice for realtime audio (if enabled)
  voice: 'sage',
  instructions,
  handoffs: [],
  tools: [lookupBidvKBTool, createTicketTool],
  handoffDescription:
    'BIDV BOT hỗ trợ POC: lỗi đăng nhập SmartBanking và lỗi giao dịch/sử dụng thẻ GNNĐ; có luồng fallback tạo ticket.',
});
