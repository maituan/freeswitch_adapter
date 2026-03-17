import type { LeadgenVer02SessionState } from './sessionState';

export function nextBucFromIntent(intentId: string): LeadgenVer02SessionState['currentBuc'] {
  if (intentId === 'identity' || intentId === 'confirm' || intentId === 'no_hear' || intentId === 'silence') {
    return 'BUC_1';
  }
  if (intentId === 'objection' || intentId === 'busy_callback' || intentId === 'wrong_number') {
    return 'BUC_2';
  }
  if (intentId === 'vehicle_info') return 'BUC_3';
  if (intentId === 'pricing_quote' || intentId === 'pricing_support' || intentId === 'sales_accept') {
    return 'BUC_4';
  }
  if (intentId === 'contact_capture') return 'BUC_5';
  return 'BUC_1';
}
