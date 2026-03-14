import type { RealtimeAgent } from '@openai/agents/realtime';

import { abicHotlineAgent } from './routeAgent/agent';
import { abicTravelAgent } from './travel/agent';
import { abicMotorClaimAgent } from './motorClaim/agent';
import { abicCareAgent } from './care/agent';
import { abicComplaintAgent } from './complaint/agent';
import { abicGenericProductAgent } from './genericProduct/agent';
import { abicFallbackAgent } from './fallback/agent';

export const abicHotlineScenario: RealtimeAgent[] = [
  // Root router must be first
  abicHotlineAgent,
  // Included for selection + handoff resolution
  abicTravelAgent,
  abicMotorClaimAgent,
  abicCareAgent,
  abicComplaintAgent,
  abicGenericProductAgent,
  abicFallbackAgent,
];

export const abicHotlineMetadata = {
  isTextOnly: false,
};

