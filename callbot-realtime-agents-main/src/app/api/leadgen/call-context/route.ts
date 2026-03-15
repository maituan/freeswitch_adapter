import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type CallLead = {
  leadId: string;
  phoneNumber: string;
  gender: string;
  name: string;
  BKS: string;
  fullName: string;
  plateNumber: string;
  renewalMonth: string;
  seats?: number;
  isBusiness?: boolean;
};

// In-memory store for updates made during calls (replaces leadStore in tools.ts).
// Key: "lead:<leadId>" or "phone:<phoneNumber>"
const leadUpdates = new Map<string, Record<string, any>>();

const fakeLeads: CallLead[] = [
  {
    leadId: 'LD001',
    phoneNumber: '0984907246',
    gender: 'Anh',
    name: 'Bảo',
    BKS: '29A-86256',
    fullName: 'Nguyễn Quốc Bảo',
    plateNumber: '29A-86256',
    renewalMonth: '10',
    seats: 5,
    isBusiness: false,
  },
  {
    leadId: 'LD002',
    phoneNumber: '0909000002',
    gender: 'Chị',
    name: 'Lan',
    BKS: '51H-67890',
    fullName: 'Tran Thi Lan',
    plateNumber: '51H-67890',
    renewalMonth: '11',
  },
];

function resolveKey(leadId?: string, phoneNumber?: string): string | null {
  if (leadId) return `lead:${leadId}`;
  if (phoneNumber) return `phone:${phoneNumber}`;
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leadId = String(searchParams.get('leadId') ?? '').trim();
  const phoneNumber = String(searchParams.get('phoneNumber') ?? '').trim();

  const defaultLeadId = 'LD001';
  let base: CallLead | null = null;
  if (leadId) {
    base = fakeLeads.find((x) => x.leadId === leadId) ?? null;
  } else if (phoneNumber) {
    base = fakeLeads.find((x) => x.phoneNumber === phoneNumber) ?? null;
  } else {
    base = fakeLeads.find((x) => x.leadId === defaultLeadId) ?? null;
  }

  const key = resolveKey(leadId || base?.leadId, phoneNumber || base?.phoneNumber);
  const updates = key ? (leadUpdates.get(key) ?? null) : null;
  const lead = base || updates ? { ...(base ?? {}), ...(updates ?? {}) } : null;

  return NextResponse.json({ ok: true, found: Boolean(lead), lead });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, any>;
  const { leadId, phoneNumber, ...fields } = body;

  // Resolve leadId from fakeLeads if only phoneNumber is provided,
  // so the key is consistent with how GET resolves it.
  const resolvedLeadId = leadId
    || fakeLeads.find((x) => x.phoneNumber === phoneNumber)?.leadId;

  const key = resolveKey(resolvedLeadId, phoneNumber);
  if (!key) return NextResponse.json({ ok: false, error: 'leadId or phoneNumber required' }, { status: 400 });

  const existing = leadUpdates.get(key) ?? {};
  const updated = { ...existing, ...fields, leadId, phoneNumber, updatedAt: new Date().toISOString() };
  leadUpdates.set(key, updated);

  return NextResponse.json({ ok: true, lead: updated });
}
