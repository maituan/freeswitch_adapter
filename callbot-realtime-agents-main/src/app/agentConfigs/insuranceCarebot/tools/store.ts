import type { CarebotCallResult } from '../core/outcomeSchema';

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

const BASE = '/api/carebot/store';

export async function upsertCrmRecord(record: CarebotCallResult): Promise<void> {
  await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'crm', record }),
  });
}

export async function upsertCallbackRecord(
  record: Omit<CallbackRecord, 'createdAt'>,
): Promise<CallbackRecord> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'callback', ...record }),
  });
  const json = await res.json();
  return json.record as CallbackRecord;
}

export async function upsertActivationRecord(
  customerId: string,
  activated = true,
): Promise<ActivationRecord> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'activation', customerId, activated }),
  });
  const json = await res.json();
  return json.record as ActivationRecord;
}

export async function getCarebotStoreSnapshot(): Promise<{
  crmRecords: CarebotCallResult[];
  callbacks: CallbackRecord[];
  activations: ActivationRecord[];
}> {
  const res = await fetch(BASE);
  const json = await res.json();
  return {
    crmRecords: json.crmRecords ?? [],
    callbacks: json.callbacks ?? [],
    activations: json.activations ?? [],
  };
}
