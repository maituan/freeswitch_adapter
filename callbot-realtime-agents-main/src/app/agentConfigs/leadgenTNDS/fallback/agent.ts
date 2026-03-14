import { RealtimeAgent } from '@openai/agents/realtime';
import { leadgenFallbackInstructions } from './instructions';
import { createLeadOrUpdateTool } from '../tools';

export const leadgenFallbackAgent = new RealtimeAgent({
  name: 'leadgenFallbackAgent',
  instructions: leadgenFallbackInstructions,
  tools: [createLeadOrUpdateTool],
  handoffs: [],
  handoffDescription: 'Agent ket thuc cuoc goi va ghi nhan ly do tu choi.',
});
