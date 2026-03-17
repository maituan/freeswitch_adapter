import { RealtimeAgent } from '@openai/agents/realtime';
import { leadgenRouterInstructions } from './instructions';
import { getLeadContextTool } from '@/app/agentConfigs/leadgenTNDS/tools';
import { leadgenPricingAgent } from '@/app/agentConfigs/leadgenTNDS/pricing/agent';
import { leadgenFaqAgent } from '@/app/agentConfigs/leadgenTNDS/faq/agent';
import { leadgenCloserAgent } from '@/app/agentConfigs/leadgenTNDS/closer/agent';
import { leadgenFallbackAgent } from '@/app/agentConfigs/leadgenTNDS/fallback/agent';

// Root agent for leadgenTNDS scenario
export function createLeadgenRouterAgent() {
  return new RealtimeAgent({
    name: 'leadgenTNDS',
    instructions: leadgenRouterInstructions,
    tools: [getLeadContextTool],
    handoffs: [
      leadgenPricingAgent,
      leadgenFaqAgent,
      leadgenCloserAgent,
      leadgenFallbackAgent,
    ],
    handoffDescription:
      'Agent dinh tuyen cho callbot leadgen BH TNDS oto: xac nhan thong tin va chuyen agent chuyen trach.',
  });
}

export const leadgenRouterAgent = createLeadgenRouterAgent();
