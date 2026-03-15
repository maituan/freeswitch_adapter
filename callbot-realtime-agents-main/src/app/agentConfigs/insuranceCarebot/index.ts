import type { RealtimeAgent } from '@openai/agents/realtime';

import { carebotRouterAgent } from './core/carebotRouterAgent';
import { renewalReminderAgent } from './scenarios/renewalReminderAgent';
import { safetyReminderAgent, digitalCardAgent } from './scenarios/postSaleCareAgents';
import { holidayCareAgent } from './scenarios/holidayCareAgent';
import { greetingsAndActivationAgent } from './scenarios/greetingsAndActivationAgent';
import { monthlyCheckInAgent } from './scenarios/monthlyCheckInAgent';
import { objectionHandlingAgent } from './core/objectionHandlingAgent';
import { complianceGuardAgent } from './core/complianceGuardAgent';

export const insuranceCarebotScenario: RealtimeAgent[] = [
  // Root router must be first
  carebotRouterAgent,
  renewalReminderAgent,
  safetyReminderAgent,
  digitalCardAgent,
  holidayCareAgent,
  greetingsAndActivationAgent,
  monthlyCheckInAgent,
  objectionHandlingAgent,
  complianceGuardAgent,
];

export const insuranceCarebotMetadata = {
  isTextOnly: true,
};
