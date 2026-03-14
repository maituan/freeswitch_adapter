import { RealtimeAgent } from '@openai/agents/realtime';
import {
  getCurrentTimeTool,
  lookupRoutePriceTool,
  lookupScheduleTool,
  getNextAvailableTripTool,
  checkPromotionTool,
  calculateSurchargeTool,
  lookupFAQTool,
} from './tools';
import { instructions } from './instructions';

export const hotlineAgent = new RealtimeAgent({
  name: 'hotlineAI',
  // voice: 'sage', // Not needed for text-only mode
  instructions: instructions,
  handoffs: [],
  tools: [
    getCurrentTimeTool,
    lookupRoutePriceTool,
    lookupScheduleTool,
    getNextAvailableTripTool,
    checkPromotionTool,
    calculateSurchargeTool,
    lookupFAQTool,
  ],
  handoffDescription: 'Trợ lý tổng đài thông minh cho Nhà xe Anh Huy Đất Cảng',
});
