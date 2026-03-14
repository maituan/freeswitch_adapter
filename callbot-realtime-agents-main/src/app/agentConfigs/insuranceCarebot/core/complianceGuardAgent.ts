import { RealtimeAgent } from '@openai/agents/realtime';
import { complianceGuardInstructions } from './complianceGuardInstructions';
import { knowledgeLookupTool } from '../tools';

export const complianceGuardAgent = new RealtimeAgent({
  name: 'complianceGuardAgent',
  instructions: complianceGuardInstructions,
  tools: [knowledgeLookupTool],
  handoffDescription: 'Verify compliance and policy-safe wording.',
});
