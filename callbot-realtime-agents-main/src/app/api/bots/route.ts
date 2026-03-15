import { NextResponse } from 'next/server';
import { allAgentSets, agentSetMetadata, defaultAgentSetKey } from '@/app/agentConfigs';

export const runtime = 'nodejs';

const BOT_LABELS: Record<string, string> = {
  simpleHandoff: 'Simple Handoff',
  customerServiceRetail: 'Customer Service Retail',
  chatSupervisor: 'Chat Supervisor',
  textOnly: 'Text Only',
  hotlineAI: 'Hotline AI',
  motheAI: 'Mothe AI',
  bidvBot: 'BIDV Bot',
  abicHotline: 'ABIC Hotline',
  leadgenTNDS: 'LeadGen TNDS',
  carebotAuto365: 'Carebot Auto 365',
};

export async function GET() {
  const bots = Object.keys(allAgentSets).map((botId) => ({
    botId,
    label: BOT_LABELS[botId] ?? botId,
    isTextOnly: agentSetMetadata[botId]?.isTextOnly ?? false,
    isDefault: botId === defaultAgentSetKey,
  }));

  return NextResponse.json({ bots });
}
