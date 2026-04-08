import type { RealtimeAgent } from '@openai/agents/realtime';
import { createMainLeadgenAgent } from './agents/mainLeadgenAgent/mainLeadgenAgent';
import { buildLeadgenScriptVars } from './tools';
import { getLeadgenMultiAgentState } from './internal/sessionState';

const mainLeadgenAgent = createMainLeadgenAgent();

export const leadgenAgentV2Scenario = {
  name: 'Leadgen TNDS (Single Agent)',
  description: 'Kịch bản telesale TNDS sử dụng 1 agent chính.',
  agents: [mainLeadgenAgent],
  initialAgent: mainLeadgenAgent,
};

/**
 * Inject context khách hàng vào instruction của agents trước khi connect.
 * Gọi hàm này 1 lần trước mỗi session connect.
 */
export function injectLeadgenAgentV2Context(agents: RealtimeAgent[], sessionId: string) {
  const state = getLeadgenMultiAgentState(sessionId);
  const vars = buildLeadgenScriptVars(sessionId, state);
  const contextBlock = [
    '# CONTEXT (thông tin khách hàng — dùng trực tiếp, không cần gọi tool)',
    `- Xưng hô({gender}): ${vars.gender}`,
    `- Tên khách({name}): ${vars.name}`,
    `- Tên agent({agent_name}): ${vars.agent_name}`,
    `- Biển số({BKS}): ${vars.BKS}`,
    `- Hãng xe({brand}): ${vars.brand || 'chưa rõ'}`,
    `- Số chỗ({num_seats}): ${vars.num_seats || 'chưa rõ'}`,
    `- Ngày hết hạn({expiry_date}): ${vars.expiry_date}`,
    `- SĐT khách: ${vars.phone_number}`,
    `- Địa chỉ: ${vars.address}`,
  ].join('\n');

  for (const agent of agents) {
    if (typeof agent.instructions === 'string' && agent.instructions.includes('{CONTEXT_BLOCK}')) {
      agent.instructions = agent.instructions.replace('{CONTEXT_BLOCK}', contextBlock);
    }
  }
}

export { setLeadgenMultiAgentRuntimeContext as setLeadgenAgentV2RuntimeContext, getLeadgenMultiAgentState as getLeadgenAgentV2State } from './internal/sessionState';
export { buildIntroText as buildLeadgenAgentV2IntroText, buildLeadgenScriptVars as buildLeadgenAgentV2ScriptVars } from './tools';
