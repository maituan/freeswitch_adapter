import { RealtimeAgent } from '@openai/agents/realtime';
import { updateLeadgenStateTool, lookupFaqTool } from '../../tools';
import { mainLeadgenAgentInstructions } from './instructions';

export function createMainLeadgenAgent() {
  return new RealtimeAgent({
    name: 'mainLeadgenAgent',
    instructions: mainLeadgenAgentInstructions,
    tools: [updateLeadgenStateTool, lookupFaqTool],
    handoffs: [],
  });
}
