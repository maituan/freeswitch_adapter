import { RealtimeAgent } from '@openai/agents/realtime';
import { calcTndsFeeTool, getLeadgenContextTool, updateLeadgenStateTool, lookupFaqTool } from '../../tools';
import { mainSaleAgentInstructions } from './instructions';

export function createMainSaleAgent() {
  return new RealtimeAgent({
    name: 'mainSaleAgent',
    instructions: mainSaleAgentInstructions,
    tools: [getLeadgenContextTool, calcTndsFeeTool, updateLeadgenStateTool, lookupFaqTool],
    handoffs: [],
  });
}
