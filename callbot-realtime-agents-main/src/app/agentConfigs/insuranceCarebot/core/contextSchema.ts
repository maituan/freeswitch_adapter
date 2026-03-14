export type CampaignType =
  | 'renewal_reminder'
  | 'post_sale_safety'
  | 'post_sale_digital_card'
  | 'holiday_care'
  | 'activation_365'
  | 'monthly_checkin';

export type PolicyStatus = 'active' | 'expiring' | 'expired' | 'unknown';
export type PreferredPronoun = 'anh' | 'chi';

export type CarebotContext = {
  campaignType: CampaignType;
  triggerReason: string;
  scheduledAt?: string;
  customerId: string;
  customerName: string;
  phoneNumber: string;
  preferredPronoun?: PreferredPronoun;
  licensePlate?: string;
  expiryDate?: string;
  baseFee?: string;
  discountPercent?: string;
  discountedFee?: string;
  policyStatus?: PolicyStatus;
  discountInfo?: string;
  agentName: string;
  companyName: string;
  hotlineNumber: string;
  zaloEnabled?: boolean;
  lastInteractionSummary?: string;
};

export type CarebotRuntimeContextOverrides = Partial<CarebotContext> & {
  campaignType?: CampaignType;
};

const defaultContext: CarebotContext = {
  campaignType: 'renewal_reminder',
  triggerReason: 'scheduled_campaign',
  customerId: 'unknown_customer',
  customerName: 'khach hang',
  phoneNumber: 'unknown_phone',
  preferredPronoun: 'anh',
  policyStatus: 'unknown',
  agentName: 'Thảo',
  companyName: 'CareBot Auto365',
  hotlineNumber: '1900-0000',
  zaloEnabled: true,
};

let runtimeContext: CarebotContext = { ...defaultContext };

export function setCarebotRuntimeContext(next: CarebotRuntimeContextOverrides) {
  runtimeContext = {
    ...runtimeContext,
    ...next,
  };
}

export function getCarebotRuntimeContext(): CarebotContext {
  return { ...runtimeContext };
}

export function resetCarebotRuntimeContext() {
  runtimeContext = { ...defaultContext };
}
