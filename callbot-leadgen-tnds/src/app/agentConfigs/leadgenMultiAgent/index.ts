import { createGreetingAgent } from './agents/greetingAgent/greetingAgent';
import { createMainSaleAgent } from './agents/mainSaleAgent/mainSaleAgent';

function buildLeadgenMultiAgents() {
  const mainSaleAgent = createMainSaleAgent();
  const greetingAgent = createGreetingAgent(mainSaleAgent);

  return {
    greetingAgent,
    mainSaleAgent,
  };
}

const {
  greetingAgent,
  mainSaleAgent,
} = buildLeadgenMultiAgents();

export const leadgenMultiAgentScenario = {
  name: 'Leadgen TNDS (Multi-Agent)',
  description: 'Kịch bản telesale TNDS sử dụng kiến trúc 2-Agent (Greeting -> MainSale).',
  agents: [greetingAgent, mainSaleAgent],
  initialAgent: greetingAgent,
};

export { setLeadgenMultiAgentRuntimeContext } from './internal/sessionState';
