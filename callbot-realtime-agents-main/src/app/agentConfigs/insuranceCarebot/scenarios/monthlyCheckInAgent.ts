import { RealtimeAgent } from '@openai/agents/realtime';
import { monthlyCheckInInstructions } from './monthlyCheckInInstructions';
import { crmUpdateTool, sendZaloMessageTool } from '../tools';
import { objectionHandlingAgent } from '../core/objectionHandlingAgent';
import { complianceGuardAgent } from '../core/complianceGuardAgent';

export const monthlyCheckInAgent = new RealtimeAgent({
  name: 'monthlyCheckInAgent',
  instructions: monthlyCheckInInstructions,
  tools: [sendZaloMessageTool, crmUpdateTool],
  handoffs: [objectionHandlingAgent, complianceGuardAgent],
  handoffDescription: 'Monthly check-in and relationship maintenance.',
});
