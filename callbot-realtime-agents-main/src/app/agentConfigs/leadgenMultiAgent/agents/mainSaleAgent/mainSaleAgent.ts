import { RealtimeAgent } from '@openai/agents/realtime';
import { calcTndsFeeTool, getLeadgenContextTool, updateLeadgenStateTool, lookupFaqTool } from '../../tools';
import { mainSaleAgentInstructions } from './instructions';

export function createMainSaleAgent(instructionsOverride?: string) {
  return new RealtimeAgent({
    name: 'mainSaleAgent',
    instructions: instructionsOverride ?? mainSaleAgentInstructions,
    tools: [getLeadgenContextTool, calcTndsFeeTool, updateLeadgenStateTool, lookupFaqTool],
    handoffs: [],
  });
}
