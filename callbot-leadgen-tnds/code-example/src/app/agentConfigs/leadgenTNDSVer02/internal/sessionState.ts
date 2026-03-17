export type VehicleType = 'car' | 'pickup' | 'truck';

export type LeadgenVer02RuntimeContext = {
  agentConfig?: string;
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
};

export type LeadgenVer02SessionState = {
  sessionId?: string;
  leadId?: string;
  phoneNumber?: string;
  currentAgent: string;
  currentBuc: 'BUC_1' | 'BUC_2' | 'BUC_3' | 'BUC_4' | 'BUC_5';
  lastIntent?: string;
  lastIntentGroup?: string;
  nextExpectedAction?: string;
  counters: {
    noHearCount: number;
    silenceCount: number;
    refusalCount: number;
    clarifyCount: number;
    callbackRequestCount: number;
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
    quoteVariant?: 'annual' | 'multi_year';
  };
  outcome: {
    callOutcome?: string;
    issueType?: string;
    reportLabel?: string;
    followupAt?: string;
    followupReason?: string;
    endedAt?: string;
  };
  updatedAt: string;
};

export type LeadgenVer02Memory = {
  summary: string;
  lastUpdatedBy?: string;
  updatedAt: string;
};

export type LeadgenVer02StoredPayload = {
  state: LeadgenVer02SessionState;
  memory: LeadgenVer02Memory;
  events: Array<{ at: string; type: string; payload?: Record<string, unknown> }>;
};

type CallStateResponse = {
  ok?: boolean;
  state?: {
    data?: Record<string, unknown>;
  } | null;
};

const LEADGEN_NAMESPACE = 'leadgenVer02';
const localPayloadCache = new Map<string, LeadgenVer02StoredPayload>();

let runtimeContext: LeadgenVer02RuntimeContext = {
  agentConfig: 'leadgenTNDSVer02',
};

export function setLeadgenVer02RuntimeContext(next: LeadgenVer02RuntimeContext) {
  runtimeContext = {
    ...runtimeContext,
    ...next,
  };
}

export function getLeadgenVer02RuntimeContext() {
  return runtimeContext;
}

function cacheKey() {
  const sessionId = String(runtimeContext.sessionId ?? '').trim();
  const agentConfig = String(runtimeContext.agentConfig ?? 'leadgenTNDSVer02').trim();
  return sessionId && agentConfig ? `${agentConfig}:${sessionId}` : '';
}

export function createDefaultLeadgenVer02State(
  agentName: string = 'leadgenRouterAgent',
): LeadgenVer02SessionState {
  return {
    sessionId: runtimeContext.sessionId,
    leadId: runtimeContext.leadId,
    phoneNumber: runtimeContext.phoneNumber,
    currentAgent: agentName,
    currentBuc: 'BUC_1',
    counters: {
      noHearCount: 0,
      silenceCount: 0,
      refusalCount: 0,
      clarifyCount: 0,
      callbackRequestCount: 0,
    },
    slots: {
      leadGender: runtimeContext.overrideGender,
      leadName: runtimeContext.overrideName,
      plateNumber: runtimeContext.overridePlate,
      vehicleType: runtimeContext.overrideVehicleType,
      numSeats: runtimeContext.overrideNumSeats,
      isBusiness: runtimeContext.overrideIsBusiness,
      weightTons: runtimeContext.overrideWeightTons,
      expiryDate: runtimeContext.overrideExpiryDate,
    },
    pricing: {
      quoteVariant: 'annual',
      priceQuoted: false,
      priceAccepted: false,
    },
    outcome: {},
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultLeadgenVer02Memory(): LeadgenVer02Memory {
  return {
    summary: '',
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchLeadgenVer02StoredPayload(): Promise<LeadgenVer02StoredPayload> {
  const sessionId = String(runtimeContext.sessionId ?? '').trim();
  const agentConfig = String(runtimeContext.agentConfig ?? 'leadgenTNDSVer02').trim();
  const key = cacheKey();

  if (!sessionId || !agentConfig) {
    return {
      state: createDefaultLeadgenVer02State(),
      memory: createDefaultLeadgenVer02Memory(),
      events: [],
    };
  }

  const cached = key ? localPayloadCache.get(key) : null;
  if (cached) {
    return cached;
  }

  const res = await fetch(
    `/api/state?sessionId=${encodeURIComponent(sessionId)}&agentConfig=${encodeURIComponent(agentConfig)}`,
  );
  if (!res.ok) {
    const fallback = {
      state: createDefaultLeadgenVer02State(),
      memory: createDefaultLeadgenVer02Memory(),
      events: [],
    };
    if (key) localPayloadCache.set(key, fallback);
    return fallback;
  }

  const data = (await res.json()) as CallStateResponse;
  const payload = (data?.state?.data?.[LEADGEN_NAMESPACE] ?? null) as Partial<LeadgenVer02StoredPayload> | null;

  const nextPayload = {
    state: payload?.state ?? createDefaultLeadgenVer02State(),
    memory: payload?.memory ?? createDefaultLeadgenVer02Memory(),
    events: Array.isArray(payload?.events) ? payload!.events : [],
  };
  if (key) localPayloadCache.set(key, nextPayload);
  return nextPayload;
}

export async function patchLeadgenVer02StoredPayload(
  patch: Partial<LeadgenVer02StoredPayload>,
) {
  const sessionId = String(runtimeContext.sessionId ?? '').trim();
  const agentConfig = String(runtimeContext.agentConfig ?? 'leadgenTNDSVer02').trim();
  const key = cacheKey();

  if (!sessionId || !agentConfig) {
    return { ok: false, reason: 'missing_session_context' };
  }

  const current =
    (key ? localPayloadCache.get(key) : null) ?? {
      state: createDefaultLeadgenVer02State(),
      memory: createDefaultLeadgenVer02Memory(),
      events: [],
    };
  const mergedPayload: LeadgenVer02StoredPayload = {
    state: patch.state ?? current.state,
    memory: patch.memory ?? current.memory,
    events: patch.events ?? current.events,
  };
  if (key) localPayloadCache.set(key, mergedPayload);

  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      agentConfig,
      lastAgentName: mergedPayload.state.currentAgent,
      data: {
        [LEADGEN_NAMESPACE]: mergedPayload,
      },
    }),
  });

  if (!res.ok) {
    return { ok: true, state: mergedPayload };
  }

  const data = (await res.json()) as CallStateResponse;
  const persisted = (data?.state?.data?.[LEADGEN_NAMESPACE] ?? mergedPayload) as LeadgenVer02StoredPayload;
  if (key) localPayloadCache.set(key, persisted);
  return {
    ok: true,
    state: persisted,
  };
}
