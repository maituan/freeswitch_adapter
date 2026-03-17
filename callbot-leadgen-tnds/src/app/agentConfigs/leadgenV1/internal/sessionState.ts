export type VehicleType = 'car' | 'pickup' | 'truck';

export type LeadgenV1RuntimeContext = {
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

export type LeadgenV1SessionState = {
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
    report?: string;
    issueType?: string;
    level?: number;
    callOutcome?: string;
    endedAt?: string;
  };
  updatedAt: string;
};

let runtimeContext: LeadgenV1RuntimeContext = {};
const inMemoryStore = new Map<string, LeadgenV1SessionState>();

export function setLeadgenV1RuntimeContext(next: LeadgenV1RuntimeContext) {
  runtimeContext = { ...runtimeContext, ...next };
}

export function getLeadgenV1RuntimeContext() {
  return runtimeContext;
}

function keyFromRuntime() {
  const sessionId = String(runtimeContext.sessionId ?? '').trim();
  return sessionId || '__default__';
}

export function createDefaultLeadgenV1State(): LeadgenV1SessionState {
  return {
    sessionId: runtimeContext.sessionId,
    leadId: runtimeContext.leadId,
    phoneNumber: runtimeContext.phoneNumber,
    currentBuc: 'BUC_1',
    counters: {
      noHearCount: 0,
      silenceCount: 0,
      refusalCount: 0,
    },
    slots: {
      leadGender: runtimeContext.overrideGender,
      leadName: runtimeContext.overrideName,
      plateNumber: runtimeContext.overridePlate || '29A-12345',
      vehicleType: runtimeContext.overrideVehicleType,
      numSeats: runtimeContext.overrideNumSeats,
      isBusiness: runtimeContext.overrideIsBusiness,
      weightTons: runtimeContext.overrideWeightTons,
      expiryDate: runtimeContext.overrideExpiryDate,
      address: runtimeContext.overrideAddress,
      brand: runtimeContext.overrideBrand,
      color: runtimeContext.overrideColor,
    },
    pricing: {
      priceQuoted: false,
      priceAccepted: false,
    },
    outcome: {},
    updatedAt: new Date().toISOString(),
  };
}

function applyRuntimeOverrides(state: LeadgenV1SessionState): LeadgenV1SessionState {
  return {
    ...state,
    sessionId: runtimeContext.sessionId ?? state.sessionId,
    leadId: runtimeContext.leadId ?? state.leadId,
    phoneNumber: runtimeContext.phoneNumber ?? state.phoneNumber,
    slots: {
      ...state.slots,
      leadGender: runtimeContext.overrideGender ?? state.slots.leadGender,
      leadName: runtimeContext.overrideName ?? state.slots.leadName,
      plateNumber: runtimeContext.overridePlate ?? state.slots.plateNumber ?? '29A-12345',
      vehicleType: runtimeContext.overrideVehicleType ?? state.slots.vehicleType,
      numSeats:
        typeof runtimeContext.overrideNumSeats === 'number'
          ? runtimeContext.overrideNumSeats
          : state.slots.numSeats,
      isBusiness:
        typeof runtimeContext.overrideIsBusiness === 'boolean'
          ? runtimeContext.overrideIsBusiness
          : state.slots.isBusiness,
      weightTons:
        typeof runtimeContext.overrideWeightTons === 'number'
          ? runtimeContext.overrideWeightTons
          : state.slots.weightTons,
      expiryDate: runtimeContext.overrideExpiryDate ?? state.slots.expiryDate,
      address: runtimeContext.overrideAddress ?? state.slots.address,
      brand: runtimeContext.overrideBrand ?? state.slots.brand,
      color: runtimeContext.overrideColor ?? state.slots.color,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function getLeadgenV1State(): LeadgenV1SessionState {
  const key = keyFromRuntime();
  const existing = inMemoryStore.get(key) ?? createDefaultLeadgenV1State();
  const merged = applyRuntimeOverrides(existing);
  inMemoryStore.set(key, merged);
  return merged;
}

export function patchLeadgenV1State(
  patch: Partial<LeadgenV1SessionState> & {
    counters?: Partial<LeadgenV1SessionState['counters']>;
    slots?: Partial<LeadgenV1SessionState['slots']>;
    pricing?: Partial<LeadgenV1SessionState['pricing']>;
    outcome?: Partial<LeadgenV1SessionState['outcome']>;
  },
): LeadgenV1SessionState {
  const current = getLeadgenV1State();
  const next: LeadgenV1SessionState = {
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
  inMemoryStore.set(keyFromRuntime(), next);
  return next;
}
