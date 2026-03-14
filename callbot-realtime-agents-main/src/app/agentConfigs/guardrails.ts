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
- fallback: off-topic, explicit refusal, cannot continue
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
        const asksIdentityOrLocation = classified.intent?.requiredAction === 'handoff_faq';
        const asksPricing = classified.intent?.requiredAction === 'handoff_pricing';
        const asksFallback = classified.intent?.requiredAction === 'handoff_fallback';

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