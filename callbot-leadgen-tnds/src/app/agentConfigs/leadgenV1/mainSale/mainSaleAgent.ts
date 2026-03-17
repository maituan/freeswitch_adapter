import { RealtimeAgent } from '@openai/agents/realtime';

import { leadgenV1Instructions } from './instructions';
import { leadgenV1Tools } from '../tools';

export function createMainSaleAgent() {
  return new RealtimeAgent({
    name: 'mainSaleAgent',
    instructions: leadgenV1Instructions,
    tools: leadgenV1Tools,
  });
}
