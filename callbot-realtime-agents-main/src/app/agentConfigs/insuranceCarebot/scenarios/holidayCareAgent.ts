import { RealtimeAgent } from '@openai/agents/realtime';
import { holidayCareInstructions } from './holidayCareInstructions';
import { crmUpdateTool, knowledgeLookupTool } from '../tools';
import { objectionHandlingAgent } from '../core/objectionHandlingAgent';
import { complianceGuardAgent } from '../core/complianceGuardAgent';

export const holidayCareAgent = new RealtimeAgent({
  name: 'holidayCareAgent',
  instructions: holidayCareInstructions,
  tools: [knowledgeLookupTool, crmUpdateTool],
  handoffs: [objectionHandlingAgent, complianceGuardAgent],
  handoffDescription: 'Holiday care and safe driving reminders.',
});
