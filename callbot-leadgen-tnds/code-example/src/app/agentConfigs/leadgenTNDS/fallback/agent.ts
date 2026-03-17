import { RealtimeAgent } from '@openai/agents/realtime';
import { leadgenFallbackInstructions } from './instructions';
import { createLeadOrUpdateTool } from '../tools';
import { leadgenPricingAgent } from '@/app/agentConfigs/leadgenTNDS/pricing/agent';

export const leadgenFallbackAgent = new RealtimeAgent({
  name: 'leadgenFallbackAgent',
  instructions: leadgenFallbackInstructions,
  tools: [createLeadOrUpdateTool],
  handoffs: [leadgenPricingAgent],
  handoffDescription: 'Agent xu ly objection va co the chuyen sang pricing khi khach hoi gia.',
});
