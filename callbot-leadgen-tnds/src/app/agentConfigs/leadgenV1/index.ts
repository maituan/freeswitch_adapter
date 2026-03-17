import { createMainSaleAgent } from './mainSale/mainSaleAgent';

export const leadgenV1Scenario = [createMainSaleAgent()];

export const leadgenV1Metadata = {
  isTextOnly: true,
};

export { setLeadgenV1RuntimeContext } from './tools';
