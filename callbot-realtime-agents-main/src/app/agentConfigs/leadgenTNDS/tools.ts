import { tool } from '@openai/agents/realtime';
import {
  businessBands,
  nonBusinessBands,
  truckBands,
  over25SeatFormulaBase,
  over25SeatFormulaIncrement,
  vatRate,
  type DiscountRate,
  type PriceRow,
} from './pricingData';
import { tndsFaqItems } from './faqData';

type LeadRecord = {
  leadId?: string;
  phoneNumber?: string;
  gender?: string;
  genger?: string;
  fullName?: string;
  name?: string;
  BKS?: string;
  plateNumber?: string;
  renewalMonth?: string;
  seats?: number;
  isBusiness?: boolean;
  weightTons?: number;
  status?: string;
  note?: string;
  updatedAt: string;
};

const leadStore = new Map<string, LeadRecord>();

const BASE_URL = process.env.BASE_URL ?? ''

type LeadgenRuntimeContext = {
  leadId?: string;
  phoneNumber?: string;
  overrideGender?: string;
  overrideName?: string;
  overridePlate?: string;
  customData?: Record<string, any>;
};

let leadgenRuntimeContext: LeadgenRuntimeContext = {};

export function setLeadgenRuntimeContext(next: LeadgenRuntimeContext) {
  leadgenRuntimeContext = { ...next };
}

export function getCustomData(): Record<string, any> {
  return leadgenRuntimeContext.customData ?? {};
}

function nonEmpty(value?: string): string | undefined {
  const v = String(value ?? '').trim();
  return v ? v : undefined;
}

function getLeadKey(leadId?: string, phoneNumber?: string) {
  if (leadId) return `lead:${leadId}`;
  if (phoneNumber) return `phone:${phoneNumber}`;
  return `lead:${Date.now()}`;
}

function normalizeGenderValue(raw?: string): string {
  const v = String(raw ?? '')
    .trim()
    .replace(/\//g, ' ')
    .replace(/\s+hoặc\s+/gi, ' ')
    .replace(/\s+/g, ' ');
  if (!v) return 'Anh chị';
  return v;
}

function buildOpeningText(lead: Record<string, any>) {
  const gender = normalizeGenderValue(lead.gender ?? lead.genger);
  const genger = normalizeGenderValue(lead.genger ?? lead.gender);
  const name = String(lead.name ?? lead.fullName ?? '').trim() || 'mình';
  const bks = String(lead.BKS ?? lead.plateNumber ?? '').trim() || 'xe của mình';
  return `Dạ ${gender} ${name} ơi. Em ở bên bảo hiểm xe ô tô í ${gender}. Em check thấy xe biển số ${bks} của ${gender} sắp hết hạn rồi này. Em viết nối hạn luôn cho ${genger} nha.`;
}

function matchBandBySeats(seats: number, isPickup: boolean, bands: typeof nonBusinessBands) {
  if (isPickup) return bands.find((b) => b.isPickup);
  return bands.find((b) => {
    if (typeof b.exactSeats === 'number') return b.exactSeats === seats;
    if (typeof b.minSeats === 'number' && seats < b.minSeats) return false;
    if (typeof b.maxSeats === 'number' && seats > b.maxSeats) return false;
    return true;
  });
}

function matchBusinessBand(seats: number, isPickup: boolean) {
  if (isPickup) return businessBands.find((b) => b.isPickup);
  const exact = businessBands.find((b) => b.exactSeats === seats);
  if (exact) return exact;
  const range = businessBands.find((b) => {
    if (typeof b.exactSeats === 'number') return false;
    if (typeof b.minSeats === 'number' && seats < b.minSeats) return false;
    if (typeof b.maxSeats === 'number' && seats > b.maxSeats) return false;
    return true;
  });
  return range;
}

function matchTruckBand(weightTons: number, isTractor: boolean) {
  if (isTractor) return truckBands.find((b) => b.id === 't-tractor');
  return truckBands.find((b) => {
    if (typeof b.exactTons === 'number' && b.id !== 't-tractor') return b.exactTons === weightTons;
    if (typeof b.minTons === 'number' && weightTons < b.minTons) return false;
    if (typeof b.maxTons === 'number' && weightTons > b.maxTons) return false;
    return true;
  });
}

function buildDiscountedPrice(base: number, discount: DiscountRate): PriceRow {
  const discountedBase = Math.round(base * (1 - discount / 100));
  const vat = Math.round(discountedBase * vatRate);
  const total = discountedBase + vat;
  return {
    label: `Chiết khấu ${discount}%`,
    base: discountedBase,
    vat,
    total,
    discounts: {
      20: total,
      25: total,
      30: total,
      35: total,
      40: total,
    },
  };
}

function computeOver25SeatPrice(seats: number, discount?: DiscountRate) {
  const base = over25SeatFormulaBase + over25SeatFormulaIncrement * (seats - 25);
  const vat = Math.round(base * vatRate);
  const total = base + vat;
  const discounts: Record<DiscountRate, number> = {
    20: buildDiscountedPrice(base, 20).total,
    25: buildDiscountedPrice(base, 25).total,
    30: buildDiscountedPrice(base, 30).total,
    35: buildDiscountedPrice(base, 35).total,
    40: buildDiscountedPrice(base, 40).total,
  };
  const discountedTotal = discount ? discounts[discount] : undefined;
  return { base, vat, total, discounts, discountedTotal };
}

export const getLeadContextTool = tool({
  name: 'getLeadContext',
  description: 'Tra cứu thong tin lead tu fake API CRM theo call context.',
  parameters: {
    type: 'object',
    properties: {
      leadId: { type: 'string' },
      phoneNumber: { type: 'string' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any, runContext?: any) => {
    const { leadId, phoneNumber } = args as { leadId?: string; phoneNumber?: string };
    const ctx = (runContext?.context ?? {}) as Record<string, any>;
    const cd  = (ctx.customData ?? {}) as Record<string, any>;

    const resolvedLeadId      = nonEmpty(leadId)      ?? nonEmpty(ctx.leadId ?? cd.leadId)   ?? nonEmpty(leadgenRuntimeContext.leadId);
    const resolvedPhoneNumber = nonEmpty(phoneNumber) ?? nonEmpty(ctx.phone  ?? cd.phone)    ?? nonEmpty(leadgenRuntimeContext.phoneNumber);
    let apiLead: Record<string, any> | null = null;

    try {
      const query = new URLSearchParams();
      if (resolvedLeadId) query.set('leadId', resolvedLeadId);
      if (resolvedPhoneNumber) query.set('phoneNumber', resolvedPhoneNumber);
      const res = await fetch(`${BASE_URL}/api/leadgen/call-context?${query.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { lead?: Record<string, any> | null };
        apiLead = data?.lead ?? null;
      }
    } catch {
      // Ignore API failure and fallback to local memory store below.
    }

    const key = getLeadKey(resolvedLeadId, resolvedPhoneNumber);
    const localLead = leadStore.get(key) ?? null;
    const record: Record<string, any> = {
      ...(apiLead ?? {}),
      ...(localLead ?? {}),
    };
    const overrideGender = nonEmpty(cd.gender) ?? nonEmpty(leadgenRuntimeContext.overrideGender);
    const overrideName   = nonEmpty(cd.name)   ?? nonEmpty(leadgenRuntimeContext.overrideName);
    const overridePlate  = nonEmpty(cd.plate)  ?? nonEmpty(leadgenRuntimeContext.overridePlate);
    if (overrideGender) {
      record.gender = overrideGender;
      record.genger = overrideGender;
    }
    if (overrideName) {
      record.name = overrideName;
      record.fullName = overrideName;
    }
    if (overridePlate) {
      record.BKS = overridePlate;
      record.plateNumber = overridePlate;
    }
    const normalizedLead = Object.keys(record).length
      ? {
          ...record,
          gender: normalizeGenderValue(record.gender ?? record.genger),
          genger: normalizeGenderValue(record.genger ?? record.gender),
        }
      : null;

    return {
      found: Boolean(apiLead || localLead || normalizedLead),
      lead: normalizedLead,
      openingText: normalizedLead ? buildOpeningText(normalizedLead) : null,
    };
  },
});

export const calcTndsFeeTool = tool({
  name: 'calcTndsFee',
  description:
    'Tinh phi BH TNDS theo so cho/trong tai va muc dich su dung. Luon tra gia niem yet va gia chiet khau.',
  parameters: {
    type: 'object',
    properties: {
      vehicleType: {
        type: 'string',
        enum: ['car', 'pickup', 'truck'],
        description: 'Loai xe: car, pickup/minivan, truck',
      },
      seats: { type: 'number', description: 'So cho ngoi (neu xe cho nguoi)' },
      isBusiness: { type: 'boolean', description: 'Co kinh doanh van tai hay khong' },
      weightTons: { type: 'number', description: 'Trong tai xe tai (tan)' },
      isTractor: { type: 'boolean', description: 'Xe dau keo hay khong' },
      discountPercent: { type: 'number', enum: [20, 25, 30, 35, 40] },
    },
    required: ['vehicleType'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const {
      vehicleType,
      seats,
      isBusiness,
      weightTons,
      isTractor,
      discountPercent,
    } = args as {
      vehicleType: 'car' | 'pickup' | 'truck';
      seats?: number;
      isBusiness?: boolean;
      weightTons?: number;
      isTractor?: boolean;
      discountPercent?: DiscountRate;
    };

    const missing: string[] = [];
    if (vehicleType === 'truck') {
      if (!isTractor && (typeof weightTons !== 'number' || weightTons <= 0)) {
        missing.push('weightTons');
      }
    } else {
      if (typeof seats !== 'number' || seats <= 0) {
        missing.push('seats');
      }
      if (typeof isBusiness !== 'boolean') {
        missing.push('isBusiness');
      }
    }

    if (missing.length > 0) {
      return { ok: false, needMoreInfo: true, missing };
    }

    if (vehicleType === 'truck') {
      const band = matchTruckBand(weightTons || 0, Boolean(isTractor));
      if (!band) {
        return { ok: false, error: 'Khong tim thay bang phi phu hop.' };
      }
      const discountedTotal = discountPercent ? band.price.discounts[discountPercent] : undefined;
      return {
        ok: true,
        group: `Xe tai - ${band.label}`,
        price: band.price,
        discountedTotal,
      };
    }

    const isPickup = vehicleType === 'pickup';
    if (isBusiness) {
      const band = matchBusinessBand(seats || 0, isPickup);
      if (!band) {
        if ((seats || 0) > 25) {
          const computed = computeOver25SeatPrice(seats || 0, discountPercent);
          return {
            ok: true,
            group: `Xe kinh doanh tren 25 cho`,
            price: {
              label: `Tren 25 cho (${seats})`,
              base: computed.base,
              vat: computed.vat,
              total: computed.total,
              discounts: computed.discounts,
            },
            discountedTotal: computed.discountedTotal,
          };
        }
        return { ok: false, error: 'Khong tim thay bang phi phu hop.' };
      }
      const discountedTotal = discountPercent ? band.price.discounts[discountPercent] : undefined;
      return {
        ok: true,
        group: `Xe kinh doanh - ${band.label}`,
        price: band.price,
        discountedTotal,
      };
    }

    const band = matchBandBySeats(seats || 0, isPickup, nonBusinessBands);
    if (!band) {
      return { ok: false, error: 'Khong tim thay bang phi phu hop.' };
    }
    const discountedTotal = discountPercent ? band.price.discounts[discountPercent] : undefined;
    return {
      ok: true,
      group: `Xe khong kinh doanh - ${band.label}`,
      price: band.price,
      discountedTotal,
    };
  },
});

export const lookupTndsFaqTool = tool({
  name: 'lookupTndsFaq',
  description: 'Tra cuu FAQ ve bao hiem TNDS oto.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string' },
    },
    required: ['question'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { question } = args as { question: string };
    const normalizeForLookup = (text: string) =>
      String(text || '')
        .toLowerCase()
        .replace(/đ/g, 'd')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const q = normalizeForLookup(question);

    // Fast-path for "which insurance company" variants.
    const isCompanyQuestion =
      q.includes('bao hiem nao') ||
      q.includes('ben bao hiem nao') ||
      q.includes('em o ben bao hiem nao');
    if (isCompanyQuestion) {
      const company = tndsFaqItems.find((it) => it.id === 'faq-company-name');
      if (company) return { found: true, faq: company };
    }

    // Fast-path for common "about us / where are you" variants.
    const isWhereQuestion =
      q.includes('em o dau') ||
      q.includes('em ben nao') ||
      q.includes('ben nao') ||
      q.includes('em la ai') ||
      q.includes('bao hiem gi');
    if (isWhereQuestion) {
      const about = tndsFaqItems.find((it) => it.id === 'faq-where');
      if (about) return { found: true, faq: about };
    }

    const exact = tndsFaqItems.find(
      (it) => {
        const iq = normalizeForLookup(it.question);
        return q.includes(iq) || iq.includes(q);
      },
    );
    if (exact) {
      return { found: true, faq: exact };
    }
    const scored = tndsFaqItems.map((it) => {
      let score = 0;
      for (const kw of it.keywords) {
        const nkw = normalizeForLookup(kw);
        if (nkw && q.includes(nkw)) score += 2;
      }
      const cat = normalizeForLookup(it.category);
      if (cat && q.includes(cat)) score += 1;
      return { it, score };
    });
    const best = scored.sort((a, b) => b.score - a.score)[0];
    if (best && best.score > 0) {
      return { found: true, faq: best.it };
    }
    return {
      found: false,
      message: 'Xin loi, em chua tim thay thong tin phu hop. Anh/chi co the hoi cu the hon duoc khong a?',
    };
  },
});

export const createLeadOrUpdateTool = tool({
  name: 'createLeadOrUpdate',
  description: 'Tao hoac cap nhat thong tin lead va trang thai.',
  parameters: {
    type: 'object',
    properties: {
      leadId: { type: 'string' },
      phoneNumber: { type: 'string' },
      fullName: { type: 'string' },
      plateNumber: { type: 'string' },
      renewalMonth: { type: 'string' },
      seats: { type: 'number' },
      isBusiness: { type: 'boolean' },
      weightTons: { type: 'number' },
      status: { type: 'string' },
      note: { type: 'string' },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const record = args as Omit<LeadRecord, 'updatedAt'>;
    const key = getLeadKey(record.leadId, record.phoneNumber);
    const updated: LeadRecord = {
      ...leadStore.get(key),
      ...record,
      updatedAt: new Date().toISOString(),
    };
    leadStore.set(key, updated);
    return { ok: true, lead: updated };
  },
});

export const scheduleFollowupTool = tool({
  name: 'scheduleFollowup',
  description: 'Luu lich follow-up sau cuoc goi.',
  parameters: {
    type: 'object',
    properties: {
      leadId: { type: 'string' },
      followupDay: { type: 'string', enum: ['D1', 'D2', 'D3'] },
      channel: { type: 'string', enum: ['zalo', 'call'] },
    },
    required: ['followupDay', 'channel'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { followupDay, channel, leadId } = args as {
      followupDay: 'D1' | 'D2' | 'D3';
      channel: 'zalo' | 'call';
      leadId?: string;
    };
    return {
      ok: true,
      leadId: leadId ?? null,
      followupDay,
      channel,
      scheduledAt: new Date().toISOString(),
    };
  },
});

export const handoffHumanTool = tool({
  name: 'handoffHuman',
  description: 'Chuyen cuoc goi cho nhan vien tu van.',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
    },
    required: ['reason'],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const { reason } = args as { reason: string };
    return {
      ok: true,
      message: `Dang chuyen cuoc goi cho nhan vien. Ly do: ${reason}`,
      timestamp: new Date().toISOString(),
    };
  },
});
