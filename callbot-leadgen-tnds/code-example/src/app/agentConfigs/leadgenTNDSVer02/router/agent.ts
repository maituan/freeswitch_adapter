import { RealtimeAgent } from '@openai/agents/realtime';

import { leadgenRouterInstructions } from './instructions';
import {
  bumpLeadgenCounterTool,
  buildLeadgenReplyHintTool,
  evaluateLeadgenTurnTool,
  getLeadgenSessionStateTool,
  getLeadgenVer02ContextTool,
  updateLeadgenSessionStateTool,
} from '../tools';

export function createLeadgenRouterAgent(
  salesAgent?: RealtimeAgent,
  objectionAgent?: RealtimeAgent,
) {
  return new RealtimeAgent({
    name: 'leadgenRouterAgent',
    instructions: leadgenRouterInstructions,
    tools: [
      getLeadgenVer02ContextTool,
      getLeadgenSessionStateTool,
      evaluateLeadgenTurnTool,
      updateLeadgenSessionStateTool,
      bumpLeadgenCounterTool,
      buildLeadgenReplyHintTool,
    ],
    handoffs: [salesAgent, objectionAgent].filter(Boolean) as RealtimeAgent[],
    handoffDescription: 'Handoff nội bộ giữa các agent cho leadgen TNDS ver02. Không được nói ra với khách là đang chuyển bộ phận hay chuyển người.',
  });
}
