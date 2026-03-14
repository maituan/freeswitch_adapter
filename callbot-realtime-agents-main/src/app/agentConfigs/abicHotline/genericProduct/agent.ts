import { RealtimeAgent } from '@openai/agents/realtime';
import { abicGenericProductInstructions } from './instructions';
import { abicGenericProductTools } from './tools';

export const abicGenericProductAgent = new RealtimeAgent({
  name: 'abicGenericProductAgent',
  voice: 'shimmer',
  instructions: abicGenericProductInstructions,
  handoffs: [],
  tools: abicGenericProductTools,
  handoffDescription: 'Agent tạm cho sản phẩm khác: hỏi tên sản phẩm rồi chuyển tổng đài viên.',
});

