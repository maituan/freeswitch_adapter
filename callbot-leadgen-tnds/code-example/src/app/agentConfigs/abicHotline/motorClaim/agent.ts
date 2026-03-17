import { RealtimeAgent } from '@openai/agents/realtime';
import { abicMotorClaimInstructions } from './instructions';
import { abicMotorClaimTools } from './tools';

export const abicMotorClaimAgent = new RealtimeAgent({
  name: 'abicMotorClaimAgent',
  voice: 'shimmer',
  instructions: abicMotorClaimInstructions,
  handoffs: [],
  tools: abicMotorClaimTools,
  handoffDescription: 'Hỗ trợ bồi thường xe cơ giới (tạm thời hỏi chi nhánh/tỉnh rồi chuyển tổng đài viên).',
});

