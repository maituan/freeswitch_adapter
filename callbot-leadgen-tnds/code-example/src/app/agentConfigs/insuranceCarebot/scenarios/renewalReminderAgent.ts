import { RealtimeAgent } from '@openai/agents/realtime';
import { renewalReminderInstructions } from './renewalReminderInstructions';
import { crmUpdateTool, getCarebotContextTool, sendZaloMessageTool } from '../tools';
import { objectionHandlingAgent } from '../core/objectionHandlingAgent';
import { complianceGuardAgent } from '../core/complianceGuardAgent';

type RenewalOpeningScript = {
  firstLine: string;
  secondLine: string;
};

export function createRenewalReminderAgent(prefilledOpeningScript?: RenewalOpeningScript) {
  const injectedOpening = prefilledOpeningScript
    ? `\n\n# OPENING TỪ FE (ƯU TIÊN CAO NHẤT)
Bạn phải theo đúng 2 bước sau:
1) Ở lượt đầu tiên, chỉ nói đúng nguyên văn câu sau, không thêm gì khác:
"${prefilledOpeningScript.firstLine}"
2) Sau đó dừng lại, chờ khách xác nhận ngắn (ví dụ: "ừ", "vâng", "anh nghe", "ok em", ...).
Chỉ khi khách đã xác nhận thì mới nói đúng nguyên văn câu thứ hai:
"${prefilledOpeningScript.secondLine}"`
    : '';

  return new RealtimeAgent({
    name: 'renewalReminderAgent',
    instructions: `${renewalReminderInstructions}${injectedOpening}`,
    tools: [getCarebotContextTool, sendZaloMessageTool, crmUpdateTool],
    handoffs: [objectionHandlingAgent, complianceGuardAgent],
    handoffDescription: 'Renewal reminder for expiring insurance policy.',
  });
}

export const renewalReminderAgent = createRenewalReminderAgent();
