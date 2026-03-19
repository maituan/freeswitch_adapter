import { RealtimeAgent } from '@openai/agents/realtime';
import { getLeadgenContextTool, updateLeadgenStateTool } from '../../tools';
import { greetingAgentInstructions } from './instructions';

export function createGreetingAgent(mainSaleAgent?: RealtimeAgent) {
  return new RealtimeAgent({
    name: 'greetingAgent',
    instructions: greetingAgentInstructions,
    tools: [getLeadgenContextTool, updateLeadgenStateTool],
    handoffs: [mainSaleAgent].filter(Boolean) as RealtimeAgent[],
    handoffDescription: 'Handoff nội bộ giữa các agent cho leadgen TNDS. Không được nói ra với khách là đang chuyển bộ phận hay chuyển người.',
  });
}
