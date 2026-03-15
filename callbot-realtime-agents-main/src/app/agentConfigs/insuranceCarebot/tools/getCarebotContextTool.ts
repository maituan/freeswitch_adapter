import { tool } from '@/app/agentConfigs/types';
import { getCarebotRuntimeContext } from '../core/contextSchema';

export const getCarebotContextTool = tool({
  name: 'getCarebotContext',
  description: 'Get normalized campaign and customer context for this call.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async (_args: any, runContext?: any) => {
    const cd = ((runContext?.context as any)?.customData ?? {}) as Record<string, any>;
    const context = { ...getCarebotRuntimeContext(), ...cd };
    return {
      ok: true,
      context,
    };
  },
});
