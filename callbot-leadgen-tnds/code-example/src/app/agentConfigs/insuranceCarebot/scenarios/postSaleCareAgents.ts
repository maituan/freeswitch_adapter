import { RealtimeAgent } from '@openai/agents/realtime';
import { safetyReminderInstructions } from './safetyReminderInstructions';
import { digitalCardInstructions } from './digitalCardInstructions';
import { crmUpdateTool, knowledgeLookupTool, sendZaloMessageTool } from '../tools';
import { objectionHandlingAgent } from '../core/objectionHandlingAgent';
import { complianceGuardAgent } from '../core/complianceGuardAgent';

export const safetyReminderAgent = new RealtimeAgent({
  name: 'safetyReminderAgent',
  instructions: safetyReminderInstructions,
  tools: [knowledgeLookupTool, sendZaloMessageTool, crmUpdateTool],
  handoffs: [objectionHandlingAgent, complianceGuardAgent],
  handoffDescription: 'Post-sale safety reminder and policy usage tips.',
});

export const digitalCardAgent = new RealtimeAgent({
  name: 'digitalCardAgent',
  instructions: digitalCardInstructions,
  tools: [sendZaloMessageTool, crmUpdateTool],
  handoffs: [objectionHandlingAgent, complianceGuardAgent],
  handoffDescription: 'Guide customer to use digital insurance card.',
});
