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

const crmStore = new Map<string, CarebotCallResult>();
const callbackStore = new Map<string, CallbackRecord>();
const activationStore = new Map<string, ActivationRecord>();

export function upsertCrmRecord(record: CarebotCallResult) {
  crmStore.set(record.customerId, record);
}

export function upsertCallbackRecord(record: Omit<CallbackRecord, 'createdAt'>) {
  const next: CallbackRecord = {
    ...record,
    createdAt: new Date().toISOString(),
  };
  callbackStore.set(record.customerId, next);
  return next;
}

export function upsertActivationRecord(customerId: string, activated = true) {
  const next: ActivationRecord = {
    customerId,
    activated,
    activatedAt: new Date().toISOString(),
  };
  activationStore.set(customerId, next);
  return next;
}

export function getCarebotStoreSnapshot() {
  return {
    crmRecords: Array.from(crmStore.values()),
    callbacks: Array.from(callbackStore.values()),
    activations: Array.from(activationStore.values()),
  };
}
