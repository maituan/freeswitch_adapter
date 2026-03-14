import { RealtimeAgent } from '@openai/agents/realtime';
import { routerInstructions } from './routerInstructions';
import { getCarebotContextTool } from '../tools';
import { renewalReminderAgent } from '../scenarios/renewalReminderAgent';
import { safetyReminderAgent, digitalCardAgent } from '../scenarios/postSaleCareAgents';
import { holidayCareAgent } from '../scenarios/holidayCareAgent';
import { greetingsAndActivationAgent } from '../scenarios/greetingsAndActivationAgent';
import { monthlyCheckInAgent } from '../scenarios/monthlyCheckInAgent';
import { objectionHandlingAgent } from './objectionHandlingAgent';
import { complianceGuardAgent } from './complianceGuardAgent';

export const carebotRouterAgent = new RealtimeAgent({
  name: 'carebotAuto365',
  instructions: routerInstructions,
  tools: [getCarebotContextTool],
  handoffs: [
    renewalReminderAgent,
    safetyReminderAgent,
    digitalCardAgent,
    holidayCareAgent,
    greetingsAndActivationAgent,
    monthlyCheckInAgent,
    objectionHandlingAgent,
    complianceGuardAgent,
  ],
  handoffDescription: 'Route CSKH campaigns for CareBot Auto365.',
});
