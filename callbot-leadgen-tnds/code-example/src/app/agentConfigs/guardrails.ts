import { zodTextFormat } from 'openai/helpers/zod';
import { GuardrailOutputZod, GuardrailOutput } from '@/app/types';
import { z } from 'zod';

// Validator that calls the /api/responses endpoint to
// validates the realtime output according to moderation policies. 
// This will prevent the realtime model from responding in undesired ways
// By sending it a corrective message and having it redirect the conversation.
export async function runGuardrailClassifier(
  message: string,
  companyName: string = 'newTelco',
): Promise<GuardrailOutput> {
  const messages = [
    {
      role: 'user',
      content: `You are an expert at classifying text according to moderation policies. Consider the provided message, analyze potential classes from output_classes, and output the best classification. Output json, following the provided schema. Keep your analysis and reasoning short and to the point, maximum 2 sentences.

      <info>
      - Company name: ${companyName}
      </info>

      <message>
      ${message}
      </message>

      <output_classes>
      - OFFENSIVE: Content that includes hate speech, discriminatory language, insults, slurs, or harassment.
      - OFF_BRAND: Content that discusses competitors in a disparaging way.
      - VIOLENCE: Content that includes explicit threats, incitement of harm, or graphic descriptions of physical injury or violence.
      - UNPROFESSIONAL: Content that is rude, dismissive, or lacks professionalism in customer service context.
      - NONE: If no other classes are appropriate and the message is fine.
      </output_classes>
      `,
    },
  ];

  const response = await fetch('/api/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: messages,
      text: {
        format: zodTextFormat(GuardrailOutputZod, 'output_format'),
      },
    }),
  });

  if (!response.ok) {
    console.warn('Server returned an error:', response);
    return Promise.reject('Error with runGuardrailClassifier.');
  }

  const data = (await response.json()) as { output_parsed?: unknown };

  try {
    const output = GuardrailOutputZod.parse(data.output_parsed);
    return {
      ...output,
      testText: message,
    };
  } catch (error) {
    console.error('Error parsing the message content as GuardrailOutput:', error);
    return Promise.reject('Failed to parse guardrail output.');
  }
}

const LeadgenIntentOutputZod = z.object({
  intent: z.enum(['identity', 'pricing', 'faq', 'closer', 'fallback', 'unclear']),
  requiredAction: z.enum(['chat', 'handoff_faq', 'handoff_pricing', 'handoff_closer', 'handoff_fallback', 'clarify']),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

type LeadgenIntentOutput = z.infer<typeof LeadgenIntentOutputZod>;

const LeadgenFallbackCaseOutputZod = z.object({
  caseType: z.enum([
    'still_valid_or_newly_bought',
    'already_renewed',
    'sold_car',
    'busy_or_callback',
    'wrong_number_or_not_owner',
    'other',
  ]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

type LeadgenFallbackCaseOutput = z.infer<typeof LeadgenFallbackCaseOutputZod>;

const LeadgenFallbackResponsePolicyOutputZod = z.object({
  compliant: z.boolean(),
  expectedAction: z.enum(['probe_with_chat', 'allow_close_or_forward']),
  rationale: z.string(),
});

type LeadgenFallbackResponsePolicyOutput = z.infer<typeof LeadgenFallbackResponsePolicyOutputZod>;

const LeadgenAlreadyRenewedBinaryOutputZod = z.object({
  isAlreadyRenewed: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

type LeadgenAlreadyRenewedBinaryOutput = z.infer<typeof LeadgenAlreadyRenewedBinaryOutputZod>;

const LeadgenStillValidBinaryOutputZod = z.object({
  isStillValidOrNotDueYet: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

type LeadgenStillValidBinaryOutput = z.infer<typeof LeadgenStillValidBinaryOutputZod>;

export async function runLeadgenIntentClassifier(
  message: string,
  context?: { agentName?: string; previousAgent?: string },
): Promise<LeadgenIntentOutput> {
  const prompt = `
You are an intent classifier for a Vietnamese car-insurance leadgen callbot.
Return JSON strictly with the provided schema.

<context>
- Current agent: ${context?.agentName ?? 'unknown'}
- Previous agent: ${context?.previousAgent ?? 'unknown'}
</context>

<message>
${message}
</message>

<intent_definitions>
- identity: customer asks "em ở đâu", "em là ai", "bên bảo hiểm nào", "công ty nào"
- pricing: asks fee/price/quote/discount/program ("bao nhiêu", "báo giá", "thế bao tiền", "chiết khấu", "chương trình", "ưu đãi", "khuyến mãi")
- faq: general policy/process questions that are not direct price quote requests
- closer: customer accepts and asks next-step/checkout/payment execution
- fallback: off-topic, explicit refusal, cannot continue, OR customer says already renewed/bought, sold car, still valid/not due yet/newly bought still active, OR says vehicle belongs to company / asks corporate owner handling
- unclear: ambiguous or too short to classify confidently
</intent_definitions>

<required_action_policy>
- identity -> handoff_faq
- pricing -> handoff_pricing
- faq -> chat
- closer -> handoff_closer
- fallback -> handoff_fallback
- unclear -> clarify
</required_action_policy>
`;

  const response = await fetch('/api/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: prompt }],
      text: { format: zodTextFormat(LeadgenIntentOutputZod, 'leadgen_intent_output') },
    }),
  });

  if (!response.ok) {
    return Promise.reject('Error with runLeadgenIntentClassifier.');
  }

  const data = (await response.json()) as { output_parsed?: unknown };
  try {
    return LeadgenIntentOutputZod.parse(data.output_parsed);
  } catch {
    return Promise.reject('Failed to parse leadgen intent output.');
  }
}

export async function runLeadgenFallbackCaseClassifier(
  message: string,
  context?: { agentName?: string; previousAgent?: string },
): Promise<LeadgenFallbackCaseOutput> {
  const prompt = `
You are a classifier for Vietnamese car-insurance fallback conversation turns.
Return JSON strictly with the provided schema.

<context>
- Current agent: ${context?.agentName ?? 'unknown'}
- Previous agent: ${context?.previousAgent ?? 'unknown'}
</context>

<message>
${message}
</message>

<case_definitions>
- still_valid_or_newly_bought: customer says policy/vehicle is still valid, not due yet, or just bought and still has active coverage
- already_renewed: customer says already bought/renewed already (examples: "đã mua rồi", "mình mua rồi", "anh vừa gia hạn rồi", "đã renew rồi")
- sold_car: customer sold the car or no longer uses that car
- busy_or_callback: customer is busy, asks to call later, cannot talk now
- wrong_number_or_not_owner: wrong contact, not vehicle owner, unrelated person picks up, OR says this is company car and they are not the insurance buyer
- other: none of the above
</case_definitions>
`;

  const response = await fetch('/api/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: prompt }],
      text: { format: zodTextFormat(LeadgenFallbackCaseOutputZod, 'leadgen_fallback_case_output') },
    }),
  });

  if (!response.ok) {
    return Promise.reject('Error with runLeadgenFallbackCaseClassifier.');
  }

  const data = (await response.json()) as { output_parsed?: unknown };
  try {
    return LeadgenFallbackCaseOutputZod.parse(data.output_parsed);
  } catch {
    return Promise.reject('Failed to parse leadgen fallback case output.');
  }
}

export async function runLeadgenFallbackResponsePolicyClassifier(args: {
  userMessage: string;
  agentOutput: string;
  caseType: LeadgenFallbackCaseOutput['caseType'];
}): Promise<LeadgenFallbackResponsePolicyOutput> {
  const prompt = `
You are a policy checker for Vietnamese car-insurance fallback responses.
Return JSON strictly with the provided schema.

<user_message>
${args.userMessage}
</user_message>

<case_type>
${args.caseType}
</case_type>

<agent_output>
${args.agentOutput}
</agent_output>

<policy>
- If case_type is still_valid_or_newly_bought:
  - If user has not provided concrete remaining duration, response should ask probing details about purchase/coverage month.
  - If user clearly indicates there are still about 1-2 months left, response should directly persuade early renewal now to lock current promotion, and should not re-ask month details in the same turn.
  - Response must end with |CHAT.
  - Response must not end the call or forward in this turn.
- If case_type is already_renewed:
  - First reaction should prioritize price-probing sales script.
  - Response must continue sales conversation (one of: ask renewal price timing, ask to add Zalo, or offer bodywork quote).
  - Response must not use "recalculate fee / transfer specialist now" closing style.
  - Response must end with |CHAT in this first reaction.
  - Response must not end the call in this first reaction.
- Other case_type values may close/forward based on context.

<non_compliant_examples_for_already_renewed>
- "Dạ em ghi nhận anh đã mua rồi... em chào anh. |ENDCALL"
- "Trường hợp của anh cần tính toán lại phí... em báo chuyên viên gọi lại. |FORWARD"
- Any response that confirms purchase then immediately closes.
</non_compliant_examples_for_already_renewed>
</policy>
`;

  const response = await fetch('/api/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: prompt }],
      text: {
        format: zodTextFormat(
          LeadgenFallbackResponsePolicyOutputZod,
          'leadgen_fallback_response_policy_output',
        ),
      },
    }),
  });

  if (!response.ok) {
    return Promise.reject('Error with runLeadgenFallbackResponsePolicyClassifier.');
  }

  const data = (await response.json()) as { output_parsed?: unknown };
  try {
    return LeadgenFallbackResponsePolicyOutputZod.parse(data.output_parsed);
  } catch {
    return Promise.reject('Failed to parse leadgen fallback response policy output.');
  }
}

export async function runLeadgenAlreadyRenewedBinaryClassifier(
  message: string,
): Promise<LeadgenAlreadyRenewedBinaryOutput> {
  const prompt = `
You are a binary classifier for Vietnamese insurance calls.
Return JSON strictly with the provided schema.

<task>
Determine whether the user message means they already bought/renewed insurance.
</task>

<positive_examples>
- "mình mua rồi"
- "anh đã mua rồi"
- "mình vừa gia hạn rồi"
- "chị renew rồi em"
</positive_examples>

<negative_examples>
- "mình vẫn còn hạn"
- "chưa mua"
- "để anh xem lại"
</negative_examples>

<message>
${message}
</message>
`;

  const response = await fetch('/api/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: prompt }],
      text: {
        format: zodTextFormat(
          LeadgenAlreadyRenewedBinaryOutputZod,
          'leadgen_already_renewed_binary_output',
        ),
      },
    }),
  });

  if (!response.ok) {
    return Promise.reject('Error with runLeadgenAlreadyRenewedBinaryClassifier.');
  }

  const data = (await response.json()) as { output_parsed?: unknown };
  try {
    return LeadgenAlreadyRenewedBinaryOutputZod.parse(data.output_parsed);
  } catch {
    return Promise.reject('Failed to parse leadgen already renewed binary output.');
  }
}

export async function runLeadgenStillValidBinaryClassifier(
  message: string,
): Promise<LeadgenStillValidBinaryOutput> {
  const prompt = `
You are a binary classifier for Vietnamese insurance calls.
Return JSON strictly with the provided schema.

<task>
Determine whether the user message means the current policy is still valid or not due yet.
</task>

<positive_examples>
- "vẫn còn hạn"
- "chưa tới hạn"
- "còn 1 tháng nữa mới hết hạn"
- "còn 2 tháng nữa mới hết hạn"
- "xe mới mua còn hạn"
</positive_examples>

<negative_examples>
- "mình mua rồi"
- "đã gia hạn rồi"
- "bán xe rồi"
- "để khi khác gọi lại"
</negative_examples>

<message>
${message}
</message>
`;

  const response = await fetch('/api/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: prompt }],
      text: {
        format: zodTextFormat(
          LeadgenStillValidBinaryOutputZod,
          'leadgen_still_valid_binary_output',
        ),
      },
    }),
  });

  if (!response.ok) {
    return Promise.reject('Error with runLeadgenStillValidBinaryClassifier.');
  }

  const data = (await response.json()) as { output_parsed?: unknown };
  try {
    return LeadgenStillValidBinaryOutputZod.parse(data.output_parsed);
  } catch {
    return Promise.reject('Failed to parse leadgen still valid binary output.');
  }
}

export interface RealtimeOutputGuardrailResult {
  tripwireTriggered: boolean;
  outputInfo: any;
}

export interface RealtimeOutputGuardrailArgs {
  agentOutput: string;
  agent?: any;
  context?: any;
}

function extractMessageText(content: any[] = []): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => {
      if (!c || typeof c !== 'object') return '';
      if (c.type === 'input_text') return c.text ?? '';
      if (c.type === 'text') return c.text ?? '';
      if (c.type === 'audio') return c.transcript ?? '';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function messageHasToolCall(message: any, toolName: string): boolean {
  const content = message?.content ?? [];
  if (!Array.isArray(content)) return false;
  return content.some((c: any) => {
    if (!c || typeof c !== 'object') return false;
    if (c?.type === 'function_call' && c?.name === toolName) return true;
    if (c?.type === 'tool_call' && c?.name === toolName) return true;
    if (c?.type === 'function_call' && c?.tool_name === toolName) return true;
    return false;
  });
}

function historyHasToolCall(items: any[], toolName: string): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((it) => {
    if (!it) return false;
    if (it.type === 'function_call' && it.name === toolName) return true;
    if (it.type === 'tool_call' && it.name === toolName) return true;
    if (it.type === 'function_call' && it.tool_name === toolName) return true;
    if (it.type === 'function_call_output' && it.name === toolName) return true;
    if (it.type === 'tool_result' && (it.name === toolName || it.tool_name === toolName)) return true;
    if (it.type === 'message' && it.role === 'assistant' && messageHasToolCall(it, toolName)) return true;
    return false;
  });
}

function normalizeVietnamese(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLastUserText(history: any[]): { idx: number; text: string } {
  let lastUserIdx = -1;
  let lastUserText = '';
  for (let i = history.length - 1; i >= 0; i--) {
    const it = history[i];
    if (it?.type === 'message' && it?.role === 'user') {
      lastUserIdx = i;
      lastUserText = extractMessageText(it.content ?? []);
      break;
    }
  }
  return { idx: lastUserIdx, text: lastUserText };
}

async function getLeadgenIntentFromContext(
  context: any,
  opts: { agentName?: string },
): Promise<{ idx: number; text: string; normalizedText: string; intent: LeadgenIntentOutput | null }> {
  const history: any[] = Array.isArray(context?.history) ? context.history : [];
  const { idx, text } = getLastUserText(history);
  const normalizedText = normalizeVietnamese(text);

  const cache = ((context as any).__leadgenIntentCache ??= {
    lastUserText: '',
    result: null as LeadgenIntentOutput | null,
  });
  if (cache.lastUserText === normalizedText && cache.result) {
    return { idx, text, normalizedText, intent: cache.result };
  }

  try {
    const result = await runLeadgenIntentClassifier(text, { agentName: opts.agentName });
    cache.lastUserText = normalizedText;
    cache.result = result;
    return { idx, text, normalizedText, intent: result };
  } catch {
    return { idx, text, normalizedText, intent: null };
  }
}

// Creates a guardrail bound to a specific company name for output moderation purposes. 
export function createModerationGuardrail(companyName: string) {
  return {
    name: 'moderation_guardrail',

    async execute({ agentOutput }: RealtimeOutputGuardrailArgs): Promise<RealtimeOutputGuardrailResult> {
      try {
        const res = await runGuardrailClassifier(agentOutput, companyName);
        const triggered = res.moderationCategory !== 'NONE';
        return {
          tripwireTriggered: triggered,
          outputInfo: res,
        };
      } catch {
        return {
          tripwireTriggered: false,
          outputInfo: { error: 'guardrail_failed' },
        };
      }
    },
  } as const;
}

/**
 * Guardrail: require that abicTravelAgent calls `abicTravelNextStep` before producing output.
 * This prevents the model from answering directly from instructions (often wrong step/order).
 */
export function createAbicTravelToolRequiredGuardrail() {
  return {
    name: 'abic_travel_tool_required',
    async execute({
      agentOutput,
      agent,
      context,
    }: RealtimeOutputGuardrailArgs): Promise<RealtimeOutputGuardrailResult> {
      try {
        if (agent?.name !== 'abicTravelAgent') {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        const history: any[] = Array.isArray(context?.history) ? context.history : [];

        // Find last user message
        let lastUserIdx = -1;
        for (let i = history.length - 1; i >= 0; i--) {
          const it = history[i];
          if (it?.type === 'message' && it?.role === 'user') {
            lastUserIdx = i;
            break;
          }
        }

        const lastUserMsg = lastUserIdx >= 0 ? history[lastUserIdx] : undefined;
        const lastUserText = lastUserMsg ? extractMessageText(lastUserMsg.content ?? []) : '';
        const outputText = String(agentOutput ?? '').trim();

        // If we don't have a usable output, don't tripwire.
        if (!outputText) {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        // Check if tool was called after that user message.
        const toolName = 'abicTravelNextStep';
        const after = lastUserIdx >= 0 ? history.slice(lastUserIdx + 1) : history;
        const hasCall = historyHasToolCall(after, toolName);

        if (hasCall) {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        // Best-effort debug to terminal
        try {
          fetch('/api/debug', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'guardrail',
              event: 'abic_travel_tool_required',
              agentName: 'abicTravelAgent',
              data: {
                lastUserText,
                historyLen: history.length,
                hasCall,
                agentOutputPreview: String(agentOutput ?? '').slice(0, 200),
              },
            }),
          }).catch(() => {});
        } catch {}

        return {
          tripwireTriggered: true,
          outputInfo: {
            reason: 'tool_required',
            requiredTool: toolName,
            lastUserText,
            corrective:
              'BẮT BUỘC gọi tool abicTravelNextStep với userText = nguyên văn khách vừa nói; ' +
              'sau đó chỉ được trả lời đúng replyText từ tool (không thêm bớt).',
          },
        };
      } catch (err: any) {
        // Fail open
        return {
          tripwireTriggered: false,
          outputInfo: { error: 'abic_travel_guardrail_failed', details: String(err?.message ?? err) },
        };
      }
    },
  } as const;
}

/**
 * Debug-only guardrail: logs output + history summary for abicTravelAgent.
 */
export function createDebugOutputGuardrail() {
  return {
    name: 'debug_output_guardrail',
    async execute({
      agentOutput,
      agent,
      context,
    }: RealtimeOutputGuardrailArgs): Promise<RealtimeOutputGuardrailResult> {
      try {
        if (agent?.name !== 'abicTravelAgent') {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }
        const history: any[] = Array.isArray(context?.history) ? context.history : [];
        const tail = history.slice(-3).map((h) => ({
          type: h?.type,
          role: h?.role,
          name: h?.name,
          contentTypes: Array.isArray(h?.content) ? h.content.map((c: any) => c?.type) : undefined,
        }));
        fetch('/api/debug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'guardrail',
            event: 'debug_output',
            agentName: agent?.name,
            data: {
              outputPreview: String(agentOutput ?? '').slice(0, 160),
              historyLen: history.length,
              historyTail: tail,
            },
          }),
        }).catch(() => {});
      } catch {}
      return { tripwireTriggered: false, outputInfo: { ok: true } };
    },
  } as const;
}

// Specific guardrail for HotlineAI - Nhà xe Anh Huy Đất Cảng
// (Currently disabled by default for text-only agents, but available if needed)
export const hotlineAICompanyName = 'Nhà xe Anh Huy Đất Cảng';

export function createHotlineAIGuardrail() {
  return createModerationGuardrail(hotlineAICompanyName);
}

/**
 * Guardrail for leadgenTNDS router opening:
 * - Forbid "anh/chị" and "anh hoặc chị" wording.
 */
export function createLeadgenOpeningGuardrail() {
  return {
    name: 'leadgen_opening_guardrail',
    async execute({
      agentOutput,
      agent,
      context,
    }: RealtimeOutputGuardrailArgs): Promise<RealtimeOutputGuardrailResult> {
      try {
        if (agent?.name !== 'leadgenTNDS') {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        const outputText = String(agentOutput ?? '').trim();
        if (!outputText) {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        const normalized = outputText.toLowerCase();
        if (normalized.includes('anh/chị') || normalized.includes('anh hoặc chị')) {
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'forbidden_addressing',
              corrective:
                'Không dùng "anh/chị" hoặc "anh hoặc chị". Dùng đúng gender từ getLeadContext và trả lời lại.',
            },
          };
        }

        const history: any[] = Array.isArray(context?.history) ? context.history : [];
        const classified = await getLeadgenIntentFromContext(context, { agentName: agent?.name });
        const { text: lastUserText } = getLastUserText(history);
        let routerFallbackCase: LeadgenFallbackCaseOutput | null = null;
        try {
          routerFallbackCase = await runLeadgenFallbackCaseClassifier(lastUserText, {
            agentName: agent?.name,
          });
        } catch {
          routerFallbackCase = null;
        }
        const asksIdentityOrLocation = classified.intent?.requiredAction === 'handoff_faq';
        const asksPricing = classified.intent?.requiredAction === 'handoff_pricing';
        const asksFallbackByCase =
          routerFallbackCase !== null &&
          [
            'still_valid_or_newly_bought',
            'already_renewed',
            'sold_car',
            'busy_or_callback',
            'wrong_number_or_not_owner',
          ].includes(routerFallbackCase.caseType);
        const asksFallback =
          classified.intent?.requiredAction === 'handoff_fallback' || asksFallbackByCase;

        // Router must handoff to FAQ agent for identity/location questions; do not answer directly.
        if (asksIdentityOrLocation) {
          const after = history.slice(classified.idx >= 0 ? classified.idx + 1 : 0);
          const hasFaqHandoff = historyHasToolCall(after, 'transfer_to_leadgenFaqAgent');
          if (!hasFaqHandoff) {
            return {
              tripwireTriggered: true,
              outputInfo: {
                reason: 'router_must_handoff_faq',
                corrective:
                  'Bạn đang ở leadgenTNDS (router). Với câu hỏi "em ở đâu/em bên nào/em là ai/bảo hiểm gì", ' +
                  'BẮT BUỘC handoff sang leadgenFaqAgent, không tự trả lời nội dung công ty.',
              },
            };
          }
        }

        // Router must handoff to pricing agent for pricing/program intents.
        if (asksPricing) {
          const after = history.slice(classified.idx >= 0 ? classified.idx + 1 : 0);
          const hasPricingHandoff = historyHasToolCall(after, 'transfer_to_leadgenPricingAgent');
          if (!hasPricingHandoff) {
            return {
              tripwireTriggered: true,
              outputInfo: {
                reason: 'router_must_handoff_pricing',
                corrective:
                  'Bạn đang ở leadgenTNDS (router). Với intent hỏi giá/chương trình/ưu đãi, ' +
                  'BẮT BUỘC handoff sang leadgenPricingAgent, không tự trả lời |CHAT.',
              },
            };
          }
        }

        // Router must handoff to fallback agent for refusal/off-topic/end-call intents.
        if (asksFallback) {
          const after = history.slice(classified.idx >= 0 ? classified.idx + 1 : 0);
          const hasFallbackHandoff = historyHasToolCall(after, 'transfer_to_leadgenFallbackAgent');
          if (!hasFallbackHandoff) {
            return {
              tripwireTriggered: true,
              outputInfo: {
                reason: 'router_must_handoff_fallback',
                corrective:
                  'Bạn đang ở leadgenTNDS (router). Với tín hiệu từ chối/ngoài phạm vi như "đã mua", "bán xe", ' +
                  '"bán lâu rồi", "không đi xe đó nữa", BẮT BUỘC handoff sang leadgenFallbackAgent.',
              },
            };
          }
        }

        return { tripwireTriggered: false, outputInfo: { ok: true } };
      } catch (err: any) {
        return {
          tripwireTriggered: false,
          outputInfo: { error: 'leadgen_guardrail_failed', details: String(err?.message ?? err) },
        };
      }
    },
  } as const;
}

/**
 * Guardrail: leadgenFaqAgent must call lookupTndsFaq before replying.
 */
export function createLeadgenFaqToolRequiredGuardrail() {
  return {
    name: 'leadgen_faq_tool_required',
    async execute({
      agentOutput,
      agent,
      context,
    }: RealtimeOutputGuardrailArgs): Promise<RealtimeOutputGuardrailResult> {
      try {
        if (agent?.name !== 'leadgenFaqAgent') {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        const outputText = String(agentOutput ?? '').trim();
        if (!outputText) {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        const history: any[] = Array.isArray(context?.history) ? context.history : [];

        const classified = await getLeadgenIntentFromContext(context, { agentName: agent?.name });
        const asksIdentityOrLocation = classified.intent?.requiredAction === 'handoff_faq';
        const asksPricing = classified.intent?.requiredAction === 'handoff_pricing';
        const asksFallback = classified.intent?.requiredAction === 'handoff_fallback';
        const normalizedOutput = normalizeVietnamese(outputText);
        const after = classified.idx >= 0 ? history.slice(classified.idx + 1) : history;
        const hasPricingHandoff = historyHasToolCall(after, 'transfer_to_leadgenPricingAgent');
        const hasFallbackHandoff = historyHasToolCall(after, 'transfer_to_leadgenFallbackAgent');

        // FAQ agent must keep addressing consistent with gender and avoid hardcoded "anh/chị".
        if (
          normalizedOutput.includes('anh chi') ||
          normalizedOutput.includes('anh hoac chi')
        ) {
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'faq_forbidden_generic_addressing',
              corrective:
                'Trong leadgenFaqAgent, không dùng "anh/chị" hoặc "anh hoặc chị". ' +
                'BẮT BUỘC xưng hô theo đúng {gender} trong call context.',
            },
          };
        }

        // FAQ agent must handoff to pricing for price-intent turns (do not just say |FORWARD in text).
        if (asksPricing && !hasPricingHandoff) {
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'faq_price_must_handoff_pricing',
              corrective:
                'Khách đang hỏi giá/phi/chiết khấu. Trong leadgenFaqAgent, BẮT BUỘC gọi handoff ' +
                'transfer_to_leadgenPricingAgent ngay; không chỉ trả |FORWARD bằng text.',
            },
          };
        }

        if (asksIdentityOrLocation && normalizedOutput.includes('forward')) {
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'faq_identity_must_chat',
              corrective:
                'Khách đang hỏi xác thực đơn vị (em ở đâu/em bên nào/em là ai/bảo hiểm gì). ' +
                'Trong leadgenFaqAgent, KHÔNG được dùng |FORWARD. ' +
                'BẮT BUỘC trả lời đúng theo kết quả lookupTndsFaq và kết thúc bằng |CHAT.',
            },
          };
        }

        // FAQ agent must handoff to fallback for refusal/off-scope turns.
        if (asksFallback && !hasFallbackHandoff) {
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'faq_fallback_must_handoff',
              corrective:
                'Trong leadgenFaqAgent, khi intent là từ chối/ngoài phạm vi (requiredAction = handoff_fallback), ' +
                'BẮT BUỘC gọi handoff transfer_to_leadgenFallbackAgent; không tự trả lời |CHAT.',
            },
          };
        }

        const hasFaqToolCall = historyHasToolCall(after, 'lookupTndsFaq');

        // Anti-loop latch: if we already tripped for the same user text once, fail open.
        const guardrailState = ((context as any).__leadgenFaqGuardrailState ??= {
          lastToolRequiredTripFor: '',
        });
        const alreadyTrippedThisTurn = guardrailState.lastToolRequiredTripFor === classified.normalizedText;

        if (!hasFaqToolCall) {
          if (alreadyTrippedThisTurn) {
            return {
              tripwireTriggered: false,
              outputInfo: { ok: true, relaxed: 'already_tripped_same_turn' },
            };
          }
          guardrailState.lastToolRequiredTripFor = classified.normalizedText;
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'faq_tool_required',
              corrective:
                'Bạn đang ở leadgenFaqAgent. BẮT BUỘC gọi tool lookupTndsFaq với câu hỏi của khách trước; ' +
                'sau đó trả lời theo kết quả tool và kết thúc bằng |CHAT.',
            },
          };
        }

        return { tripwireTriggered: false, outputInfo: { ok: true } };
      } catch (err: any) {
        return {
          tripwireTriggered: false,
          outputInfo: { error: 'leadgen_faq_guardrail_failed', details: String(err?.message ?? err) },
        };
      }
    },
  } as const;
}

/**
 * Guardrail: for leadgenFallbackAgent, "still valid / newly bought" turns
 * must ask follow-up details instead of ending/forwarding immediately.
 */
export function createLeadgenFallbackStillValidGuardrail() {
  return {
    name: 'leadgen_fallback_still_valid_guardrail',
    async execute({
      agentOutput,
      agent,
      context,
    }: RealtimeOutputGuardrailArgs): Promise<RealtimeOutputGuardrailResult> {
      try {
        if (agent?.name !== 'leadgenFallbackAgent') {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        const outputText = String(agentOutput ?? '').trim();
        if (!outputText) {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        const history: any[] = Array.isArray(context?.history) ? context.history : [];
        const { text: lastUserText } = getLastUserText(history);
        const fallbackIntent = await getLeadgenIntentFromContext(context, { agentName: agent?.name });
        const asksPricingInFallback = fallbackIntent.intent?.requiredAction === 'handoff_pricing';
        if (asksPricingInFallback) {
          const after = history.slice(fallbackIntent.idx >= 0 ? fallbackIntent.idx + 1 : 0);
          const hasPricingHandoff = historyHasToolCall(after, 'transfer_to_leadgenPricingAgent');
          if (!hasPricingHandoff) {
            return {
              tripwireTriggered: true,
              outputInfo: {
                reason: 'fallback_price_must_handoff_pricing',
                corrective:
                  'Trong leadgenFallbackAgent, khi khách quay lại hỏi giá/chương trình/chiết khấu, ' +
                  'BẮT BUỘC handoff SDK sang leadgenPricingAgent ngay; không tự trả lời |CHAT trong fallback.',
              },
            };
          }
        }
        let fallbackCase: LeadgenFallbackCaseOutput | null = null;
        let policyCheck: LeadgenFallbackResponsePolicyOutput | null = null;
        let renewedBinary: LeadgenAlreadyRenewedBinaryOutput | null = null;
        let stillValidBinary: LeadgenStillValidBinaryOutput | null = null;

        try {
          fallbackCase = await runLeadgenFallbackCaseClassifier(lastUserText, {
            agentName: agent?.name,
          });
        } catch {
          fallbackCase = null;
        }

        if (!fallbackCase) {
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'fallback_case_classifier_required',
              corrective:
                'Không xác định được fallback case. Hãy phân loại lại theo ngữ cảnh khách vừa nói ' +
                'và trả lời theo đúng kịch bản; không được kết thúc cuộc gọi vội.',
            },
          };
        }

        try {
          renewedBinary = await runLeadgenAlreadyRenewedBinaryClassifier(lastUserText);
        } catch {
          renewedBinary = null;
        }
        try {
          stillValidBinary = await runLeadgenStillValidBinaryClassifier(lastUserText);
        } catch {
          stillValidBinary = null;
        }

        const isAlreadyRenewedByBinary = Boolean(
          renewedBinary?.isAlreadyRenewed && (renewedBinary?.confidence ?? 0) >= 0.5,
        );
        const isStillValidByBinary = Boolean(
          stillValidBinary?.isStillValidOrNotDueYet && (stillValidBinary?.confidence ?? 0) >= 0.5,
        );
        const effectiveCaseType: LeadgenFallbackCaseOutput['caseType'] =
          fallbackCase.caseType === 'already_renewed' || isAlreadyRenewedByBinary
            ? 'already_renewed'
            : fallbackCase.caseType === 'still_valid_or_newly_bought' || isStillValidByBinary
              ? 'still_valid_or_newly_bought'
            : fallbackCase.caseType;

        const mustProbeCases = new Set<LeadgenFallbackCaseOutput['caseType']>([
          'still_valid_or_newly_bought',
          'already_renewed',
        ]);
        if (!mustProbeCases.has(effectiveCaseType)) {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        try {
          policyCheck = await runLeadgenFallbackResponsePolicyClassifier({
            userMessage: lastUserText,
            agentOutput: outputText,
            caseType: effectiveCaseType,
          });
        } catch {
          policyCheck = null;
        }

        if (!policyCheck?.compliant) {
          const correctiveByCase: Record<string, string> = {
            still_valid_or_newly_bought:
              'Khách nói xe vẫn còn hạn/mới mua còn hạn. Trong leadgenFallbackAgent, ' +
              'BẮT BUỘC tư vấn theo đúng kịch bản còn hạn (nếu khách đã nói rõ còn 1-2 tháng thì thuyết phục nối hạn sớm ngay) và kết thúc bằng |CHAT. ' +
              'KHÔNG dùng |FORWARD hoặc |ENDCALL ở lượt này.',
            already_renewed:
              'Khách nói đã mua/đã gia hạn rồi. Trong leadgenFallbackAgent, ' +
              'BẮT BUỘC tiếp tục tư vấn theo 1 trong 3 hướng: hỏi tham khảo mức phí vừa mua, ' +
              'xin kết bạn Zalo gửi ưu đãi, hoặc gợi ý báo giá thân vỏ; và kết thúc bằng |CHAT. ' +
              'KHÔNG kết thúc cuộc gọi ngay ở lượt này.',
          };
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'fallback_case_must_probe_with_chat',
              caseType: effectiveCaseType,
              policy: policyCheck ?? { compliant: false, expectedAction: 'probe_with_chat', rationale: 'policy_checker_failed' },
              corrective:
                correctiveByCase[effectiveCaseType] ??
                'Trong case này, BẮT BUỘC phản hồi theo hướng khai thác/tư vấn tiếp và kết thúc bằng |CHAT.',
            },
          };
        }

        return { tripwireTriggered: false, outputInfo: { ok: true } };
      } catch (err: any) {
        return {
          tripwireTriggered: false,
          outputInfo: {
            error: 'leadgen_fallback_still_valid_guardrail_failed',
            details: String(err?.message ?? err),
          },
        };
      }
    },
  } as const;
}