import { RealtimeAgent } from '@openai/agents/realtime';
import { abicTravelInstructions } from './instructions';
import { abicTravelNextStepTool } from './tools';

export const abicTravelAgent = new RealtimeAgent({
  name: 'abicTravelAgent',
  voice: 'shimmer',
  instructions: abicTravelInstructions,
  handoffs: [],
  // Expose only the policy tool to avoid model bypassing it.
  tools: [abicTravelNextStepTool],
  handoffDescription:
    'Chuyên viên tổng đài ảo tư vấn bảo hiểm du lịch (trong nước/quốc tế) và các vấn đề trễ chuyến theo tài liệu; ngoài phạm vi hoặc yêu cầu giá/hotline/kênh bán thì chuyển tổng đài viên.',
});

