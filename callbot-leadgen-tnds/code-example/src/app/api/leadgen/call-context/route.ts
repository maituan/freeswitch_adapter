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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leadId = String(searchParams.get('leadId') ?? '').trim();
  const phoneNumber = String(searchParams.get('phoneNumber') ?? '').trim();

  const defaultLeadId = 'LD001';
  let lead: CallLead | null = null;
  if (leadId) {
    lead = fakeLeads.find((x) => x.leadId === leadId) ?? null;
  } else if (phoneNumber) {
    lead = fakeLeads.find((x) => x.phoneNumber === phoneNumber) ?? null;
  } else {
    // Demo fallback for local testing when no key is passed from FE.
    lead = fakeLeads.find((x) => x.leadId === defaultLeadId) ?? null;
  }

  return NextResponse.json({
    ok: true,
    found: Boolean(lead),
    lead,
  });
}
