import { tool } from '@/app/agentConfigs/types';
import { upsertCallbackRecord } from './store';

export const scheduleCallbackTool = tool({
  name: 'scheduleCallback',
  description: 'Schedule callback if customer is busy.',
  parameters: {
    type: 'object',
    properties: {
      customerId: { type: 'string' },
      datetime: { type: 'string', description: 'ISO datetime' },
      reason: { type: 'string' },
    },
    required: ['customerId', 'datetime', 'reason'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { customerId, datetime, reason } = args as {
      customerId: string;
      datetime: string;
      reason: string;
    };

    const callback = await upsertCallbackRecord({ customerId, datetime, reason });
    return {
      ok: true,
      callback,
    };
  },
});
