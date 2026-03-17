import { RealtimeAgent } from '@openai/agents/realtime';
import { abicFallbackInstructions } from './instructions';
import { abicFallbackTools } from './tools';

export const abicFallbackAgent = new RealtimeAgent({
  name: 'abicFallbackAgent',
  voice: 'shimmer',
  instructions: abicFallbackInstructions,
  handoffs: [],
  tools: abicFallbackTools,
  handoffDescription: 'Fallback agent: xử lý sai tổng đài/ngoài luồng, hỏi lại và endcall theo ngưỡng.',
});

