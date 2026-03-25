import { RealtimeAgent } from '@openai/agents/realtime';
import { getLeadgenContextTool, updateLeadgenStateTool, lookupFaqTool } from '../../tools';
import { mainLeadgenAgentInstructions } from './instructions';

export function createMainLeadgenAgent() {
  return new RealtimeAgent({
    name: 'mainLeadgenAgent',
    instructions: mainLeadgenAgentInstructions,
    tools: [getLeadgenContextTool, updateLeadgenStateTool, lookupFaqTool],
    handoffs: [],
  });
}
