import { RealtimeAgent } from '@openai/agents/realtime';
import { leadgenCloserInstructions } from './instructions';
import { createLeadOrUpdateTool, scheduleFollowupTool, handoffHumanTool } from '../tools';
import { leadgenFallbackAgent } from '../fallback/agent';

export const leadgenCloserAgent = new RealtimeAgent({
  name: 'leadgenCloserAgent',
  instructions: leadgenCloserInstructions,
  tools: [createLeadOrUpdateTool, scheduleFollowupTool, handoffHumanTool],
  handoffs: [leadgenFallbackAgent],
  handoffDescription: 'Agent chot kenh va luu thong tin lead.',
});
