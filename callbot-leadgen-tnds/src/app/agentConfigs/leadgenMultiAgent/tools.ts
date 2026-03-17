import { tool } from '@openai/agents/realtime';
import { calculateTndsFee } from './pricingEngine';
import type { DiscountRate } from './pricingData';
import {
  getLeadgenMultiAgentState,
  patchLeadgenMultiAgentState,
  getLeadgenMultiAgentRuntimeContext,
  type LeadgenMultiAgentSessionState,
  type VehicleType,
} from './internal/sessionState';

const ALLOWED_DISCOUNT_RATES: DiscountRate[] = [20, 25, 30, 35, 40];

type CalcTndsFeeArgs = {
  vehicleType?: VehicleType;
  seats?: number;
  numSeats?: number;
  isBusiness?: boolean;
  weightTons?: number;
  discountPercent?: number;
};

function nonEmpty(value?: string): string | undefined {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  return undefined;
}

function resolveDiscountPercent(value: unknown, fallback?: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100) {
    return value;
  }

  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0 && fallback < 100) {
    return fallback;
  }

  return 10;
}

function normalizeGenderValue(raw?: string): string {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return 'Anh';
  if (value === 'anh') return 'Anh';
  if (value === 'chi' || value === 'chị') return 'Chị';
  return raw?.trim() || 'Anh';
}

function formatPlainNumber(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toLocaleString('vi-VN');
}

function roundToNearestThousand(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value / 1000) * 1000;
}

function formatRoundedPriceForSpeech(value?: number): string {
  const rounded = roundToNearestThousand(value);
  if (typeof rounded !== 'number') return '';

  const millions = Math.floor(rounded / 1_000_000);
  const thousands = Math.round((rounded % 1_000_000) / 1000);

  if (millions <= 0) {
    return `${formatPlainNumber(thousands)} nghìn`;
  }

  if (thousands <= 0) {
    return `${formatPlainNumber(millions)} triệu`;
  }

  return `${formatPlainNumber(millions)} triệu ${formatPlainNumber(thousands)} nghìn`;
}

function formatExpiryDateForSpeech(raw?: string): string {
  const value = String(raw ?? '').trim();
  if (!value) return 'tháng tới';
  if (!value.includes('/')) return value;

  const match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!match) return 'tháng tới';

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3];
  if (!day || !month) return 'tháng tới';

  return `ngày ${day} tháng ${month} năm ${year}`;
}

function derivePurposeLabel(isBusiness?: boolean, fallbackPurpose?: string): string {
  if (typeof isBusiness === 'boolean') {
    return isBusiness ? 'kinh doanh' : 'không kinh doanh';
  }

  return nonEmpty(fallbackPurpose) ?? 'chưa rõ mục đích sử dụng';
}

function resolvePricingInputs(state: LeadgenMultiAgentSessionState, args?: CalcTndsFeeArgs) {
  return {
    vehicleType: args?.vehicleType ?? state.slots.vehicleType,
    seats:
      parsePositiveNumber(args?.seats) ??
      parsePositiveNumber(args?.numSeats) ??
      parsePositiveNumber(state.slots.numSeats),
    isBusiness:
      typeof args?.isBusiness === 'boolean' ? args.isBusiness : state.slots.isBusiness,
    weightTons: parsePositiveNumber(args?.weightTons) ?? parsePositiveNumber(state.slots.weightTons),
    discountPercent: resolveDiscountPercent(args?.discountPercent, state.pricing.discountPercent),
  };
}

function getMissingPricingSlots(input: {
  vehicleType?: VehicleType;
  seats?: number;
  isBusiness?: boolean;
  weightTons?: number;
}) {
  const missing: string[] = [];

  if (!input.vehicleType) {
    missing.push('vehicleType');
    return missing;
  }

  if (input.vehicleType === 'truck') {
    if (typeof input.weightTons !== 'number' || input.weightTons <= 0) {
      missing.push('weightTons');
    }
    return missing;
  }

  if (typeof input.seats !== 'number' || input.seats <= 0) {
    missing.push('numSeats');
  }

  if (typeof input.isBusiness !== 'boolean') {
    missing.push('isBusiness');
  }

  return missing;
}

function buildPricingContext(state: LeadgenMultiAgentSessionState, args?: CalcTndsFeeArgs) {
  const resolved = resolvePricingInputs(state, args);
  const missingSlots = getMissingPricingSlots(resolved);

  return {
    vehicleType: resolved.vehicleType ?? null,
    missingSlots,
    canQuote: missingSlots.length === 0,
  };
}

function buildLeadgenScriptVars(state: LeadgenMultiAgentSessionState, args?: CalcTndsFeeArgs) {
  const runtime = getLeadgenMultiAgentRuntimeContext();
  const resolved = resolvePricingInputs(state, args);
  const purpose = derivePurposeLabel(resolved.isBusiness, state.slots.purpose);
  const vehicleDescription =
    resolved.vehicleType === 'truck'
      ? `xe tải ${typeof resolved.weightTons === 'number' ? `${resolved.weightTons} tấn` : 'của mình'}`
      : resolved.vehicleType === 'pickup'
        ? `xe pickup ${resolved.seats ? `${resolved.seats} chỗ ` : ''}${purpose}`
        : resolved.seats
          ? `xe ${resolved.seats} chỗ ${purpose}`
          : `xe ${purpose}`;

  return {
    gender: normalizeGenderValue(state.slots.leadGender),
    name: nonEmpty(state.slots.leadName) ?? 'mình',
    agent_name: nonEmpty(runtime.displayAgentName) ?? 'Thảo',
    BKS: nonEmpty(state.slots.plateNumber) ?? 'xe của mình',
    phone_number: nonEmpty(runtime.phoneNumber) ?? '',
    num_seats: resolved.seats ? String(resolved.seats) : '',
    purpose,
    expiry_date: formatExpiryDateForSpeech(state.slots.expiryDate),
    list_price: formatRoundedPriceForSpeech(state.pricing.listPrice),
    discount_price: formatRoundedPriceForSpeech(state.pricing.discountPrice),
    savings: formatRoundedPriceForSpeech(state.pricing.savings),
    discount_percent: String(resolved.discountPercent),
    gifts:
      nonEmpty(state.pricing.giftInfo) ?? 'thẻ phạt nguội miễn phí 1 năm và quà tặng',
    zalo_number: nonEmpty(state.slots.zaloNumber) ?? '',
    email: nonEmpty(state.slots.email) ?? '',
    address: nonEmpty(state.slots.address) ?? 'địa chỉ mình cung cấp',
    payment_preference: state.slots.paymentPreference ?? '',
    vehicle_type: resolved.vehicleType ?? '',
    weight_tons: typeof resolved.weightTons === 'number' ? String(resolved.weightTons) : '',
    vehicle_description: vehicleDescription.trim(),
  };
}

function buildQuoteReplyText(state: LeadgenMultiAgentSessionState, args?: CalcTndsFeeArgs) {
  const vars = buildLeadgenScriptVars(state, args);

  return `Dạ vâng. Với ${vars.vehicle_description} của mình, giá niêm yết là ${vars.list_price} một năm. Hôm nay bên em có ưu đãi, ${vars.gender} chỉ cần ${vars.discount_price} một năm, tiết kiệm ${vars.savings} ạ. Ngoài ra ${vars.gender} còn được tặng ${vars.gifts} ạ. Em sẽ gửi bản điện tử qua Zalo, bản giấy gửi về tận nhà. ${vars.gender} kiểm tra rồi mới thanh toán nhé.`;
}

export const getLeadgenContextTool = tool({
  name: 'getLeadgenContext',
  description: 'Lấy context hiện tại của cuộc gọi (thông tin khách hàng, xe, state hiện tại). Gọi tool này ở đầu lượt đầu tiên của mỗi Agent.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async () => {
    const state = getLeadgenMultiAgentState();
    const runtime = getLeadgenMultiAgentRuntimeContext();
    return {
      ok: true,
      state,
      runtime,
      scriptVars: buildLeadgenScriptVars(state),
      pricingContext: buildPricingContext(state),
    };
  },
});

export const updateLeadgenStateTool = tool({
  name: 'updateLeadgenState',
  description: 'Cập nhật trạng thái cuộc gọi. Dùng để lưu thông tin xe (slots), đánh dấu kết quả cuộc gọi (outcome), hoặc lên lịch gọi lại.',
  parameters: {
    type: 'object',
    properties: {
      currentBuc: { type: 'string', enum: ['BUC_1', 'BUC_2', 'BUC_3', 'BUC_4', 'BUC_5'] },
      slots: { 
        type: 'object', 
        description: 'Thông tin thu thập được',
        properties: {
          vehicleType: { type: 'string', enum: ['car', 'pickup', 'truck'] },
          numSeats: { type: 'number', description: 'Số chỗ ngồi' },
          isBusiness: { type: 'boolean', description: 'Có kinh doanh vận tải không' },
          weightTons: { type: 'number', description: 'Tải trọng xe tải (tấn)' },
          expiryDate: { type: 'string', description: 'Ngày/tháng hết hạn bảo hiểm' },
          brand: { type: 'string', description: 'Hãng xe' },
          color: { type: 'string', description: 'Màu xe' },
          zaloNumber: { type: 'string', description: 'Số điện thoại Zalo' },
          email: { type: 'string', description: 'Email nhận thông tin bảo hiểm' },
          address: { type: 'string', description: 'Địa chỉ nhận ấn chỉ/quà' },
          paymentPreference: { type: 'string', enum: ['cod', 'online'] }
        }
      },
      outcome: { 
        type: 'object',
        description: 'Kết quả cuộc gọi (dùng khi kết thúc hoặc hẹn gọi lại)',
        properties: {
          report: { type: 'string', description: 'Tóm tắt kết quả (VD: Chốt thành công, Bận, Sai số)' },
          issueType: { type: 'string' },
          level: { type: 'number' },
          callOutcome: { type: 'string', enum: ['Success', 'Rejection', 'Callback', 'NoAnswer'] },
          followupAt: { type: 'string', description: 'Thời gian gọi lại nếu có' }
        }
      },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const patch: any = {};
    if (args?.currentBuc) patch.currentBuc = args.currentBuc;
    if (args?.slots) patch.slots = args.slots;
    if (args?.outcome) {
      patch.outcome = {
        ...args.outcome,
        endedAt: new Date().toISOString(),
      };
    }
    const nextState = patchLeadgenMultiAgentState(patch);
    return {
      ok: true,
      state: nextState,
      scriptVars: buildLeadgenScriptVars(nextState),
      pricingContext: buildPricingContext(nextState),
    };
  },
});



export const calcTndsFeeTool = tool({
  name: 'calcTndsFee',
  description: 'Tính phí TNDS cơ bản. Gọi tool này trước khi báo giá cho khách hàng.',
  parameters: {
    type: 'object',
    properties: {
      vehicleType: { type: 'string', enum: ['car', 'pickup', 'truck'] },
      seats: { type: 'number', description: 'Số chỗ ngồi của xe' },
      numSeats: { type: 'number', description: 'Alias của seats để tương thích state hiện tại' },
      isBusiness: { type: 'boolean', description: 'Xe có kinh doanh vận tải không' },
      weightTons: { type: 'number', description: 'Tải trọng xe tải (tấn)' },
      discountPercent: { type: 'number', description: 'Phần trăm giảm giá (mặc định 10)' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const state = getLeadgenMultiAgentState();
    const resolved = resolvePricingInputs(state, args as CalcTndsFeeArgs);
    const missing = getMissingPricingSlots(resolved);

    if (missing.length > 0) {
      return {
        ok: false,
        needMoreInfo: true,
        missing,
        usedArgs: resolved,
        pricingContext: buildPricingContext(state, args as CalcTndsFeeArgs),
      };
    }

    const engineDiscountPercent = ALLOWED_DISCOUNT_RATES.includes(resolved.discountPercent as DiscountRate)
      ? (resolved.discountPercent as DiscountRate)
      : undefined;
    const result = calculateTndsFee({
      vehicleType: resolved.vehicleType!,
      seats: resolved.seats,
      isBusiness: resolved.isBusiness,
      weightTons: resolved.weightTons,
      discountPercent: engineDiscountPercent,
      durationYears: 1,
    });

    if (!result?.ok) {
      return {
        ...result,
        usedArgs: resolved,
        pricingContext: buildPricingContext(state, args as CalcTndsFeeArgs),
      };
    }

    const rawListPrice =
      typeof result.price?.total === 'number' && Number.isFinite(result.price.total)
        ? result.price.total
        : undefined;
    const rawDiscountPrice =
      typeof rawListPrice === 'number' && typeof resolved.discountPercent === 'number'
        ? Math.round(rawListPrice * (1 - resolved.discountPercent / 100))
        : typeof result.discountedTotal === 'number' && Number.isFinite(result.discountedTotal)
          ? result.discountedTotal
          : rawListPrice;
    const listPrice = roundToNearestThousand(rawListPrice);
    const discountPrice = roundToNearestThousand(rawDiscountPrice);
    const savings =
      typeof listPrice === 'number' && typeof discountPrice === 'number'
        ? listPrice - discountPrice
        : undefined;
    const nextState = patchLeadgenMultiAgentState({
      slots: {
        vehicleType: resolved.vehicleType,
        ...(typeof resolved.seats === 'number' ? { numSeats: resolved.seats } : {}),
        ...(typeof resolved.isBusiness === 'boolean'
          ? {
              isBusiness: resolved.isBusiness,
              purpose: derivePurposeLabel(resolved.isBusiness),
            }
          : {}),
        ...(typeof resolved.weightTons === 'number' ? { weightTons: resolved.weightTons } : {}),
      },
      pricing: {
        listPrice,
        discountPercent: resolved.discountPercent,
        discountPrice,
        savings,
        giftInfo: 'thẻ phạt nguội miễn phí 1 năm và quà tặng',
        priceQuoted: true,
        priceAccepted: state.pricing.priceAccepted ?? false,
      },
      currentBuc: 'BUC_4',
    });

    return {
      ...result,
      usedArgs: resolved,
      pricingState: nextState.pricing,
      scriptVars: buildLeadgenScriptVars(nextState, args as CalcTndsFeeArgs),
      pricingContext: buildPricingContext(nextState, args as CalcTndsFeeArgs),
      replyText: buildQuoteReplyText(nextState, args as CalcTndsFeeArgs),
    };
  },
});
