import { RealtimeAgent } from '@openai/agents/realtime';
import { greetingsAndActivationInstructions } from './greetingsAndActivationInstructions';
import { activateTraffic365Tool, crmUpdateTool, sendZaloMessageTool } from '../tools';
import { objectionHandlingAgent } from '../core/objectionHandlingAgent';
import { complianceGuardAgent } from '../core/complianceGuardAgent';

export const greetingsAndActivationAgent = new RealtimeAgent({
  name: 'greetingsAndActivationAgent',
  instructions: greetingsAndActivationInstructions,
  tools: [activateTraffic365Tool, sendZaloMessageTool, crmUpdateTool],
  handoffs: [objectionHandlingAgent, complianceGuardAgent],
  handoffDescription: 'Activate Traffic 365 and share usage guide.',
});
