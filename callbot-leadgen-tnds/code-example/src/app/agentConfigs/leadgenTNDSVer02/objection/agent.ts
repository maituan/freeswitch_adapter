import { RealtimeAgent } from '@openai/agents/realtime';

import { leadgenObjectionInstructions } from './instructions';
import {
  appendLeadgenMemorySummaryTool,
  bumpLeadgenCounterTool,
  buildLeadgenReplyHintTool,
  evaluateLeadgenTurnTool,
  getLeadgenSessionStateTool,
  markLeadgenOutcomeTool,
  sharedLeadgenVer02Tools,
  updateLeadgenSessionStateTool,
} from '../tools';

export function createLeadgenObjectionAgent(salesAgent?: RealtimeAgent) {
  return new RealtimeAgent({
    name: 'leadgenObjectionAgent',
    instructions: leadgenObjectionInstructions,
    tools: [
      getLeadgenSessionStateTool,
      evaluateLeadgenTurnTool,
      updateLeadgenSessionStateTool,
      bumpLeadgenCounterTool,
      buildLeadgenReplyHintTool,
      appendLeadgenMemorySummaryTool,
      markLeadgenOutcomeTool,
      sharedLeadgenVer02Tools.createLeadOrUpdateTool,
      sharedLeadgenVer02Tools.scheduleFollowupTool,
    ],
    handoffs: salesAgent ? [salesAgent] : [],
    handoffDescription: 'Agent xử lý từ chối và ngoại lệ cho leadgen TNDS ver02.',
  });
}
