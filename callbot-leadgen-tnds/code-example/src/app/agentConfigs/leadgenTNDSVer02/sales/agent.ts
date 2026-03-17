import { RealtimeAgent } from '@openai/agents/realtime';

import { leadgenSalesInstructions } from './instructions';
import {
  appendLeadgenMemorySummaryTool,
  buildLeadgenReplyHintTool,
  evaluateLeadgenTurnTool,
  getLeadgenSessionStateTool,
  sharedLeadgenVer02Tools,
  updateLeadgenSessionStateTool,
} from '../tools';

export function createLeadgenSalesAgent(objectionAgent?: RealtimeAgent) {
  return new RealtimeAgent({
    name: 'leadgenSalesAgent',
    instructions: leadgenSalesInstructions,
    tools: [
      getLeadgenSessionStateTool,
      evaluateLeadgenTurnTool,
      updateLeadgenSessionStateTool,
      appendLeadgenMemorySummaryTool,
      buildLeadgenReplyHintTool,
      sharedLeadgenVer02Tools.calcTndsFeeTool,
      sharedLeadgenVer02Tools.createLeadOrUpdateTool,
      sharedLeadgenVer02Tools.scheduleFollowupTool,
    ],
    handoffs: objectionAgent ? [objectionAgent] : [],
    handoffDescription: 'Agent bán hàng chính cho leadgen TNDS ver02. Handoff chỉ là nội bộ, không được nói với khách là đang chuyển bộ phận hay chuyển người.',
  });
}
