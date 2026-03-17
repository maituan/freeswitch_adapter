import type { RealtimeAgent } from '@openai/agents/realtime';

import { leadgenRouterAgent } from './router/agent';
import { leadgenPricingAgent } from './pricing/agent';
import { leadgenFaqAgent } from './faq/agent';
import { leadgenCloserAgent } from './closer/agent';
import { leadgenFallbackAgent } from './fallback/agent';

export const leadgenTndsScenario: RealtimeAgent[] = [
  // Root router must be first
  leadgenRouterAgent,
  leadgenPricingAgent,
  leadgenFaqAgent,
  leadgenCloserAgent,
  leadgenFallbackAgent,
];

export const leadgenTndsMetadata = {
  isTextOnly: false,
};
