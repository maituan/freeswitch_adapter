import { RealtimeAgent } from '@openai/agents/realtime';
import { objectionHandlingInstructions } from './objectionHandlingInstructions';
import { crmUpdateTool, scheduleCallbackTool } from '../tools';

export const objectionHandlingAgent = new RealtimeAgent({
  name: 'objectionHandlingAgent',
  instructions: objectionHandlingInstructions,
  tools: [scheduleCallbackTool, crmUpdateTool],
  handoffDescription: 'Handle customer objections and close politely.',
});
