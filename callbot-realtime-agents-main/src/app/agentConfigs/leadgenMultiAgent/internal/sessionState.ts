export type VehicleType = 'car' | 'pickup' | 'truck';

export type LeadgenMultiAgentRuntimeContext = {
  sessionId?: string;
  leadId?: string;
  phoneNumber?: string;
  displayAgentName?: string;
  overrideGender?: string;
  overrideName?: string;
  overridePlate?: string;
  overrideVehicleType?: VehicleType;
  overrideNumSeats?: number;
  overrideIsBusiness?: boolean;
  overrideWeightTons?: number;
  overrideExpiryDate?: string;
  overrideAddress?: string;
  overrideBrand?: string;
  overrideColor?: string;
};

export type LeadgenMultiAgentSessionState = {
  sessionId?: string;
  leadId?: string;
  phoneNumber?: string;
  currentBuc: 'BUC_1' | 'BUC_2' | 'BUC_3' | 'BUC_4' | 'BUC_5';
  counters: {
    noHearCount: number;
    silenceCount: number;
    refusalCount: number;
  };
  slots: {
    leadGender?: string;
    leadName?: string;
    plateNumber?: string;
    vehicleType?: VehicleType;
    numSeats?: number;
    isBusiness?: boolean;
    purpose?: string;
    weightTons?: number;
    expiryDate?: string;
    brand?: string;
    color?: string;
    zaloNumber?: string;
    email?: string;
    address?: string;
    paymentPreference?: 'cod' | 'online';
  };
  pricing: {
    listPrice?: number;
    discountPercent?: number;
    discountPrice?: number;
    savings?: number;
    giftInfo?: string;
    priceQuoted: boolean;
    priceAccepted: boolean;
  };
  outcome: {
    report?: Array<{ id: number; detail: string }>;
    issueType?: string;
    level?: number;
    callOutcome?: string;
    endedAt?: string;
  };
  updatedAt: string;
};

// Per-session runtime context store — keyed by sessionId, no global singleton
const runtimeContextStore = new Map<string, LeadgenMultiAgentRuntimeContext>();
const inMemoryStore = new Map<string, LeadgenMultiAgentSessionState>();

export function setLeadgenMultiAgentRuntimeContext(next: LeadgenMultiAgentRuntimeContext) {
  const key = String(next.sessionId ?? '__default__').trim() || '__default__';
  const existing = runtimeContextStore.get(key) ?? {};
  runtimeContextStore.set(key, { ...existing, ...next });
}

export function getLeadgenMultiAgentRuntimeContext(sessionId: string): LeadgenMultiAgentRuntimeContext {
  const key = String(sessionId ?? '__default__').trim() || '__default__';
  return runtimeContextStore.get(key) ?? {};
}

export function createDefaultLeadgenMultiAgentState(
  sessionId: string,
  context: LeadgenMultiAgentRuntimeContext,
): LeadgenMultiAgentSessionState {
  return {
    sessionId: context.sessionId ?? sessionId,
    leadId: context.leadId,
    phoneNumber: context.phoneNumber,
    currentBuc: 'BUC_1',
    counters: {
      noHearCount: 0,
      silenceCount: 0,
      refusalCount: 0,
    },
    slots: {
      leadGender: context.overrideGender,
      leadName: context.overrideName,
      plateNumber: context.overridePlate || '29A-12345',
      vehicleType: context.overrideVehicleType,
      numSeats: context.overrideNumSeats,
      isBusiness: context.overrideIsBusiness,
      weightTons: context.overrideWeightTons,
      expiryDate: context.overrideExpiryDate,
      address: context.overrideAddress,
      brand: context.overrideBrand,
      color: context.overrideColor,
    },
    pricing: {
      priceQuoted: false,
      priceAccepted: false,
    },
    outcome: {},
    updatedAt: new Date().toISOString(),
  };
}

function applyRuntimeOverrides(
  state: LeadgenMultiAgentSessionState,
  context: LeadgenMultiAgentRuntimeContext,
): LeadgenMultiAgentSessionState {
  return {
    ...state,
    sessionId: context.sessionId ?? state.sessionId,
    leadId: context.leadId ?? state.leadId,
    phoneNumber: context.phoneNumber ?? state.phoneNumber,
    slots: {
      ...state.slots,
      leadGender: context.overrideGender ?? state.slots.leadGender,
      leadName: context.overrideName ?? state.slots.leadName,
      plateNumber: context.overridePlate ?? state.slots.plateNumber ?? '29A-12345',
      vehicleType: context.overrideVehicleType ?? state.slots.vehicleType,
      numSeats:
        typeof context.overrideNumSeats === 'number'
          ? context.overrideNumSeats
          : state.slots.numSeats,
      isBusiness:
        typeof context.overrideIsBusiness === 'boolean'
          ? context.overrideIsBusiness
          : state.slots.isBusiness,
      weightTons:
        typeof context.overrideWeightTons === 'number'
          ? context.overrideWeightTons
          : state.slots.weightTons,
      expiryDate: context.overrideExpiryDate ?? state.slots.expiryDate,
      address: context.overrideAddress ?? state.slots.address,
      brand: context.overrideBrand ?? state.slots.brand,
      color: context.overrideColor ?? state.slots.color,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function getLeadgenMultiAgentState(sessionId: string): LeadgenMultiAgentSessionState {
  const key = String(sessionId ?? '__default__').trim() || '__default__';
  const context = getLeadgenMultiAgentRuntimeContext(key);
  const existing = inMemoryStore.get(key) ?? createDefaultLeadgenMultiAgentState(key, context);
  const merged = applyRuntimeOverrides(existing, context);
  inMemoryStore.set(key, merged);
  return merged;
}

export function patchLeadgenMultiAgentState(
  sessionId: string,
  patch: Partial<LeadgenMultiAgentSessionState> & {
    counters?: Partial<LeadgenMultiAgentSessionState['counters']>;
    slots?: Partial<LeadgenMultiAgentSessionState['slots']>;
    pricing?: Partial<LeadgenMultiAgentSessionState['pricing']>;
    outcome?: Partial<LeadgenMultiAgentSessionState['outcome']>;
  },
): LeadgenMultiAgentSessionState {
  const key = String(sessionId ?? '__default__').trim() || '__default__';
  const current = getLeadgenMultiAgentState(key);
  const next: LeadgenMultiAgentSessionState = {
    ...current,
    ...patch,
    counters: {
      ...current.counters,
      ...(patch.counters ?? {}),
    },
    slots: {
      ...current.slots,
      ...(patch.slots ?? {}),
    },
    pricing: {
      ...current.pricing,
      ...(patch.pricing ?? {}),
    },
    outcome: {
      ...current.outcome,
      ...(patch.outcome ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
  inMemoryStore.set(key, next);
  return next;
}
