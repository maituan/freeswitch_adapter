import { leadgenV1Scenario, leadgenV1Metadata } from './leadgenV1';
import { leadgenMultiAgentScenario } from './leadgenMultiAgent';

import type { RealtimeAgent } from '@openai/agents/realtime';

// Map of scenario key -> array of RealtimeAgent objects
export const allAgentSets: Record<string, RealtimeAgent[]> = {
  leadgenV1: leadgenV1Scenario,
  leadgenMultiAgent: leadgenMultiAgentScenario.agents,
};

// Metadata for scenarios (e.g., to control UI behavior)
export const agentSetMetadata: Record<string, { isTextOnly?: boolean }> = {
  leadgenV1: leadgenV1Metadata,
  leadgenMultiAgent: { isTextOnly: false },
};

export const defaultAgentSetKey = 'leadgenMultiAgent';
