import { createMainLeadgenAgent } from './agents/mainLeadgenAgent/mainLeadgenAgent';

const mainLeadgenAgent = createMainLeadgenAgent();

export const leadgenAgentV2Scenario = {
  name: 'Leadgen TNDS (Single Agent)',
  description: 'Kịch bản telesale TNDS sử dụng 1 agent chính.',
  agents: [mainLeadgenAgent],
  initialAgent: mainLeadgenAgent,
};

export { setLeadgenMultiAgentRuntimeContext as setLeadgenAgentV2RuntimeContext } from './internal/sessionState';
