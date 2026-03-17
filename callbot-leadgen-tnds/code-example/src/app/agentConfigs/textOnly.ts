import { RealtimeAgent } from '@openai/agents/realtime';

export const textOnlyAgent = new RealtimeAgent({
  name: 'textOnlyAgent',
  voice: 'sage',
  instructions: `You are a helpful text-only assistant. 
  
IMPORTANT: You should ONLY communicate via text. Do not use voice responses.

Your responsibilities:
- Answer questions clearly and concisely in text format
- Provide helpful information to users
- Assist with general inquiries
- Be friendly and professional in your text responses

Always respond in text format only.`,
  handoffs: [],
  tools: [],
  handoffDescription: 'Text-only assistant for general inquiries',
});

export const textOnlyScenario = [textOnlyAgent];

// Mark this scenario as text-only to hide audio controls
export const textOnlyMetadata = {
  isTextOnly: true,
};

