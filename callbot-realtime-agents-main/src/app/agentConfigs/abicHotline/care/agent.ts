import { RealtimeAgent } from '@openai/agents/realtime';
import { abicCareInstructions } from './instructions';
import { abicCareTools } from './tools';

export const abicCareAgent = new RealtimeAgent({
  name: 'abicCareAgent',
  voice: 'shimmer',
  instructions: abicCareInstructions,
  handoffs: [],
  tools: abicCareTools,
  handoffDescription: 'Hỗ trợ ABIC Care (tạm): hướng dẫn hotline trên thẻ, hoặc chuyển tổng đài viên.',
});

