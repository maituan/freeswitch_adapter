import type { LeadgenVer02TurnIntent } from './intentClassifier';
import type { LeadgenVer02SessionState } from './sessionState';

export type LeadgenRequiredAction =
  | 'chat'
  | 'handoff_sales'
  | 'handoff_objection'
  | 'quote'
  | 'capture_contact'
  | 'endcall'
  | 'clarify';

export type LeadgenTurnPolicy = {
  requiredAction: LeadgenRequiredAction;
  nextBuc: LeadgenVer02SessionState['currentBuc'];
  missingSlots: string[];
  shouldResetCounters?: Array<'noHearCount' | 'silenceCount' | 'clarifyCount'>;
};

export function getMissingPricingSlots(state: LeadgenVer02SessionState): string[] {
  const { vehicleType, numSeats, isBusiness, weightTons } = state.slots;
  const missing: string[] = [];
  if (!vehicleType) missing.push('vehicleType');
  if (vehicleType === 'truck') {
    if (typeof weightTons !== 'number' || weightTons <= 0) missing.push('weightTons');
  } else {
    if (typeof numSeats !== 'number' || numSeats <= 0) missing.push('numSeats');
    if (typeof isBusiness !== 'boolean') missing.push('isBusiness');
  }
  return missing;
}

export function decideTurnPolicy(
  agentName: string,
  state: LeadgenVer02SessionState,
  intent: LeadgenVer02TurnIntent,
): LeadgenTurnPolicy {
  if (agentName === 'leadgenRouterAgent') {
    if (intent.intentId === 'identity') {
      return { requiredAction: 'chat', nextBuc: 'BUC_1', missingSlots: [] };
    }
    if (intent.intentId === 'no_hear' || intent.intentId === 'silence') {
      return { requiredAction: 'chat', nextBuc: 'BUC_1', missingSlots: [] };
    }
    if (intent.intentId === 'wrong_number') {
      return { requiredAction: 'handoff_objection', nextBuc: 'BUC_2', missingSlots: [] };
    }
    if (
      intent.intentId === 'pricing_quote' ||
      intent.intentId === 'pricing_support' ||
      intent.intentId === 'vehicle_info'
    ) {
      const missingSlots = getMissingPricingSlots(state);
      return {
        requiredAction: 'handoff_sales',
        nextBuc: missingSlots.length === 0 ? 'BUC_4' : 'BUC_3',
        missingSlots,
        shouldResetCounters: ['noHearCount', 'silenceCount', 'clarifyCount'],
      };
    }
    if (
      intent.intentId === 'sales_accept' ||
      intent.intentId === 'contact_capture' ||
      intent.intentId === 'confirm'
    ) {
      const missingSlots = getMissingPricingSlots(state);
      return {
        requiredAction: 'handoff_sales',
        nextBuc:
          intent.intentId === 'confirm'
            ? missingSlots.length === 0
              ? 'BUC_4'
              : 'BUC_3'
            : (state.currentBuc === 'BUC_1' ? 'BUC_3' : state.currentBuc),
        missingSlots: intent.intentId === 'confirm' ? missingSlots : [],
        shouldResetCounters: ['noHearCount', 'silenceCount', 'clarifyCount'],
      };
    }
    if (intent.intentId === 'objection' || intent.intentId === 'busy_callback') {
      return { requiredAction: 'handoff_objection', nextBuc: 'BUC_2', missingSlots: [] };
    }
    return { requiredAction: 'clarify', nextBuc: 'BUC_1', missingSlots: [] };
  }

  if (agentName === 'leadgenSalesAgent') {
    if (intent.intentId === 'objection' || intent.intentId === 'busy_callback' || intent.intentId === 'wrong_number') {
      return { requiredAction: 'handoff_objection', nextBuc: 'BUC_2', missingSlots: [] };
    }
    if (intent.intentId === 'contact_capture' && intent.contactCaptureType === 'accounting_contact') {
      return { requiredAction: 'endcall', nextBuc: 'BUC_2', missingSlots: [] };
    }
    if (intent.intentId === 'contact_capture' || state.pricing.priceAccepted) {
      return { requiredAction: 'capture_contact', nextBuc: 'BUC_5', missingSlots: [] };
    }
    if (intent.intentId === 'sales_accept') {
      return { requiredAction: 'capture_contact', nextBuc: 'BUC_5', missingSlots: [] };
    }
    if (
      intent.intentId === 'pricing_quote' ||
      intent.intentId === 'vehicle_info' ||
      intent.intentId === 'pricing_support'
    ) {
      const missingSlots = getMissingPricingSlots(state);
      return {
        requiredAction: missingSlots.length === 0 ? 'quote' : 'chat',
        nextBuc: missingSlots.length === 0 ? 'BUC_4' : 'BUC_3',
        missingSlots,
      };
    }
    return { requiredAction: 'chat', nextBuc: state.currentBuc, missingSlots: [] };
  }

  if (agentName === 'leadgenObjectionAgent') {
    if (intent.intentId === 'contact_capture' && intent.contactCaptureType === 'accounting_contact') {
      return { requiredAction: 'endcall', nextBuc: 'BUC_2', missingSlots: [] };
    }
    if (
      intent.intentId === 'pricing_quote' ||
      intent.intentId === 'vehicle_info' ||
      intent.intentId === 'pricing_support' ||
      intent.intentId === 'sales_accept' ||
      intent.intentId === 'contact_capture'
    ) {
      const missingSlots = getMissingPricingSlots(state);
      return {
        requiredAction: 'handoff_sales',
        nextBuc: missingSlots.length === 0 ? 'BUC_4' : 'BUC_3',
        missingSlots,
      };
    }
    if (state.counters.refusalCount >= 2 && intent.intentId === 'objection') {
      return { requiredAction: 'endcall', nextBuc: 'BUC_2', missingSlots: [] };
    }
    return { requiredAction: 'chat', nextBuc: 'BUC_2', missingSlots: [] };
  }

  return { requiredAction: 'chat', nextBuc: state.currentBuc, missingSlots: [] };
}
