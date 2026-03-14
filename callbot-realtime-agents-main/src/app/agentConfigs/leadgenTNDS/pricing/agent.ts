import { RealtimeAgent } from '@openai/agents/realtime';
import { leadgenPricingInstructions } from './instructions';
import { calcTndsFeeTool, createLeadOrUpdateTool } from '../tools';
import { leadgenCloserAgent } from '@/app/agentConfigs/leadgenTNDS/closer/agent';

export const leadgenPricingAgent = new RealtimeAgent({
  name: 'leadgenPricingAgent',
  instructions: leadgenPricingInstructions,
  tools: [calcTndsFeeTool, createLeadOrUpdateTool],
  handoffs: [leadgenCloserAgent],
  handoffDescription: 'Agent bao gia BH TNDS oto va thu thap thong tin thieu.',
});
