import { tool } from '@openai/agents/realtime';

import {
  calculateTndsFee,
  createLeadOrUpdateTool,
  scheduleFollowupTool,
} from '@/app/agentConfigs/leadgenTNDS/tools';
import { appendMemorySummary } from './internal/memoryStore';
import {
  classifyLeadgenVer02Turn,
  type LeadgenVer02TurnIntent,
} from './internal/intentClassifier';
import {
  createDefaultLeadgenVer02Memory,
  createDefaultLeadgenVer02State,
  fetchLeadgenVer02StoredPayload,
  getLeadgenVer02RuntimeContext,
  patchLeadgenVer02StoredPayload,
  setLeadgenVer02RuntimeContext,
  type LeadgenVer02SessionState,
  type LeadgenVer02RuntimeContext,
  type VehicleType,
} from './internal/sessionState';
import { buildPricingQuestionFromMissingSlots, normalizePurposeLabel } from './internal/responsePolicy';
import { nextBucFromIntent } from './internal/stateMachine';
import { decideTurnPolicy } from './internal/turnPolicy';
import { fillTemplate, leadgenVer02Script } from './script/ver02Intents';

type LeadgenStatePatch = Partial<
  Omit<LeadgenVer02SessionState, 'counters' | 'slots' | 'pricing' | 'outcome'>
> & {
  counters?: Partial<LeadgenVer02SessionState['counters']>;
  slots?: Partial<LeadgenVer02SessionState['slots']>;
  pricing?: Partial<LeadgenVer02SessionState['pricing']>;
  outcome?: Partial<LeadgenVer02SessionState['outcome']>;
};

type LeadgenReplyMode =
  | 'opening_confirm'
  | 'identity'
  | 'no_hear'
  | 'noisy_close'
  | 'silence'
  | 'ask_other_car'
  | 'not_using_car'
  | 'already_renewed'
  | 'still_valid'
  | 'company_car'
  | 'company_contact_captured'
  | 'bought_elsewhere'
  | 'ask_family'
  | 'busy_close'
  | 'callback_confirm'
  | 'callback_window_confirm'
  | 'callback_ask'
  | 'wrong_number'
  | 'relative_close'
  | 'refusal_1'
  | 'refusal_2'
  | 'refusal_3'
  | 'confirm_vehicle_info'
  | 'ask_business_usage'
  | 'ask_expiry_date'
  | 'ready_to_quote'
  | 'scam_faq'
  | 'inspection_faq'
  | 'multi_year_faq'
  | 'quote'
  | 'promo'
  | 'price_accepted'
  | 'price_compare'
  | 'price_refusal'
  | 'contact'
  | 'zalo_captured'
  | 'no_zalo'
  | 'confirm_address'
  | 'online_payment';

const DEFAULT_QUOTE_DISCOUNT_PERCENT = 30;

function nonEmpty(value?: string): string | undefined {
  const v = String(value ?? '').trim();
  return v ? v : undefined;
}

function extractCallbackWindow(raw?: string): string | undefined {
  const text = String(raw ?? '').trim();
  if (!text) return undefined;
  const normalized = text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  const patterns: Array<[RegExp, string]> = [
    [/\b(mai|ngay mai)\s+(buoi\s+)?sang\b/, 'sáng mai'],
    [/\b(mai|ngay mai)\s+(buoi\s+)?chieu\b/, 'chiều mai'],
    [/\b(mai|ngay mai)\s+(buoi\s+)?toi\b/, 'tối mai'],
    [/\b(buoi\s+)?sang\b/, 'buổi sáng'],
    [/\b(buoi\s+)?chieu\b/, 'buổi chiều'],
    [/\bbuoi\s+trua\b|\btrua\b/, 'buổi trưa'],
    [/\b(buoi\s+)?toi\b/, 'buổi tối'],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(normalized)) return label;
  }
  return undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function parseBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'co', 'có', 'kinh doanh'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'khong', 'không', 'khong kinh doanh', 'không kinh doanh'].includes(normalized)) return false;
  }
  return undefined;
}

function normalizeGenderValue(raw?: string): string {
  const v = String(raw ?? '')
    .trim()
    .replace(/\//g, ' ')
    .replace(/\s+hoặc\s+/gi, ' ')
    .replace(/\s+/g, ' ');
  const lower = v.toLowerCase();
  if (!v || lower === 'gender' || lower === '{gender}' || /[{}]/.test(v)) {
    return 'Anh/Chị';
  }
  if (['anh', 'a'].includes(lower)) return 'Anh';
  if (['chị', 'chi', 'c'].includes(lower)) return 'Chị';
  if (['anh chị', 'anh chi'].includes(lower)) return 'Anh/Chị';
  return v;
}

function normalizeVehicleType(raw?: string): VehicleType | undefined {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return undefined;
  if (['car', 'xe con', 'oto', 'ô tô', 'xe hoi'].includes(value)) return 'car';
  if (['pickup', 'ban tai', 'bán tải', 'xe ban tai', 'xe bán tải'].includes(value)) return 'pickup';
  if (['truck', 'xe tai', 'xe tải'].includes(value)) return 'truck';
  return undefined;
}

function buildOpeningText(lead: Record<string, any>) {
  return fillTemplate(leadgenVer02Script.openingConfirm, {
    agent_name: nonEmpty(getLeadgenVer02RuntimeContext().displayAgentName) ?? 'Thảo',
    gender: normalizeGenderValue(lead.gender),
  });
}

async function buildResolvedLeadRecord() {
  const runtime = getLeadgenVer02RuntimeContext();
  const payload = await fetchLeadgenVer02StoredPayload();

  let apiLead: Record<string, any> | null = null;
  try {
    const query = new URLSearchParams();
    if (nonEmpty(runtime.leadId)) query.set('leadId', String(runtime.leadId));
    if (nonEmpty(runtime.phoneNumber)) query.set('phoneNumber', String(runtime.phoneNumber));
    const res = await fetch(`/api/leadgen/call-context?${query.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as { lead?: Record<string, any> | null };
      apiLead = data?.lead ?? null;
    }
  } catch {
    apiLead = null;
  }

  const record: Record<string, any> = {
    ...(apiLead ?? {}),
    gender: normalizeGenderValue(runtime.overrideGender ?? payload.state.slots.leadGender ?? apiLead?.gender),
    name: runtime.overrideName ?? payload.state.slots.leadName ?? apiLead?.name ?? apiLead?.fullName,
    fullName: runtime.overrideName ?? payload.state.slots.leadName ?? apiLead?.fullName,
    BKS: runtime.overridePlate ?? payload.state.slots.plateNumber ?? apiLead?.BKS ?? apiLead?.plateNumber,
    plateNumber: runtime.overridePlate ?? payload.state.slots.plateNumber ?? apiLead?.plateNumber ?? apiLead?.BKS,
    vehicleType: runtime.overrideVehicleType ?? payload.state.slots.vehicleType,
    seats: runtime.overrideNumSeats ?? payload.state.slots.numSeats ?? apiLead?.seats,
    isBusiness:
      typeof runtime.overrideIsBusiness === 'boolean'
        ? runtime.overrideIsBusiness
        : typeof payload.state.slots.isBusiness === 'boolean'
          ? payload.state.slots.isBusiness
          : apiLead?.isBusiness,
    weightTons: runtime.overrideWeightTons ?? payload.state.slots.weightTons,
    expiryDate: runtime.overrideExpiryDate ?? payload.state.slots.expiryDate,
  };

  return record;
}

function shallowMergeState(
  state: LeadgenVer02SessionState,
  patch: LeadgenStatePatch,
): LeadgenVer02SessionState {
  return {
    ...state,
    ...patch,
    counters: {
      ...state.counters,
      ...(patch.counters ?? {}),
    },
    slots: {
      ...state.slots,
      ...(patch.slots ?? {}),
    },
    pricing: {
      ...state.pricing,
      ...(patch.pricing ?? {}),
    },
    outcome: {
      ...state.outcome,
      ...(patch.outcome ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
}

function applyRuntimeOverridesToState(
  state: LeadgenVer02SessionState,
): LeadgenVer02SessionState {
  const runtime = getLeadgenVer02RuntimeContext();
  return shallowMergeState(state, {
    sessionId: runtime.sessionId ?? state.sessionId,
    leadId: runtime.leadId ?? state.leadId,
    phoneNumber: runtime.phoneNumber ?? state.phoneNumber,
    slots: {
      leadGender: runtime.overrideGender ?? state.slots.leadGender,
      leadName: runtime.overrideName ?? state.slots.leadName,
      plateNumber: runtime.overridePlate ?? state.slots.plateNumber,
      vehicleType: runtime.overrideVehicleType ?? state.slots.vehicleType,
      numSeats:
        typeof runtime.overrideNumSeats === 'number'
          ? runtime.overrideNumSeats
          : state.slots.numSeats,
      isBusiness:
        typeof runtime.overrideIsBusiness === 'boolean'
          ? runtime.overrideIsBusiness
          : state.slots.isBusiness,
      weightTons:
        typeof runtime.overrideWeightTons === 'number'
          ? runtime.overrideWeightTons
          : state.slots.weightTons,
      expiryDate: runtime.overrideExpiryDate ?? state.slots.expiryDate,
    },
  });
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function stateChanged(
  prevState: LeadgenVer02SessionState,
  nextState: LeadgenVer02SessionState,
): boolean {
  const { updatedAt: prevUpdatedAt, ...prevComparable } = prevState;
  const { updatedAt: nextUpdatedAt, ...nextComparable } = nextState;
  void prevUpdatedAt;
  void nextUpdatedAt;
  return stableSerialize(prevComparable) !== stableSerialize(nextComparable);
}

function formatPlainNumber(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toLocaleString('vi-VN');
}

function buildLeadgenScriptVars(
  state: LeadgenVer02SessionState,
  args?: Record<string, unknown>,
) {
  const runtime = getLeadgenVer02RuntimeContext();
  const gender = normalizeGenderValue(state.slots.leadGender);
  const isMultiYearQuote = state.pricing.quoteVariant === 'multi_year';
  const giftInfo =
    nonEmpty(state.pricing.giftInfo) ??
    (isMultiYearQuote
      ? 'thẻ phạt nguội miễn phí 1 năm và các quà tặng hấp dẫn'
      : 'quà tặng hấp dẫn');
  const address = nonEmpty(state.slots.address) ?? 'địa chỉ mình cung cấp';
  const purpose = nonEmpty(String(args?.purpose ?? '')) ?? normalizePurposeLabel(state);
  const numSeats =
    parsePositiveNumber(args?.numSeats) ??
    parsePositiveNumber(state.slots.numSeats) ??
    undefined;
  const expiryDate =
    nonEmpty(String(args?.expiryDate ?? '')) ??
    nonEmpty(state.slots.expiryDate) ??
    'tháng tới';
  const followupAt =
    nonEmpty(String(args?.followup_at ?? '')) ??
    nonEmpty(String(args?.followupAt ?? '')) ??
    nonEmpty(state.outcome.followupAt) ??
    'lúc phù hợp';
  const discountPercent =
    typeof args?.discountPercent === 'number'
      ? args.discountPercent
      : state.pricing.discountPercent;
  const quoteYears = isMultiYearQuote ? 2 : 1;
  const totalListPrice =
    typeof state.pricing.listPrice === 'number' ? state.pricing.listPrice * quoteYears : undefined;
  const totalDiscountPrice =
    typeof state.pricing.discountPrice === 'number' ? state.pricing.discountPrice * quoteYears : undefined;
  const totalSavings =
    typeof state.pricing.savings === 'number' ? state.pricing.savings * quoteYears : undefined;

  return {
    gender,
    BKS: state.slots.plateNumber ?? 'xe của mình',
    agent_name:
      nonEmpty(runtime.displayAgentName) ??
      nonEmpty(String(args?.displayAgentName ?? '')) ??
      'Thảo',
    num_seats: numSeats ? String(numSeats) : '',
    purpose,
    expiry_date: expiryDate,
    list_price: formatPlainNumber(state.pricing.listPrice),
    discount_price: formatPlainNumber(state.pricing.discountPrice),
    savings: formatPlainNumber(state.pricing.savings),
    total_list_price: formatPlainNumber(totalListPrice),
    total_discount_price: formatPlainNumber(totalDiscountPrice),
    total_savings: formatPlainNumber(totalSavings),
    quote_years: String(quoteYears),
    gifts: giftInfo,
    discount_percent:
      typeof discountPercent === 'number' && Number.isFinite(discountPercent)
        ? String(discountPercent)
        : '',
    address,
    followup_at: followupAt,
  };
}

const replyTemplateMap: Record<Exclude<LeadgenReplyMode, 'no_hear' | 'silence' | 'contact'>, string> = {
  opening_confirm: leadgenVer02Script.openingConfirm,
  identity: leadgenVer02Script.openingIdentity,
  noisy_close: leadgenVer02Script.noisyClose,
  ask_other_car: leadgenVer02Script.askOtherCar,
  not_using_car: leadgenVer02Script.notUsingCar,
  already_renewed: leadgenVer02Script.alreadyRenewed,
  still_valid: leadgenVer02Script.stillValid,
  company_car: leadgenVer02Script.companyCar,
  company_contact_captured: leadgenVer02Script.companyContactCaptured,
  bought_elsewhere: leadgenVer02Script.boughtElsewhere,
  ask_family: leadgenVer02Script.askFamily,
  busy_close: leadgenVer02Script.busyClose,
  callback_confirm: leadgenVer02Script.callbackConfirm,
  callback_window_confirm: leadgenVer02Script.callbackWindowConfirm,
  callback_ask: leadgenVer02Script.callbackAsk,
  wrong_number: leadgenVer02Script.wrongNumberClose,
  relative_close: leadgenVer02Script.relativeClose,
  refusal_1: leadgenVer02Script.refusal1,
  refusal_2: leadgenVer02Script.refusal2,
  refusal_3: leadgenVer02Script.refusal3,
  confirm_vehicle_info: leadgenVer02Script.confirmVehicleInfo,
  ask_business_usage: leadgenVer02Script.askBusinessUsage,
  ask_expiry_date: leadgenVer02Script.askExpiryDate,
  ready_to_quote: leadgenVer02Script.readyToQuote,
  scam_faq: leadgenVer02Script.scamFaq,
  inspection_faq: leadgenVer02Script.inspectionFaq,
  multi_year_faq: leadgenVer02Script.multiYearFaq,
  quote: leadgenVer02Script.quote,
  promo: leadgenVer02Script.promo,
  price_accepted: leadgenVer02Script.priceAccepted,
  price_compare: leadgenVer02Script.priceCompare,
  price_refusal: leadgenVer02Script.priceRefusal,
  zalo_captured: leadgenVer02Script.zaloCaptured,
  no_zalo: leadgenVer02Script.noZalo,
  confirm_address: leadgenVer02Script.confirmAddress,
  online_payment: leadgenVer02Script.onlinePayment,
};

function buildLeadgenReplyText(
  state: LeadgenVer02SessionState,
  mode: LeadgenReplyMode,
  args?: Record<string, unknown>,
): string {
  const vars = buildLeadgenScriptVars(state, args);

  if (mode === 'no_hear') {
    const template = state.counters.noHearCount >= 1 ? leadgenVer02Script.noHear2 : leadgenVer02Script.noHear1;
    return fillTemplate(template, vars);
  }
  if (mode === 'silence') {
    const template = state.counters.silenceCount >= 1 ? leadgenVer02Script.silence2 : leadgenVer02Script.silence1;
    return fillTemplate(template, vars);
  }
  if (mode === 'contact') {
    return fillTemplate(leadgenVer02Script.priceAccepted, vars);
  }
  if (mode === 'callback_window_confirm') {
    return fillTemplate(leadgenVer02Script.callbackWindowConfirm, vars);
  }
  if (mode === 'quote' && state.pricing.quoteVariant === 'multi_year') {
    return fillTemplate(leadgenVer02Script.multiYearQuote, vars);
  }

  return fillTemplate(replyTemplateMap[mode], vars);
}

function resolveObjectionReplyMode(
  state: LeadgenVer02SessionState,
  intent: LeadgenVer02TurnIntent,
  objectionCase: { caseType: string; confidence: number; rationale: string } | null,
  userMessage?: string,
): LeadgenReplyMode | null {
  if (intent.intentId === 'contact_capture' && intent.contactCaptureType === 'accounting_contact') {
    return 'company_contact_captured';
  }
  switch (objectionCase?.caseType) {
    case 'sold_car':
      return 'ask_other_car';
    case 'not_using_car':
      return 'not_using_car';
    case 'already_renewed':
      return 'already_renewed';
    case 'still_valid':
      return 'still_valid';
    case 'company_car':
      return 'company_car';
    case 'bought_elsewhere':
      return 'bought_elsewhere';
    case 'ask_family':
      return 'ask_family';
    case 'busy_or_callback':
      if (intent.busyCallbackType === 'busy_close') return 'busy_close';
      if (extractCallbackWindow(userMessage)) return 'callback_window_confirm';
      return state.counters.callbackRequestCount >= 1 ? 'callback_confirm' : 'callback_ask';
    case 'wrong_number_or_relative':
      return 'relative_close';
    case 'general_refusal': {
      const refusalTurn = state.counters.refusalCount + 1;
      if (refusalTurn >= 3) return 'refusal_3';
      if (refusalTurn === 2) return 'refusal_2';
      return 'refusal_1';
    }
    default:
      if (intent.intentId === 'wrong_number') return 'wrong_number';
      if (intent.intentId === 'busy_callback') {
        if (intent.busyCallbackType === 'busy_close') return 'busy_close';
        if (extractCallbackWindow(userMessage)) return 'callback_window_confirm';
        return state.counters.callbackRequestCount >= 1 ? 'callback_confirm' : 'callback_ask';
      }
      return null;
  }
}

function resolveLeadgenReplyMode(params: {
  agentName: string;
  state: LeadgenVer02SessionState;
  intent: LeadgenVer02TurnIntent;
  objectionCase: { caseType: string; confidence: number; rationale: string } | null;
  userMessage?: string;
}): LeadgenReplyMode | null {
  const { agentName, state, intent, objectionCase, userMessage } = params;

  if (agentName === 'leadgenRouterAgent') {
    if (intent.intentId === 'identity') return 'identity';
    if (intent.intentId === 'pricing_support') {
      switch (intent.supportConcernType) {
        case 'trust_or_scam':
          return 'scam_faq';
        case 'inspection_center':
          return 'inspection_faq';
        case 'multi_year':
          return 'multi_year_faq';
        case 'price_compare':
          return 'price_compare';
        case 'price_too_high':
          return 'price_refusal';
        case 'promo_or_gift':
          return 'promo';
        default:
          return null;
      }
    }
    if (intent.intentId === 'no_hear') {
      return state.counters.noHearCount + 1 >= 3 ? 'noisy_close' : 'no_hear';
    }
    if (intent.intentId === 'silence') {
      return state.counters.silenceCount + 1 >= 3 ? 'noisy_close' : 'silence';
    }
    if (
      intent.intentId === 'objection' ||
      intent.intentId === 'busy_callback' ||
      intent.intentId === 'wrong_number'
    ) {
      return resolveObjectionReplyMode(state, intent, objectionCase, userMessage);
    }
    return null;
  }

  if (agentName === 'leadgenObjectionAgent') {
    return resolveObjectionReplyMode(state, intent, objectionCase, userMessage);
  }

  if (agentName === 'leadgenSalesAgent') {
    if (intent.intentId === 'pricing_support') {
      switch (intent.supportConcernType) {
        case 'trust_or_scam':
          return 'scam_faq';
        case 'inspection_center':
          return 'inspection_faq';
        case 'multi_year':
          return 'multi_year_faq';
        case 'price_compare':
          return 'price_compare';
        case 'price_too_high':
          return 'price_refusal';
        case 'promo_or_gift':
          return 'promo';
        default:
          return null;
      }
    }
    if (intent.intentId === 'pricing_quote' && state.currentBuc === 'BUC_4') {
      return 'quote';
    }
    if (intent.intentId === 'sales_accept' || state.pricing.priceAccepted) {
      return 'price_accepted';
    }
    if (intent.intentId === 'contact_capture') {
      switch (intent.contactCaptureType) {
        case 'zalo_confirmed':
          return 'zalo_captured';
        case 'no_zalo':
          return 'no_zalo';
        case 'address_capture':
          return 'confirm_address';
        case 'online_payment':
          return 'online_payment';
        case 'accounting_contact':
          return 'company_contact_captured';
        default:
          return 'contact';
      }
    }
  }

  return null;
}

export { setLeadgenVer02RuntimeContext };
export type { LeadgenVer02RuntimeContext };

export const getLeadgenVer02ContextTool = tool({
  name: 'getLeadgenVer02Context',
  description: 'Lấy call context cho leadgen TNDS ver02 từ FE và fake lead API.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async () => {
    const record = await buildResolvedLeadRecord();
    const payload = await fetchLeadgenVer02StoredPayload();
    const mergedState = shallowMergeState(payload.state, {
      slots: {
        leadGender: record.gender,
        leadName: record.name ?? record.fullName,
        plateNumber: record.BKS ?? record.plateNumber,
        vehicleType: normalizeVehicleType(record.vehicleType),
        numSeats: parsePositiveNumber(record.seats),
        isBusiness: parseBooleanValue(record.isBusiness),
        weightTons: parsePositiveNumber(record.weightTons),
        expiryDate: nonEmpty(record.expiryDate),
      },
    });
    await patchLeadgenVer02StoredPayload({
      state: mergedState,
    });

    return {
      found: true,
      lead: record,
      openingText: buildOpeningText(record),
      state: mergedState,
    };
  },
});

export const getLeadgenSessionStateTool = tool({
  name: 'getLeadgenSessionState',
  description: 'Đọc state hiện tại của leadgen ver02 từ session store.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async () => {
    return fetchLeadgenVer02StoredPayload();
  },
});

export const updateLeadgenSessionStateTool = tool({
  name: 'updateLeadgenSessionState',
  description: 'Cập nhật state hiện tại của leadgen ver02.',
  parameters: {
    type: 'object',
    properties: {
      currentAgent: { type: 'string' },
      currentBuc: { type: 'string', enum: ['BUC_1', 'BUC_2', 'BUC_3', 'BUC_4', 'BUC_5'] },
      lastIntent: { type: 'string' },
      lastIntentGroup: { type: 'string' },
      nextExpectedAction: { type: 'string' },
      counters: {
        type: 'object',
        properties: {
          noHearCount: { type: 'number' },
          silenceCount: { type: 'number' },
          refusalCount: { type: 'number' },
          clarifyCount: { type: 'number' },
          callbackRequestCount: { type: 'number' },
        },
        additionalProperties: false,
      },
      slots: {
        type: 'object',
        properties: {
          leadGender: { type: 'string' },
          leadName: { type: 'string' },
          plateNumber: { type: 'string' },
          vehicleType: { type: 'string', enum: ['car', 'pickup', 'truck'] },
          numSeats: { type: 'number' },
          isBusiness: { type: 'boolean' },
          purpose: { type: 'string' },
          weightTons: { type: 'number' },
          expiryDate: { type: 'string' },
          zaloNumber: { type: 'string' },
          email: { type: 'string' },
          address: { type: 'string' },
          paymentPreference: { type: 'string', enum: ['cod', 'online'] },
        },
        additionalProperties: false,
      },
      pricing: {
        type: 'object',
        properties: {
          listPrice: { type: 'number' },
          discountPercent: { type: 'number' },
          discountPrice: { type: 'number' },
          savings: { type: 'number' },
          giftInfo: { type: 'string' },
          priceQuoted: { type: 'boolean' },
          priceAccepted: { type: 'boolean' },
          quoteVariant: { type: 'string', enum: ['annual', 'multi_year'] },
        },
        additionalProperties: false,
      },
      outcome: {
        type: 'object',
        properties: {
          callOutcome: { type: 'string' },
          issueType: { type: 'string' },
          reportLabel: { type: 'string' },
          followupAt: { type: 'string' },
          followupReason: { type: 'string' },
          endedAt: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const payload = await fetchLeadgenVer02StoredPayload();
    const nextState = shallowMergeState(payload.state, args as LeadgenStatePatch);
    if (!stateChanged(payload.state, nextState)) {
      return { ok: true, state: payload.state, skipped: true };
    }
    await patchLeadgenVer02StoredPayload({
      state: nextState,
    });
    return { ok: true, state: nextState };
  },
});

export const bumpLeadgenCounterTool = tool({
  name: 'bumpLeadgenCounter',
  description: 'Tăng hoặc reset counter cho leadgen ver02.',
  parameters: {
    type: 'object',
    properties: {
      counter: {
        type: 'string',
        enum: ['noHearCount', 'silenceCount', 'refusalCount', 'clarifyCount', 'callbackRequestCount'],
      },
      amount: { type: 'number' },
      reset: { type: 'boolean' },
    },
    required: ['counter'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const payload = await fetchLeadgenVer02StoredPayload();
    const amount = typeof args?.amount === 'number' ? args.amount : 1;
    const counter = String(args?.counter ?? '') as keyof LeadgenVer02SessionState['counters'];
    const nextValue = args?.reset ? 0 : (payload.state.counters[counter] ?? 0) + amount;
    const nextState = shallowMergeState(payload.state, {
      counters: {
        [counter]: nextValue,
      } as Partial<LeadgenVer02SessionState['counters']>,
    });
    await patchLeadgenVer02StoredPayload({ state: nextState });
    return { ok: true, counters: nextState.counters };
  },
});

export const appendLeadgenMemorySummaryTool = tool({
  name: 'appendLeadgenMemorySummary',
  description: 'Ghi thêm memory summary ngắn cho leadgen ver02.',
  parameters: {
    type: 'object',
    properties: {
      fragment: { type: 'string' },
      updatedBy: { type: 'string' },
      eventType: { type: 'string' },
    },
    required: ['fragment'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const payload = await fetchLeadgenVer02StoredPayload();
    const nextMemory = appendMemorySummary(
      payload.memory ?? createDefaultLeadgenVer02Memory(),
      String(args?.fragment ?? ''),
      String(args?.updatedBy ?? 'leadgen-agent'),
    );
    const nextEvents = [
      ...(payload.events ?? []),
      {
        at: new Date().toISOString(),
        type: String(args?.eventType ?? 'memory_append'),
        payload: { fragment: String(args?.fragment ?? '') },
      },
    ];
    await patchLeadgenVer02StoredPayload({
      memory: nextMemory,
      events: nextEvents,
    });
    return { ok: true, memory: nextMemory };
  },
});

export const markLeadgenOutcomeTool = tool({
  name: 'markLeadgenOutcome',
  description: 'Đánh dấu outcome cuối của cuộc gọi leadgen ver02.',
  parameters: {
    type: 'object',
    properties: {
      callOutcome: { type: 'string' },
      issueType: { type: 'string' },
      reportLabel: { type: 'string' },
      followupAt: { type: 'string' },
      followupReason: { type: 'string' },
    },
    required: ['callOutcome'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const payload = await fetchLeadgenVer02StoredPayload();
    const nextState = shallowMergeState(payload.state, {
      outcome: {
        callOutcome: String(args.callOutcome),
        issueType: nonEmpty(args.issueType),
        reportLabel: nonEmpty(args.reportLabel),
        followupAt: nonEmpty(args.followupAt),
        followupReason: nonEmpty(args.followupReason),
        endedAt: new Date().toISOString(),
      },
    });
    await patchLeadgenVer02StoredPayload({ state: nextState });
    return { ok: true, outcome: nextState.outcome };
  },
});

export const evaluateLeadgenTurnTool = tool({
  name: 'evaluateLeadgenTurn',
  description: 'Phân loại lượt khách hiện tại và trả policy nội bộ cho leadgen ver02.',
  parameters: {
    type: 'object',
    properties: {
      userMessage: { type: 'string' },
      agentName: { type: 'string' },
    },
    required: ['userMessage', 'agentName'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const userMessage = String(args?.userMessage ?? '').trim();
    const agentName = String(args?.agentName ?? '').trim() || 'leadgenRouterAgent';
    const payload = await fetchLeadgenVer02StoredPayload();
    const baseState = payload.state ?? createDefaultLeadgenVer02State(agentName);
    const state = applyRuntimeOverridesToState(baseState);
    const intent = await classifyLeadgenVer02Turn(userMessage, {
      agentName,
      currentBuc: state.currentBuc,
    });
    const objectionCase =
      intent.objectionCaseType
        ? {
            caseType: intent.objectionCaseType,
            confidence: intent.objectionCaseConfidence ?? intent.confidence,
            rationale: intent.rationale,
          }
        : null;
    const policy = decideTurnPolicy(agentName, state, intent);
    const nextState = shallowMergeState(state, {
      currentAgent: agentName,
      currentBuc: policy.nextBuc ?? nextBucFromIntent(intent.intentId),
      lastIntent: intent.intentId,
      lastIntentGroup: intent.intentGroup,
      nextExpectedAction: policy.requiredAction,
      pricing: {
        quoteVariant:
          intent.supportConcernType === 'multi_year'
            ? 'multi_year'
            : (state.pricing.quoteVariant ?? 'annual'),
      },
    });
    const replyMode = resolveLeadgenReplyMode({
      agentName,
      state,
      intent,
      objectionCase,
      userMessage,
    });
    const replyArgs: Record<string, unknown> = {
      ...(args as Record<string, unknown>),
    };
    if (replyMode === 'callback_window_confirm') {
      replyArgs.followupAt = extractCallbackWindow(userMessage);
    }
    const replyText = replyMode ? buildLeadgenReplyText(nextState, replyMode, replyArgs) : null;
    const missingSlotPrompt = fillTemplate(
      buildPricingQuestionFromMissingSlots(policy.missingSlots),
      buildLeadgenScriptVars(nextState, args as Record<string, unknown>),
    );

    await patchLeadgenVer02StoredPayload({ state: nextState });

    return {
      ok: true,
      intent,
      objectionCase,
      policy,
      state: nextState,
      prompts: {
        missingSlotPrompt,
        replyMode,
        replyText,
      },
    };
  },
});

export const buildLeadgenReplyHintTool = tool({
  name: 'buildLeadgenReplyHint',
  description: 'Sinh gợi ý thoại ngắn theo state hiện tại cho leadgen ver02.',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: Object.keys({
          opening_confirm: true,
          identity: true,
          no_hear: true,
          noisy_close: true,
          silence: true,
          ask_other_car: true,
          not_using_car: true,
          already_renewed: true,
          still_valid: true,
          company_car: true,
          company_contact_captured: true,
          bought_elsewhere: true,
          ask_family: true,
          busy_close: true,
          callback_confirm: true,
          callback_window_confirm: true,
          callback_ask: true,
          wrong_number: true,
          relative_close: true,
          refusal_1: true,
          refusal_2: true,
          refusal_3: true,
          confirm_vehicle_info: true,
          ask_business_usage: true,
          ask_expiry_date: true,
          ready_to_quote: true,
          scam_faq: true,
          inspection_faq: true,
          multi_year_faq: true,
          quote: true,
          promo: true,
          price_accepted: true,
          price_compare: true,
          price_refusal: true,
          contact: true,
          zalo_captured: true,
          no_zalo: true,
          confirm_address: true,
          online_payment: true,
        }),
      },
      discountPercent: { type: 'number' },
      agentName: { type: 'string' },
      purpose: { type: 'string' },
      numSeats: { type: 'number' },
      expiryDate: { type: 'string' },
    },
    required: ['mode'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const payload = await fetchLeadgenVer02StoredPayload();
    const state = payload.state;
    return {
      ok: true,
      text: buildLeadgenReplyText(state, args.mode as LeadgenReplyMode, args ?? {}),
    };
  },
});

export const calcTndsFeeTool = tool({
  name: 'calcTndsFee',
  description:
    'Tinh phi BH TNDS cho leadgen ver02, dong thoi luu ket qua gia vao session state de bao gia ngay.',
  parameters: {
    type: 'object',
    properties: {
      vehicleType: {
        type: 'string',
        enum: ['car', 'pickup', 'truck'],
      },
      seats: { type: 'number' },
      isBusiness: { type: 'boolean' },
      weightTons: { type: 'number' },
      isTractor: { type: 'boolean' },
      discountPercent: { type: 'number', enum: [20, 25, 30, 35, 40] },
      durationYears: { type: 'number' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const payload = await fetchLeadgenVer02StoredPayload();
    const state = applyRuntimeOverridesToState(payload.state ?? createDefaultLeadgenVer02State());
    const resolvedDurationYears =
      typeof args?.durationYears === 'number' && Number.isFinite(args.durationYears) && args.durationYears > 0
        ? Math.floor(args.durationYears)
        : state.pricing.quoteVariant === 'multi_year'
          ? 2
          : 1;
    const resolvedDiscountPercent =
      typeof args?.discountPercent === 'number'
        ? args.discountPercent
        : state.pricing.discountPercent ?? DEFAULT_QUOTE_DISCOUNT_PERCENT;

    const resolvedArgs = {
      ...args,
      vehicleType: args?.vehicleType ?? state.slots.vehicleType,
      seats:
        typeof args?.seats === 'number'
          ? args.seats
          : parsePositiveNumber(state.slots.numSeats),
      isBusiness:
        typeof args?.isBusiness === 'boolean'
          ? args.isBusiness
          : state.slots.isBusiness,
      weightTons:
        typeof args?.weightTons === 'number'
          ? args.weightTons
          : parsePositiveNumber(state.slots.weightTons),
      discountPercent: resolvedDiscountPercent,
      durationYears: resolvedDurationYears,
    };

    const result = calculateTndsFee(resolvedArgs as {
      vehicleType: 'car' | 'pickup' | 'truck';
      seats?: number;
      isBusiness?: boolean;
      weightTons?: number;
      isTractor?: boolean;
      discountPercent?: 20 | 25 | 30 | 35 | 40;
      durationYears?: number;
    });
    if (!result?.ok) {
      return {
        ...result,
        usedArgs: resolvedArgs,
      };
    }

    const annualListPrice =
      typeof result?.price?.total === 'number' && Number.isFinite(result.price.total)
        ? result.price.total
        : undefined;
    const annualDiscountPrice =
      typeof result?.discountedTotal === 'number' && Number.isFinite(result.discountedTotal)
        ? result.discountedTotal
        : undefined;
    const annualSavings =
      typeof annualListPrice === 'number' && typeof annualDiscountPrice === 'number'
        ? annualListPrice - annualDiscountPrice
        : undefined;

    const nextState = shallowMergeState(state, {
      pricing: {
        listPrice: annualListPrice,
        discountPercent: resolvedDiscountPercent,
        discountPrice: annualDiscountPrice,
        savings: annualSavings,
        priceQuoted: true,
        quoteVariant: resolvedDurationYears > 1 ? 'multi_year' : 'annual',
      },
    });
    await patchLeadgenVer02StoredPayload({ state: nextState });

    return {
      ...result,
      usedArgs: resolvedArgs,
      pricingState: nextState.pricing,
      replyText: buildLeadgenReplyText(nextState, 'quote', {
        discountPercent: resolvedDiscountPercent,
        numSeats: resolvedArgs.seats,
        expiryDate: state.slots.expiryDate,
      }),
    };
  },
});

export const sharedLeadgenVer02Tools = {
  calcTndsFeeTool,
  createLeadOrUpdateTool,
  scheduleFollowupTool,
};
