import { tool } from '@/app/agentConfigs/types';

const BASE_URL = process.env.BASE_URL ?? '';

export const knowledgeLookupTool = tool({
  name: 'knowledgeLookup',
  description: 'Lookup internal FAQ by topic or keyword.',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
    },
    required: ['topic'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const topic = String((args as { topic: string }).topic || '')
      .trim()
      .toLowerCase();
    try {
      const res = await fetch(`${BASE_URL}/api/carebot/kb/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      if (res.ok) return await res.json();
    } catch {
      // best-effort fallback
    }
    return {
      found: false,
      message: 'Khong tim thay muc phu hop trong FAQ noi bo.',
    };
  },
});
