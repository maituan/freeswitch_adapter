import type { LeadgenVer02SessionState } from './sessionState';

export function buildPricingQuestionFromMissingSlots(missingSlots: string[]): string {
  if (missingSlots.includes('vehicleType')) {
    return 'Để em báo đúng phí, {gender} cho em xin loại xe của mình là xe con, bán tải hay xe tải ạ?';
  }
  if (missingSlots.includes('weightTons')) {
    return 'Dạ xe tải của {gender} trọng tải khoảng bao nhiêu tấn ạ để em báo giá chính xác?';
  }
  if (missingSlots.includes('numSeats') && missingSlots.includes('isBusiness')) {
    return 'Để em báo đúng phí, {gender} cho em xin xe mình mấy chỗ và có kinh doanh hay không ạ?';
  }
  if (missingSlots.includes('numSeats')) {
    return 'Dạ xe của {gender} là mấy chỗ ạ?';
  }
  if (missingSlots.includes('isBusiness')) {
    return 'Dạ xe của {gender} có kinh doanh hay không ạ?';
  }
  return 'Để em báo đúng phí, {gender} giúp em xác nhận lại thông tin xe nhé.';
}

export function normalizePurposeLabel(state: LeadgenVer02SessionState): string {
  if (typeof state.slots.isBusiness === 'boolean') {
    return state.slots.isBusiness ? 'kinh doanh' : 'không kinh doanh';
  }
  return state.slots.purpose || 'chưa rõ mục đích sử dụng';
}

export function formatCurrency(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return `${value.toLocaleString('vi-VN')} đồng`;
}

export function withGender(text: string, gender?: string): string {
  const resolvedGender = String(gender ?? 'mình').trim() || 'mình';
  return text.replace(/\{gender\}/g, resolvedGender);
}
