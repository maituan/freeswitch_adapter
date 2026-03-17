import { RealtimeAgent } from '@openai/agents/realtime';
import { calcTndsFeeTool, getLeadgenContextTool, updateLeadgenStateTool } from '../../tools';
import { mainSaleAgentInstructions } from './instructions';

export function createMainSaleAgent() {
  return new RealtimeAgent({
    name: 'mainSaleAgent',
    instructions: mainSaleAgentInstructions,
    tools: [getLeadgenContextTool, calcTndsFeeTool, updateLeadgenStateTool],
    handoffs: [],
  });
}
