import type { LeadgenVer02Memory } from './sessionState';

export function appendMemorySummary(
  current: LeadgenVer02Memory,
  fragment: string,
  updatedBy: string,
): LeadgenVer02Memory {
  const nextSummary = [current.summary, fragment]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .join(' ');

  const compactSummary = nextSummary.length > 700 ? nextSummary.slice(nextSummary.length - 700) : nextSummary;

  return {
    summary: compactSummary,
    lastUpdatedBy: updatedBy,
    updatedAt: new Date().toISOString(),
  };
}
