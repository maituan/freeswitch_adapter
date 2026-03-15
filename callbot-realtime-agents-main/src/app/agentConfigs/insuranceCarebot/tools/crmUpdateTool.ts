import { tool } from '@/app/agentConfigs/types';
import { createCarebotCallResult, type CallOutcome, type NextAction } from '../core/outcomeSchema';
import { upsertCrmRecord } from './store';

export const crmUpdateTool = tool({
  name: 'crmUpdate',
  description: 'Save normalized call outcome into CRM store.',
  parameters: {
    type: 'object',
    properties: {
      customerId: { type: 'string' },
      callOutcome: {
        type: 'string',
        enum: ['success', 'callback_scheduled', 'declined', 'wrong_number', 'no_answer'],
      },
      nextAction: {
        type: 'string',
        enum: ['send_zalo_info', 'schedule_callback', 'activate_365', 'close_no_action'],
      },
      structuredNotes: { type: 'string' },
    },
    required: ['customerId', 'callOutcome', 'nextAction', 'structuredNotes'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { customerId, callOutcome, nextAction, structuredNotes } = args as {
      customerId: string;
      callOutcome: CallOutcome;
      nextAction: NextAction;
      structuredNotes: string;
    };

    const record = createCarebotCallResult({
      customerId,
      callOutcome,
      nextAction,
      structuredNotes,
    });
    await upsertCrmRecord(record);

    return {
      ok: true,
      record,
    };
  },
});
