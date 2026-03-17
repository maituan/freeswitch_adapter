import { tool } from '@openai/agents/realtime';

import {
  createDefaultLeadgenV1State,
  getLeadgenV1RuntimeContext,
  getLeadgenV1State,
  patchLeadgenV1State,
  setLeadgenV1RuntimeContext,
} from './internal/sessionState';
import { fillTemplate, leadgenV1Script } from './script/intents';

function normalizeGender(raw?: string): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'Anh';
  if (v === 'anh') return 'Anh';
  if (v === 'chi' || v === 'chị') return 'Chị';
  return raw?.trim() || 'Anh';
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toLocaleString('vi-VN');
}

const DAY_WORDS: Record<number, string> = {
  1: 'một',
  2: 'hai',
  3: 'ba',
  4: 'bốn',
  5: 'năm',
  6: 'sáu',
  7: 'bảy',
  8: 'tám',
  9: 'chín',
  10: 'mười',
  11: 'mười một',
  12: 'mười hai',
  13: 'mười ba',
  14: 'mười bốn',
  15: 'mười lăm',
  16: 'mười sáu',
  17: 'mười bảy',
  18: 'mười tám',
  19: 'mười chín',
  20: 'hai mươi',
  21: 'hai mươi mốt',
  22: 'hai mươi hai',
  23: 'hai mươi ba',
  24: 'hai mươi bốn',
  25: 'hai mươi lăm',
  26: 'hai mươi sáu',
  27: 'hai mươi bảy',
  28: 'hai mươi tám',
  29: 'hai mươi chín',
  30: 'ba mươi',
  31: 'ba mươi mốt',
};

function formatExpiryDateForSpeech(raw?: string): string {
  const fallback = 'ngày mười lăm tháng 5 năm 2026';
  const value = String(raw ?? '').trim();
  if (!value) return fallback;

  const ddmmyyyy = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  const yyyymmdd = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let day: number | undefined;
  let month: number | undefined;
  let year: string | undefined;

  if (ddmmyyyy) {
    day = Number(ddmmyyyy[1]);
    month = Number(ddmmyyyy[2]);
    year = ddmmyyyy[3];
  } else if (yyyymmdd) {
    day = Number(yyyymmdd[3]);
    month = Number(yyyymmdd[2]);
    year = yyyymmdd[1];
  }

  if (day && month && year && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
    return `ngày ${DAY_WORDS[day]} tháng ${month} năm ${year}`;
  }

  // Nếu đã là chuỗi tự nhiên thì giữ nguyên, chỉ tránh fallback về dạng số có "/".
  return value.includes('/') ? fallback : value;
}

function buildVars() {
  const state = getLeadgenV1State();
  const runtime = getLeadgenV1RuntimeContext();
  const gender = normalizeGender(state.slots.leadGender);
  return {
    gender,
    agent_name: runtime.displayAgentName ?? 'Thảo',
    BKS: state.slots.plateNumber ?? '29A-12345',
    brand: state.slots.brand ?? 'Toyota',
    color: state.slots.color ?? 'trắng',
    phone_number: runtime.phoneNumber ?? '0912345678',
    num_seats: String(state.slots.numSeats ?? ''),
    purpose:
      typeof state.slots.isBusiness === 'boolean'
        ? (state.slots.isBusiness ? 'kinh doanh' : 'không kinh doanh')
        : (state.slots.purpose ?? 'cá nhân'),
    expiry_date: formatExpiryDateForSpeech(state.slots.expiryDate ?? ''),
    list_price: formatNumber(state.pricing.listPrice),
    discount_price: formatNumber(state.pricing.discountPrice),
    savings: formatNumber(state.pricing.savings),
    gifts: state.pricing.giftInfo ?? 'thẻ phạt nguội miễn phí 1 năm và quà tặng',
    discount_percent: String(state.pricing.discountPercent ?? 30),
    address: state.slots.address ?? 'địa chỉ mình cung cấp',
  };
}

export { setLeadgenV1RuntimeContext };

export const getLeadgenV1ContextTool = tool({
  name: 'getLeadgenV1Context',
  description: 'Lấy context mở đầu cho leadgenV1 từ runtime FE.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async () => {
    const state = getLeadgenV1State();
    return {
      ok: true,
      openingText: fillTemplate(leadgenV1Script.opening, buildVars()),
      state,
      runtime: getLeadgenV1RuntimeContext(),
    };
  },
});

export const updateLeadgenSessionStateTool = tool({
  name: 'updateLeadgenSessionState',
  description: 'Cập nhật state cuộc gọi cho leadgenV1.',
  parameters: {
    type: 'object',
    properties: {
      currentBuc: { type: 'string', enum: ['BUC_1', 'BUC_2', 'BUC_3', 'BUC_4', 'BUC_5'] },
      counters: { type: 'object', additionalProperties: true },
      slots: { type: 'object', additionalProperties: true },
      pricing: { type: 'object', additionalProperties: true },
      outcome: { type: 'object', additionalProperties: true },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const nextState = patchLeadgenV1State(args ?? {});
    return { ok: true, state: nextState };
  },
});

export const calcTndsFeeTool = tool({
  name: 'calcTndsFee',
  description: 'Tính phí TNDS cơ bản cho leadgenV1.',
  parameters: {
    type: 'object',
    properties: {
      discountPercent: { type: 'number' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const state = getLeadgenV1State();
    const slots = state.slots;
    const discountPercent = typeof args?.discountPercent === 'number' ? args.discountPercent : 30;

    let listPrice = 480000;
    if (slots.vehicleType === 'pickup') listPrice = 1026000;
    if (slots.vehicleType === 'truck') {
      const tons = typeof slots.weightTons === 'number' ? slots.weightTons : 1;
      listPrice = 900000 + Math.round(tons * 150000);
    }
    if (slots.vehicleType === 'car' && typeof slots.numSeats === 'number') {
      if (slots.numSeats > 5 && slots.numSeats <= 11) listPrice = 870000;
      if (slots.numSeats > 11 && slots.numSeats <= 24) listPrice = 1330000;
      if (slots.numSeats > 24) listPrice = 1825000;
    }

    const discountPrice = Math.round((listPrice * (100 - discountPercent)) / 100);
    const savings = listPrice - discountPrice;
    const nextState = patchLeadgenV1State({
      pricing: {
        listPrice,
        discountPercent,
        discountPrice,
        savings,
        giftInfo: 'thẻ phạt nguội miễn phí 1 năm và quà tặng',
        priceQuoted: true,
        priceAccepted: state.pricing.priceAccepted ?? false,
      },
      currentBuc: 'BUC_4',
    });

    return {
      ok: true,
      pricing: nextState.pricing,
      replyText: fillTemplate(leadgenV1Script.quote, buildVars()),
    };
  },
});

export const markLeadgenOutcomeTool = tool({
  name: 'markLeadgenOutcome',
  description: 'Đánh dấu outcome cuộc gọi leadgenV1.',
  parameters: {
    type: 'object',
    properties: {
      report: { type: 'string' },
      issueType: { type: 'string' },
      level: { type: 'number' },
      callOutcome: { type: 'string' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const nextState = patchLeadgenV1State({
      outcome: {
        report: String(args?.report ?? ''),
        issueType: String(args?.issueType ?? ''),
        level: typeof args?.level === 'number' ? args.level : undefined,
        callOutcome: String(args?.callOutcome ?? ''),
        endedAt: new Date().toISOString(),
      },
    });
    return { ok: true, outcome: nextState.outcome };
  },
});

export const createLeadOrUpdateTool = tool({
  name: 'createLeadOrUpdate',
  description: 'Tool đơn giản để ghi nhận lead đã chốt/quan tâm.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      note: { type: 'string' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    return {
      ok: true,
      message: 'Lead đã được ghi nhận tạm thời ở local runtime.',
      payload: {
        status: String(args?.status ?? 'interested'),
        note: String(args?.note ?? ''),
      },
    };
  },
});

export const scheduleFollowupTool = tool({
  name: 'scheduleFollowup',
  description: 'Tool đơn giản để lưu lịch follow-up.',
  parameters: {
    type: 'object',
    properties: {
      followupAt: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['followupAt'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    patchLeadgenV1State({
      outcome: {
        report: 'Lên lịch gọi lại',
        issueType: 'Action',
        level: 2,
      },
    });
    return {
      ok: true,
      followupAt: String(args?.followupAt ?? ''),
      reason: String(args?.reason ?? ''),
    };
  },
});

export const leadgenV1Tools = [
  getLeadgenV1ContextTool,
  updateLeadgenSessionStateTool,
  calcTndsFeeTool,
  markLeadgenOutcomeTool,
  createLeadOrUpdateTool,
  scheduleFollowupTool,
];

export function resetLeadgenV1LocalState() {
  patchLeadgenV1State(createDefaultLeadgenV1State());
}
/*
import { tool } from '@openai/agents/realtime';

import { classifyLeadgenV1Turn } from './internal/intentClassifier';
import {
  createDefaultLeadgenV1State,
  getLeadgenV1RuntimeContext,
  getLeadgenV1State,
  patchLeadgenV1State,
  setLeadgenV1RuntimeContext,
} from './internal/sessionState';
import { decideLeadgenV1Policy, getMissingPricingSlots } from './internal/turnPolicy';
import { fillTemplate, leadgenV1Script } from './script/intents';

function normalizeGender(raw?: string): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'Anh/Chị';
  if (v === 'anh') return 'Anh';
  if (v === 'chi' || v === 'chị') return 'Chị';
  return raw?.trim() || 'Anh/Chị';
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toLocaleString('vi-VN');
}

function parseSeatsFromMessage(message: string): number | undefined {
  const m = message.match(/(\d+)\s*cho/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseBusinessFromMessage(message: string): boolean | undefined {
  const txt = message.toLowerCase();
  if (txt.includes('khong kinh doanh') || txt.includes('không kinh doanh') || txt.includes('dung ca nhan')) {
    return false;
  }
  if (txt.includes('kinh doanh')) {
    return true;
  }
  return undefined;
}

function parseExpiryFromMessage(message: string): string | undefined {
  const txt = message.trim();
  if (!txt) return undefined;
  if (!/(ngay|ngày|thang|tháng|\d{1,2}\/\d{1,2})/i.test(txt)) return undefined;
  return txt;
}

function buildVars() {
  const state = getLeadgenV1State();
  const runtime = getLeadgenV1RuntimeContext();
  const gender = normalizeGender(state.slots.leadGender);
  return {
    gender,
    agent_name: runtime.displayAgentName ?? 'Thảo',
    BKS: state.slots.plateNumber ?? 'xe của mình',
    num_seats: state.slots.numSeats ? String(state.slots.numSeats) + ' chỗ' : '',
    purpose:
      typeof state.slots.isBusiness === 'boolean'
        ? (state.slots.isBusiness ? 'kinh doanh' : 'không kinh doanh')
        : (state.slots.purpose ?? 'chưa rõ mục đích sử dụng'),
    expiry_date: state.slots.expiryDate ?? 'tháng tới',
    list_price: formatNumber(state.pricing.listPrice),
    discount_price: formatNumber(state.pricing.discountPrice),
    savings: formatNumber(state.pricing.savings),
    gifts: state.pricing.giftInfo ?? 'thẻ phạt nguội miễn phí 1 năm và quà tặng',
    discount_percent: String(state.pricing.discountPercent ?? 30),
    address: state.slots.address ?? 'địa chỉ mình cung cấp',
  };
}

function resolveTemplate(mode: string): string {
  switch (mode) {
    case 'identity':
      return leadgenV1Script.identity;
    case 'no_hear': {
      const state = getLeadgenV1State();
      return state.counters.noHearCount >= 2 ? leadgenV1Script.noHear2 : leadgenV1Script.noHear1;
    }
    case 'noisy_close':
      return leadgenV1Script.noisyClose;
    case 'silence': {
      const state = getLeadgenV1State();
      return state.counters.silenceCount >= 2 ? leadgenV1Script.silence2 : leadgenV1Script.silence1;
    }
    case 'ask_other_car':
      return leadgenV1Script.askOtherCar;
    case 'not_using_car':
      return leadgenV1Script.notUsingCar;
    case 'already_renewed':
      return leadgenV1Script.alreadyRenewed;
    case 'still_valid':
      return leadgenV1Script.stillValid;
    case 'company_car':
      return leadgenV1Script.companyCar;
    case 'bought_elsewhere':
      return leadgenV1Script.boughtElsewhere;
    case 'ask_family':
      return leadgenV1Script.askFamily;
    case 'busy_close':
      return leadgenV1Script.busyClose;
    case 'callback_ask':
      return leadgenV1Script.callbackAsk;
    case 'callback_confirm':
      return leadgenV1Script.callbackConfirm;
    case 'wrong_number':
      return leadgenV1Script.wrongNumber;
    case 'relative_close':
      return leadgenV1Script.relativeClose;
    case 'refusal_1':
      return leadgenV1Script.refusal1;
    case 'refusal_2':
      return leadgenV1Script.refusal2;
    case 'refusal_3':
      return leadgenV1Script.refusal3;
    case 'confirm_vehicle':
      return leadgenV1Script.confirmVehicle;
    case 'ask_business':
      return leadgenV1Script.askBusiness;
    case 'ask_expiry':
      return leadgenV1Script.askExpiry;
    case 'ready_quote':
      return leadgenV1Script.readyQuote;
    case 'expiry_unknown':
      return leadgenV1Script.expiryUnknown;
    case 'scam_faq':
      return leadgenV1Script.scamFaq;
    case 'inspection_faq':
      return leadgenV1Script.inspectionFaq;
    case 'multi_year_faq':
      return leadgenV1Script.multiYearFaq;
    case 'quote':
      return leadgenV1Script.quote;
    case 'promo':
      return leadgenV1Script.promo;
    case 'price_accepted':
      return leadgenV1Script.priceAccepted;
    case 'price_compare':
      return leadgenV1Script.priceCompare;
    case 'price_refusal':
      return leadgenV1Script.priceRefusal;
    case 'zalo_captured':
      return leadgenV1Script.zaloCaptured;
    case 'no_zalo':
      return leadgenV1Script.noZalo;
    case 'confirm_address':
      return leadgenV1Script.confirmAddress;
    case 'online_payment':
      return leadgenV1Script.onlinePayment;
    default:
      return leadgenV1Script.opening;
  }
}

export { setLeadgenV1RuntimeContext };

export const getLeadgenV1ContextTool = tool({
  name: 'getLeadgenV1Context',
  description: 'Lấy context mở đầu cho leadgenV1 từ runtime FE.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async () => {
    const state = getLeadgenV1State();
    const openingText = fillTemplate(leadgenV1Script.opening, buildVars());
    return {
      ok: true,
      openingText,
      state,
      runtime: getLeadgenV1RuntimeContext(),
    };
  },
});

export const updateLeadgenSessionStateTool = tool({
  name: 'updateLeadgenSessionState',
  description: 'Cập nhật state cuộc gọi cho leadgenV1.',
  parameters: {
    type: 'object',
    properties: {
      currentBuc: { type: 'string', enum: ['BUC_1', 'BUC_2', 'BUC_3', 'BUC_4', 'BUC_5'] },
      slots: { type: 'object', additionalProperties: true },
      counters: { type: 'object', additionalProperties: true },
      pricing: { type: 'object', additionalProperties: true },
      outcome: { type: 'object', additionalProperties: true },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const nextState = patchLeadgenV1State(args ?? {});
    return { ok: true, state: nextState };
  },
});

export const markLeadgenOutcomeTool = tool({
  name: 'markLeadgenOutcome',
  description: 'Đánh dấu outcome cuộc gọi leadgenV1.',
  parameters: {
    type: 'object',
    properties: {
      report: { type: 'string' },
      issueType: { type: 'string' },
      level: { type: 'number' },
      callOutcome: { type: 'string' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const nextState = patchLeadgenV1State({
      outcome: {
        report: String(args?.report ?? ''),
        issueType: String(args?.issueType ?? ''),
        level: typeof args?.level === 'number' ? args.level : undefined,
        callOutcome: String(args?.callOutcome ?? ''),
        endedAt: new Date().toISOString(),
      },
    });
    return { ok: true, outcome: nextState.outcome };
  },
});

export const evaluateLeadgenTurnTool = tool({
  name: 'evaluateLeadgenTurn',
  description: 'Đánh giá lượt khách cho leadgenV1 và trả policy + reply.',
  parameters: {
    type: 'object',
    properties: {
      userMessage: { type: 'string' },
    },
    required: ['userMessage'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const userMessage = String(args?.userMessage ?? '').trim();
    if (!userMessage) {
      const state = getLeadgenV1State();
      return { ok: true, state, prompts: { replyText: fillTemplate(leadgenV1Script.opening, buildVars()) } };
    }

    const state = getLeadgenV1State();
    const intent = await classifyLeadgenV1Turn(userMessage);

    const patch: any = {};
    if (intent.intentId === 'no_hear') {
      patch.counters = { noHearCount: state.counters.noHearCount + 1, silenceCount: 0 };
    } else if (intent.intentId === 'silence' || intent.intentId === 'unclear') {
      patch.counters = { silenceCount: state.counters.silenceCount + 1 };
    } else if (intent.intentId === 'objection' && intent.objectionCaseType === 'general_refusal') {
      patch.counters = { refusalCount: state.counters.refusalCount + 1 };
    } else {
      patch.counters = { noHearCount: 0, silenceCount: 0 };
    }

    const seatValue = parseSeatsFromMessage(userMessage);
    const isBusiness = parseBusinessFromMessage(userMessage);
    const expiryDate = parseExpiryFromMessage(userMessage);
    const slotsPatch: Record<string, unknown> = {};
    if (seatValue) slotsPatch.numSeats = seatValue;
    if (typeof isBusiness === 'boolean') {
      slotsPatch.isBusiness = isBusiness;
      slotsPatch.purpose = isBusiness ? 'kinh doanh' : 'không kinh doanh';
    }
    if (expiryDate && intent.intentId === 'vehicle_info') slotsPatch.expiryDate = expiryDate;
    if (intent.contactCaptureType === 'zalo_confirmed') slotsPatch.zaloNumber = getLeadgenV1RuntimeContext().phoneNumber ?? '';
    if (intent.contactCaptureType === 'address_capture') slotsPatch.address = userMessage;
    if (intent.contactCaptureType === 'online_payment') slotsPatch.paymentPreference = 'online';
    if (Object.keys(slotsPatch).length) patch.slots = slotsPatch;

    const patchedState = patchLeadgenV1State(patch);
    const policy = decideLeadgenV1Policy(patchedState, intent);

    const missingSlots = getMissingPricingSlots(patchedState);
    if (policy.replyMode === 'quote' && missingSlots.length > 0) {
      policy.replyMode = missingSlots.includes('numSeats')
        ? 'confirm_vehicle'
        : missingSlots.includes('isBusiness')
          ? 'ask_business'
          : 'ask_expiry';
      policy.nextBuc = 'BUC_3';
      policy.report = 'Khai thác thông tin';
      policy.level = 3;
    }

    const nextState = patchLeadgenV1State({
      currentBuc: policy.nextBuc,
      outcome: {
        report: policy.report,
        issueType: policy.issueType,
        level: policy.level,
      },
    });

    const replyText = fillTemplate(resolveTemplate(policy.replyMode), buildVars());

    return {
      ok: true,
      intent,
      policy,
      state: nextState,
      prompts: {
        replyText,
        shouldEndCall: Boolean(policy.endCall),
      },
      report: policy.report,
      issueType: policy.issueType,
      level: policy.level,
    };
  },
});

export const calcTndsFeeTool = tool({
  name: 'calcTndsFee',
  description: 'Tính phí TNDS cơ bản cho leadgenV1.',
  parameters: {
    type: 'object',
    properties: {
      discountPercent: { type: 'number' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const state = getLeadgenV1State();
    const slots = state.slots;
    const discountPercent = typeof args?.discountPercent === 'number' ? args.discountPercent : 30;

    let listPrice = 480000;
    if (slots.vehicleType === 'pickup') listPrice = 1026000;
    if (slots.vehicleType === 'truck') {
      const tons = typeof slots.weightTons === 'number' ? slots.weightTons : 1;
      listPrice = 900000 + Math.round(tons * 150000);
    }
    if (slots.vehicleType === 'car' && typeof slots.numSeats === 'number') {
      if (slots.numSeats > 5 && slots.numSeats <= 11) listPrice = 870000;
      if (slots.numSeats > 11 && slots.numSeats <= 24) listPrice = 1330000;
      if (slots.numSeats > 24) listPrice = 1825000;
    }

    const discountPrice = Math.round((listPrice * (100 - discountPercent)) / 100);
    const savings = listPrice - discountPrice;

    const nextState = patchLeadgenV1State({
      pricing: {
        listPrice,
        discountPercent,
        discountPrice,
        savings,
        giftInfo: 'thẻ phạt nguội miễn phí 1 năm và quà tặng',
        priceQuoted: true,
      },
      currentBuc: 'BUC_4',
    });

    const replyText = fillTemplate(leadgenV1Script.quote, buildVars());
    return {
      ok: true,
      pricing: nextState.pricing,
      replyText,
    };
  },
});

export const createLeadOrUpdateTool = tool({
  name: 'createLeadOrUpdate',
  description: 'Tool đơn giản để ghi nhận lead đã chốt/quan tâm.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      note: { type: 'string' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    return {
      ok: true,
      message: 'Lead đã được ghi nhận tạm thời ở local runtime.',
      payload: {
        status: String(args?.status ?? 'interested'),
        note: String(args?.note ?? ''),
      },
    };
  },
});

export const scheduleFollowupTool = tool({
  name: 'scheduleFollowup',
  description: 'Tool đơn giản để lưu lịch follow-up.',
  parameters: {
    type: 'object',
    properties: {
      followupAt: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['followupAt'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    patchLeadgenV1State({
      outcome: {
        report: 'Lên lịch gọi lại',
        issueType: 'Action',
        level: 2,
      },
    });
    return {
      ok: true,
      followupAt: String(args?.followupAt ?? ''),
      reason: String(args?.reason ?? ''),
    };
  },
});

export const leadgenV1Tools = [
  getLeadgenV1ContextTool,
  evaluateLeadgenTurnTool,
  updateLeadgenSessionStateTool,
  calcTndsFeeTool,
  markLeadgenOutcomeTool,
  createLeadOrUpdateTool,
  scheduleFollowupTool,
];

export function resetLeadgenV1LocalState() {
  patchLeadgenV1State(createDefaultLeadgenV1State());
}
*/
