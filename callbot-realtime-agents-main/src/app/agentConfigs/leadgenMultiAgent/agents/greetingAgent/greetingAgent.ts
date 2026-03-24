import { RealtimeAgent } from '@openai/agents/realtime';
import { getLeadgenContextTool, updateLeadgenStateTool, lookupFaqTool } from '../../tools';
import { greetingAgentInstructions } from './instructions';

export function createGreetingAgent(mainSaleAgent?: RealtimeAgent, instructionsOverride?: string) {
  return new RealtimeAgent({
    name: 'greetingAgent',
    instructions: instructionsOverride ?? greetingAgentInstructions,
    tools: [getLeadgenContextTool, updateLeadgenStateTool, lookupFaqTool],
    handoffs: [mainSaleAgent].filter(Boolean) as RealtimeAgent[],
    handoffDescription: 'Handoff nội bộ giữa các agent cho leadgen TNDS. Không được nói ra với khách là đang chuyển bộ phận hay chuyển người.',
  });
}
