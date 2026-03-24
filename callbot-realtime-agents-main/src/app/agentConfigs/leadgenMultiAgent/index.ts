import { RealtimeAgent } from '@openai/agents/realtime';
import { createGreetingAgent } from './agents/greetingAgent/greetingAgent';
import { createMainSaleAgent } from './agents/mainSaleAgent/mainSaleAgent';

export type PromptOverrides = {
  greetingAgent?: string
  mainSaleAgent?: string
}

export function buildLeadgenMultiAgents(prompts?: PromptOverrides): RealtimeAgent[] {
  const mainSaleAgent = createMainSaleAgent(prompts?.mainSaleAgent);
  const greetingAgent = createGreetingAgent(mainSaleAgent, prompts?.greetingAgent);
  // greetingAgent is first → used as initialAgent by relay session (agents[0])
  return [greetingAgent, mainSaleAgent];
}

// Singleton for web UI (single session at a time)
export const leadgenMultiAgentScenario = buildLeadgenMultiAgents();

export { setLeadgenMultiAgentRuntimeContext } from './internal/sessionState';
