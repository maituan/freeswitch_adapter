import { RealtimeAgent } from '@openai/agents/realtime';
import { abicComplaintInstructions } from './instructions';
import { abicComplaintTools } from './tools';

export const abicComplaintAgent = new RealtimeAgent({
  name: 'abicComplaintAgent',
  voice: 'shimmer',
  instructions: abicComplaintInstructions,
  handoffs: [],
  tools: abicComplaintTools,
  handoffDescription: 'Tiếp nhận khiếu nại (tạm): hỏi tóm tắt rồi chuyển tổng đài viên.',
});

