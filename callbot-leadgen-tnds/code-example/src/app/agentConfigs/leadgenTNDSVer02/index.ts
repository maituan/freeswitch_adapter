import type { RealtimeAgent } from '@openai/agents/realtime';

import { createLeadgenRouterAgent as createLeadgenRouterAgentBase } from './router/agent';
import { createLeadgenSalesAgent as createLeadgenSalesAgentBase } from './sales/agent';
import { createLeadgenObjectionAgent as createLeadgenObjectionAgentBase } from './objection/agent';

function buildLeadgenVer02Agents() {
  const salesAgent = createLeadgenSalesAgentBase();
  const objectionAgent = createLeadgenObjectionAgentBase(salesAgent);
  const routerAgent = createLeadgenRouterAgentBase(salesAgent, objectionAgent);

  // Patch cross-handoffs after construction to avoid circular module imports.
  (salesAgent as any).handoffs = [objectionAgent];

  return {
    routerAgent,
    salesAgent,
    objectionAgent,
  };
}

const {
  routerAgent: leadgenRouterAgent,
  salesAgent: leadgenSalesAgent,
  objectionAgent: leadgenObjectionAgent,
} = buildLeadgenVer02Agents();

export const leadgenTndsVer02Scenario: RealtimeAgent[] = [
  leadgenRouterAgent,
  leadgenSalesAgent,
  leadgenObjectionAgent,
];

export const leadgenTndsVer02Metadata = {
  isTextOnly: false,
};

export function createLeadgenRouterAgent() {
  return buildLeadgenVer02Agents().routerAgent;
}

export { leadgenRouterAgent, leadgenSalesAgent, leadgenObjectionAgent };
export {
  setLeadgenVer02RuntimeContext,
} from './tools';
