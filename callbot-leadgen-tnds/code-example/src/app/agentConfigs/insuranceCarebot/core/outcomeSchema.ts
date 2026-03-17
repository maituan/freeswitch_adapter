export type CallOutcome =
  | 'success'
  | 'callback_scheduled'
  | 'declined'
  | 'wrong_number'
  | 'no_answer';

export type NextAction =
  | 'send_zalo_info'
  | 'schedule_callback'
  | 'activate_365'
  | 'close_no_action';

export type CarebotCallResult = {
  customerId: string;
  callOutcome: CallOutcome;
  nextAction: NextAction;
  structuredNotes: string;
  timestamp: string;
};

export function createCarebotCallResult(input: {
  customerId: string;
  callOutcome: CallOutcome;
  nextAction: NextAction;
  structuredNotes: string;
}): CarebotCallResult {
  return {
    ...input,
    timestamp: new Date().toISOString(),
  };
}
