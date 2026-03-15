import { tool } from '@/app/agentConfigs/types';
import { upsertActivationRecord } from './store';

export const activateTraffic365Tool = tool({
  name: 'activateTraffic365',
  description: 'Activate Traffic 365 service for a customer.',
  parameters: {
    type: 'object',
    properties: {
      customerId: { type: 'string' },
      sendGuideVia: { type: 'string', enum: ['zalo', 'sms'] },
    },
    required: ['customerId'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { customerId, sendGuideVia = 'zalo' } = args as {
      customerId: string;
      sendGuideVia?: 'zalo' | 'sms';
    };

    const activation = await upsertActivationRecord(customerId);
    return {
      ok: true,
      activation,
      guideSentVia: sendGuideVia,
    };
  },
});
