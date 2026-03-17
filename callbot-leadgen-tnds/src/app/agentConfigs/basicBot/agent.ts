import { RealtimeAgent } from '@openai/agents/realtime';
import { basicBotInstructions } from './instructions';
import { tools } from './tools';

export function createBasicAgent() {
  return new RealtimeAgent({
    name: 'BasicBot',
    instructions: basicBotInstructions,
    tools: tools,
  });
}
