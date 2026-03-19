import { RealtimeAgent } from '@openai/agents/realtime';
import { createGreetingAgent } from './agents/greetingAgent/greetingAgent';
import { createMainSaleAgent } from './agents/mainSaleAgent/mainSaleAgent';

export function buildLeadgenMultiAgents(): RealtimeAgent[] {
  const mainSaleAgent = createMainSaleAgent();
  const greetingAgent = createGreetingAgent(mainSaleAgent);
  // greetingAgent is first → used as initialAgent by relay session (agents[0])
  return [greetingAgent, mainSaleAgent];
}

// Singleton for web UI (single session at a time)
export const leadgenMultiAgentScenario = buildLeadgenMultiAgents();

export { setLeadgenMultiAgentRuntimeContext } from './internal/sessionState';
