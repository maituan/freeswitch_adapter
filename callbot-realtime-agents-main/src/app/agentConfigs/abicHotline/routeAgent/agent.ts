import { RealtimeAgent } from '@openai/agents/realtime';
import { abicRouteInstructions } from './instructions';
import { abicRouteTools } from './tools';

import { abicTravelAgent } from '@/app/agentConfigs/abicHotline/travel/agent';
import { abicMotorClaimAgent } from '@/app/agentConfigs/abicHotline/motorClaim/agent';
import { abicCareAgent } from '@/app/agentConfigs/abicHotline/care/agent';
import { abicComplaintAgent } from '@/app/agentConfigs/abicHotline/complaint/agent';
import { abicGenericProductAgent } from '@/app/agentConfigs/abicHotline/genericProduct/agent';
import { abicFallbackAgent } from '@/app/agentConfigs/abicHotline/fallback/agent';

// Root agent for the "abicHotline" scenario.
// Named "abicHotline" so UI shows the scenario name as the root agent.
export const abicHotlineAgent = new RealtimeAgent({
  name: 'abicHotline',
  voice: 'shimmer',
  instructions: abicRouteInstructions,
  handoffs: [
    abicTravelAgent,
    abicMotorClaimAgent,
    abicCareAgent,
    abicComplaintAgent,
    abicGenericProductAgent,
    abicFallbackAgent,
  ],
  tools: abicRouteTools,
  handoffDescription:
    'Agent định tuyến (router) cho tổng đài bảo hiểm agribank: hỏi nhu cầu theo mẫu và chuyển đúng agent chuyên trách.',
});

