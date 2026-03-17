import type {
  RealtimeOutputGuardrailArgs,
  RealtimeOutputGuardrailResult,
} from '@/app/agentConfigs/guardrails';

const VER02_AGENT_NAMES = new Set([
  'leadgenRouterAgent',
  'leadgenSalesAgent',
  'leadgenObjectionAgent',
]);

function extractMessageText(content: any[] = []): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => {
      if (!c || typeof c !== 'object') return '';
      if (c.type === 'input_text') return c.text ?? '';
      if (c.type === 'text') return c.text ?? '';
      if (c.type === 'output_text') return c.text ?? '';
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
    return (
      (c?.type === 'function_call' && (c?.name === toolName || c?.tool_name === toolName)) ||
      (c?.type === 'tool_call' && (c?.name === toolName || c?.tool_name === toolName))
    );
  });
}

function historyHasToolCall(items: any[], toolName: string): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((it) => {
    if (!it) return false;
    if (it.type === 'function_call' && (it.name === toolName || it.tool_name === toolName)) return true;
    if (it.type === 'tool_call' && (it.name === toolName || it.tool_name === toolName)) return true;
    if (it.type === 'function_call_output' && (it.name === toolName || it.tool_name === toolName)) return true;
    if (it.type === 'tool_result' && (it.name === toolName || it.tool_name === toolName)) return true;
    if (it.type === 'message' && it.role === 'assistant' && messageHasToolCall(it, toolName)) return true;
    return false;
  });
}

function normalizeLoose(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\|chat\b|\|endcall\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsForbiddenTransferWording(text: string): boolean {
  const normalized = normalizeLoose(text);
  if (!normalized) return false;
  const forbiddenPhrases = [
    'xin phep chuyen',
    'chuyen anh sang',
    'chuyen chi sang',
    'chuyen may',
    'bo phan ho tro',
    'bo phan khac',
    'tu van vien khac',
    'tong dai vien',
    'nhan vien khac ho tro',
  ];
  return forbiddenPhrases.some((phrase) => normalized.includes(phrase));
}

function containsForbiddenDurationChoice(text: string): boolean {
  const normalized = normalizeLoose(text);
  if (!normalized) return false;
  const forbiddenPhrases = [
    '1 nam hay 2 nam',
    '1 nam hoac 2 nam',
    'gia han 1 nam hay 2 nam',
    'muon gia han 1 nam hay 2 nam',
  ];
  return forbiddenPhrases.some((phrase) => normalized.includes(phrase));
}

function isApprovedPricingBuffer(text: string): boolean {
  const normalized = normalizeLoose(text);
  if (!normalized) return false;
  const approvedPhrases = [
    'anh cho em mot chut de em kiem tra gia nhe',
    'anh cho em mot chut de em tinh phi nhe',
    'anh cho em it giay de em kiem tra gia nhe',
    'anh cho em it giay de em tinh phi nhe',
    'de em kiem tra gia cho anh nhe',
    'de em tinh phi cho anh nhe',
  ];
  return approvedPhrases.some((phrase) => normalized.includes(phrase));
}

function maybeParseJson(value: any): any {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractReplyTextFromValue(value: any): string | null {
  const parsed = maybeParseJson(value);
  if (!parsed || typeof parsed !== 'object') return null;
  const direct = parsed?.prompts?.replyText ?? parsed?.replyText ?? null;
  return typeof direct === 'string' && direct.trim() ? direct.trim() : null;
}

function extractReplyTextFromHistory(items: any[]): string | null {
  if (!Array.isArray(items)) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it) continue;

    const candidates = [
      (it as any).output,
      (it as any).result,
      (it as any).content,
      (it as any).data,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        for (const entry of candidate) {
          const nested = extractReplyTextFromValue(entry?.output ?? entry?.result ?? entry);
          if (nested) return nested;
        }
      } else {
        const nested = extractReplyTextFromValue(candidate);
        if (nested) return nested;
      }
    }
  }
  return null;
}

function extractPolicyActionFromValue(value: any): string | null {
  const parsed = maybeParseJson(value);
  if (!parsed || typeof parsed !== 'object') return null;
  const action = parsed?.policy?.requiredAction ?? null;
  return typeof action === 'string' && action.trim() ? action.trim() : null;
}

function extractPolicyActionFromHistory(items: any[]): string | null {
  if (!Array.isArray(items)) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it) continue;

    const candidates = [
      (it as any).output,
      (it as any).result,
      (it as any).content,
      (it as any).data,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        for (const entry of candidate) {
          const nested = extractPolicyActionFromValue(entry?.output ?? entry?.result ?? entry);
          if (nested) return nested;
        }
      } else {
        const nested = extractPolicyActionFromValue(candidate);
        if (nested) return nested;
      }
    }
  }
  return null;
}

export function createLeadgenVer02EvaluateGuardrail() {
  return {
    name: 'leadgen_ver02_evaluate_required',
    async execute({
      agentOutput,
      agent,
      context,
    }: RealtimeOutputGuardrailArgs): Promise<RealtimeOutputGuardrailResult> {
      try {
        if (!VER02_AGENT_NAMES.has(String(agent?.name ?? ''))) {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        const outputText = String(agentOutput ?? '').trim();
        if (!outputText) {
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        const history: any[] = Array.isArray(context?.history) ? context.history : [];
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

        const normalizedTurnKey = normalizeLoose(lastUserText);
        const guardrailState = ((context as any).__leadgenVer02EvaluateGuardrailState ??= {
          lastTripKey: '',
        });
        const alreadyTrippedThisTurn = guardrailState.lastTripKey === normalizedTurnKey;

        if (containsForbiddenDurationChoice(outputText)) {
          if (alreadyTrippedThisTurn) {
            return {
              tripwireTriggered: false,
              outputInfo: { ok: true, relaxed: 'already_tripped_same_turn' },
            };
          }
          guardrailState.lastTripKey = normalizedTurnKey;
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'leadgen_ver02_default_annual_only',
              corrective:
                'Trong leadgenTNDSVer02, mặc định chỉ báo giá 1 năm. ' +
                'Không được tự hỏi khách "1 năm hay 2 năm" và không được tự mở phương án 2 năm, ' +
                'trừ khi khách chủ động hỏi hoặc đã nêu rõ họ quan tâm phương án 2 năm.',
              lastUserText,
            },
          };
        }

        const after = lastUserIdx >= 0 ? history.slice(lastUserIdx + 1) : history;
        const hasEvaluateCall = historyHasToolCall(after, 'evaluateLeadgenTurn');
        if (!hasEvaluateCall) {
          if (alreadyTrippedThisTurn) {
            return {
              tripwireTriggered: false,
              outputInfo: { ok: true, relaxed: 'already_tripped_same_turn' },
            };
          }
          guardrailState.lastTripKey = normalizedTurnKey;
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'leadgen_ver02_evaluate_required',
              corrective:
                'Trong leadgenTNDSVer02, với mỗi lượt khách mới bạn BẮT BUỘC gọi evaluateLeadgenTurn trước. ' +
                'Sau đó nếu tool có prompts.replyText thì chỉ được trả lời đúng câu đó và kết thúc bằng đúng một tag.',
              lastUserText,
            },
          };
        }

        const policyAction = extractPolicyActionFromHistory(after);
        const replyText = extractReplyTextFromHistory(after);
        const hasCalcTndsFeeCall = historyHasToolCall(after, 'calcTndsFee');
        if (!hasCalcTndsFeeCall && isApprovedPricingBuffer(outputText)) {
          if (alreadyTrippedThisTurn) {
            return {
              tripwireTriggered: false,
              outputInfo: { ok: true, relaxed: 'already_tripped_same_turn' },
            };
          }
          guardrailState.lastTripKey = normalizedTurnKey;
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'leadgen_ver02_pricing_buffer_requires_calc',
              corrective:
                'Không được tự nói câu chờ báo giá nếu chưa thực sự gọi calcTndsFee. ' +
                'Nếu đã đủ slot thì phải gọi calcTndsFee ngay; câu đệm chờ sẽ do UI phát khi tool bắt đầu. ' +
                'Sau khi có kết quả tool, hãy đi thẳng vào câu báo giá.',
              lastUserText,
            },
          };
        }
        if (hasCalcTndsFeeCall && isApprovedPricingBuffer(outputText)) {
          if (alreadyTrippedThisTurn) {
            return {
              tripwireTriggered: false,
              outputInfo: { ok: true, relaxed: 'already_tripped_same_turn' },
            };
          }
          guardrailState.lastTripKey = normalizedTurnKey;
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'leadgen_ver02_pricing_buffer_handled_by_ui',
              corrective:
                'Câu đệm chờ báo giá đã được UI phát ngay khi calcTndsFee bắt đầu. ' +
                'Bạn không cần tự nói lại câu chờ này nữa. Sau khi có kết quả tool, hãy đi thẳng vào câu báo giá hoặc câu trả lời tiếp theo.',
              lastUserText,
            },
          };
        }
        if (!replyText && (policyAction === 'handoff_sales' || policyAction === 'handoff_objection')) {
          if (alreadyTrippedThisTurn) {
            return {
              tripwireTriggered: false,
              outputInfo: { ok: true, relaxed: 'already_tripped_same_turn' },
            };
          }
          guardrailState.lastTripKey = normalizedTurnKey;
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'leadgen_ver02_handoff_without_filler',
              corrective:
                `Tool evaluateLeadgenTurn đã trả policy.requiredAction = "${policyAction}". ` +
                'Trong trường hợp này agent hiện tại không được nói câu đệm chung chung với khách. ' +
                'Chỉ riêng case chuẩn bị báo giá mới được phép dùng một câu đệm ngắn kiểu "Anh chờ em một chút để em kiểm tra giá nhé". ' +
                'Ngoài ra hãy thực hiện SDK handoff ngay cho agent phù hợp; agent nhận handoff sẽ trả lời tiếp nếu cần.',
              lastUserText,
              policyAction,
            },
          };
        }
        if (!replyText) {
          if (containsForbiddenTransferWording(outputText)) {
            if (alreadyTrippedThisTurn) {
              return {
                tripwireTriggered: false,
                outputInfo: { ok: true, relaxed: 'already_tripped_same_turn' },
              };
            }
            guardrailState.lastTripKey = normalizedTurnKey;
            return {
              tripwireTriggered: true,
              outputInfo: {
                reason: 'leadgen_ver02_no_transfer_wording',
                corrective:
                  'Trong leadgenTNDSVer02, SDK handoff chỉ là nội bộ. ' +
                  'Tuyệt đối không được nói với khách là đang chuyển bộ phận, chuyển máy, chuyển tư vấn viên hay nhờ người khác hỗ trợ. ' +
                  'Hãy tiếp tục hội thoại như cùng một tư vấn viên.',
                lastUserText,
              },
            };
          }
          guardrailState.lastTripKey = '';
          return { tripwireTriggered: false, outputInfo: { ok: true } };
        }

        if (normalizeLoose(outputText) !== normalizeLoose(replyText)) {
          if (alreadyTrippedThisTurn) {
            return {
              tripwireTriggered: false,
              outputInfo: { ok: true, relaxed: 'already_tripped_same_turn' },
            };
          }
          guardrailState.lastTripKey = normalizedTurnKey;
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'leadgen_ver02_must_use_reply_text',
              corrective:
                `Tool evaluateLeadgenTurn đã trả prompts.replyText = "${replyText}". ` +
                'Bạn phải trả lời đúng nội dung đó, không thêm bớt, rồi kết thúc bằng đúng một tag phù hợp.',
              lastUserText,
              replyText,
            },
          };
        }

        if (containsForbiddenTransferWording(outputText)) {
          if (alreadyTrippedThisTurn) {
            return {
              tripwireTriggered: false,
              outputInfo: { ok: true, relaxed: 'already_tripped_same_turn' },
            };
          }
          guardrailState.lastTripKey = normalizedTurnKey;
          return {
            tripwireTriggered: true,
            outputInfo: {
              reason: 'leadgen_ver02_no_transfer_wording',
              corrective:
                'Trong leadgenTNDSVer02, SDK handoff chỉ là nội bộ. ' +
                'Tuyệt đối không được nói với khách là đang chuyển bộ phận, chuyển máy, chuyển tư vấn viên hay nhờ người khác hỗ trợ. ' +
                'Hãy tiếp tục hội thoại như cùng một tư vấn viên.',
              lastUserText,
              replyText,
            },
          };
        }

        guardrailState.lastTripKey = '';
        return { tripwireTriggered: false, outputInfo: { ok: true } };
      } catch (err: any) {
        return {
          tripwireTriggered: false,
          outputInfo: {
            error: 'leadgen_ver02_evaluate_guardrail_failed',
            details: String(err?.message ?? err),
          },
        };
      }
    },
  } as const;
}
