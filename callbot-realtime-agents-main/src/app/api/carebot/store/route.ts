import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Types (mirrors insuranceCarebot/core/outcomeSchema.ts — no import to avoid
// bundling agent code into the API layer)
// ---------------------------------------------------------------------------
type CarebotCallResult = {
  customerId: string;
  callOutcome: string;
  nextAction: string;
  structuredNotes: string;
  timestamp: string;
};

type CallbackRecord = {
  customerId: string;
  datetime: string;
  reason: string;
  createdAt: string;
};

type ActivationRecord = {
  customerId: string;
  activated: boolean;
  activatedAt: string;
};

// ---------------------------------------------------------------------------
// In-memory stores — intentional shared storage, same role as a DB table.
// Key: customerId. Replace Maps with DB calls when ready.
// ---------------------------------------------------------------------------
const crmStore = new Map<string, CarebotCallResult>();
const callbackStore = new Map<string, CallbackRecord>();
const activationStore = new Map<string, ActivationRecord>();

// ---------------------------------------------------------------------------
// GET /api/carebot/store — full snapshot
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    ok: true,
    crmRecords: Array.from(crmStore.values()),
    callbacks: Array.from(callbackStore.values()),
    activations: Array.from(activationStore.values()),
  });
}

// ---------------------------------------------------------------------------
// POST /api/carebot/store — upsert a record
// Body: { type: 'crm', record: CarebotCallResult }
//     | { type: 'callback', customerId, datetime, reason }
//     | { type: 'activation', customerId, activated? }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const { type } = body;

  if (type === 'crm') {
    const record = body.record as CarebotCallResult;
    if (!record?.customerId) {
      return NextResponse.json({ ok: false, error: 'record.customerId required' }, { status: 400 });
    }
    crmStore.set(record.customerId, record);
    return NextResponse.json({ ok: true, record });
  }

  if (type === 'callback') {
    const { customerId, datetime, reason } = body as {
      customerId: string; datetime: string; reason: string;
    };
    if (!customerId) {
      return NextResponse.json({ ok: false, error: 'customerId required' }, { status: 400 });
    }
    const record: CallbackRecord = { customerId, datetime, reason, createdAt: new Date().toISOString() };
    callbackStore.set(customerId, record);
    return NextResponse.json({ ok: true, record });
  }

  if (type === 'activation') {
    const { customerId, activated = true } = body as { customerId: string; activated?: boolean };
    if (!customerId) {
      return NextResponse.json({ ok: false, error: 'customerId required' }, { status: 400 });
    }
    const record: ActivationRecord = { customerId, activated, activatedAt: new Date().toISOString() };
    activationStore.set(customerId, record);
    return NextResponse.json({ ok: true, record });
  }

  return NextResponse.json({ ok: false, error: 'type must be crm | callback | activation' }, { status: 400 });
}
