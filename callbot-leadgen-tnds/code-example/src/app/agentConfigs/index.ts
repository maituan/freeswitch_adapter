import { simpleHandoffScenario } from './simpleHandoff';
import { customerServiceRetailScenario } from './customerServiceRetail';
import { chatSupervisorScenario } from './chatSupervisor';
import { textOnlyScenario, textOnlyMetadata } from './textOnly';
import { hotlineAIScenario, hotlineAIMetadata } from './hotlineAI';
import { motheAIScenario, motheAIMetadata } from './motheAI';
import { bidvBotScenario, bidvBotMetadata } from './bidvBot';
import { abicHotlineScenario, abicHotlineMetadata } from './abicHotline';
import { leadgenTndsScenario, leadgenTndsMetadata } from './leadgenTNDS';
import { leadgenTndsVer02Scenario, leadgenTndsVer02Metadata } from './leadgenTNDSVer02';
import { insuranceCarebotScenario, insuranceCarebotMetadata } from './insuranceCarebot';

import type { RealtimeAgent } from '@openai/agents/realtime';

// Map of scenario key -> array of RealtimeAgent objects
export const allAgentSets: Record<string, RealtimeAgent[]> = {
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
  textOnly: textOnlyScenario,
  hotlineAI: hotlineAIScenario,
  motheAI: motheAIScenario,
  bidvBot: bidvBotScenario,
  abicHotline: abicHotlineScenario,
  leadgenTNDS: leadgenTndsScenario,
  leadgenTNDSVer02: leadgenTndsVer02Scenario,
  carebotAuto365: insuranceCarebotScenario,
};

// Metadata for scenarios (e.g., to control UI behavior)
export const agentSetMetadata: Record<string, { isTextOnly?: boolean }> = {
  textOnly: textOnlyMetadata,
  hotlineAI: hotlineAIMetadata,
  motheAI: motheAIMetadata,
  bidvBot: bidvBotMetadata,
  abicHotline: abicHotlineMetadata,
  leadgenTNDS: leadgenTndsMetadata,
  leadgenTNDSVer02: leadgenTndsVer02Metadata,
  carebotAuto365: insuranceCarebotMetadata,
};

export const defaultAgentSetKey = 'leadgenTNDS';
