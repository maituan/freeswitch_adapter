import { tool } from '@/app/agentConfigs/types';

export const sendZaloMessageTool = tool({
  name: 'sendZaloMessage',
  description: 'Send a templated Zalo message to customer.',
  parameters: {
    type: 'object',
    properties: {
      customerId: { type: 'string' },
      templateId: { type: 'string' },
      params: { type: 'object', additionalProperties: true },
    },
    required: ['customerId', 'templateId'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const {
      customerId,
      templateId,
      params = {},
    } = args as {
      customerId: string;
      templateId: string;
      params?: Record<string, unknown>;
    };

    return {
      ok: true,
      channel: 'zalo',
      customerId,
      templateId,
      params,
      sentAt: new Date().toISOString(),
    };
  },
});
