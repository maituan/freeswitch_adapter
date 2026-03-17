import { RealtimeAgent } from '@openai/agents/realtime';
import { leadgenCloserInstructions } from './instructions';
import { createLeadOrUpdateTool, scheduleFollowupTool, handoffHumanTool } from '../tools';

export const leadgenCloserAgent = new RealtimeAgent({
  name: 'leadgenCloserAgent',
  instructions: leadgenCloserInstructions,
  tools: [createLeadOrUpdateTool, scheduleFollowupTool, handoffHumanTool],
  handoffs: [],
  handoffDescription: 'Agent chot kenh va luu thong tin lead.',
});
