import { RealtimeAgent } from '@openai/agents/realtime';
import { leadgenFaqInstructions } from './instructions';
import { lookupTndsFaqTool } from '../tools';
import { leadgenPricingAgent } from '../pricing/agent';
import { leadgenFallbackAgent } from '../fallback/agent';

export const leadgenFaqAgent = new RealtimeAgent({
  name: 'leadgenFaqAgent',
  instructions: leadgenFaqInstructions,
  tools: [lookupTndsFaqTool],
  handoffs: [leadgenPricingAgent, leadgenFallbackAgent],
  handoffDescription: 'Agent tra loi FAQ cho BH TNDS oto.',
});
