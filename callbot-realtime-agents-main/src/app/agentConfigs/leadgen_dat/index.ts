import { RealtimeAgent } from '@openai/agents/realtime';
import { createMainSaleAgent } from './agents/mainSaleAgent/mainSaleAgent';

export function buildLeadgenMultiAgents(): RealtimeAgent[] {
  const mainSaleAgent = createMainSaleAgent();
  return [mainSaleAgent];
}

// Singleton for web UI (single session at a time)
export const leadgenMultiAgentScenario = buildLeadgenMultiAgents();

export { setLeadgenMultiAgentRuntimeContext } from './internal/sessionState';
