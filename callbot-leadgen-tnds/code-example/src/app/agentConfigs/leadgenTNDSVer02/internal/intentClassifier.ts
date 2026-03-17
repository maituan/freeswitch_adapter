import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const CLASSIFIER_CACHE_TTL_MS = 2 * 60 * 1000;
const CLASSIFIER_PROMPT_VERSION = 'ver02-contact-subtypes-v1';
const classifierCache = new Map<
  string,
  { value: LeadgenVer02TurnIntent; expiresAt: number }
>();

const LeadgenVer02TurnIntentZod = z.object({
  intentId: z.enum([
    'identity',
    'confirm',
    'no_hear',
    'silence',
    'pricing_quote',
    'pricing_support',
    'vehicle_info',
    'sales_accept',
    'contact_capture',
    'objection',
    'busy_callback',
    'wrong_number',
    'unclear',
  ]),
  intentGroup: z.enum([
    'opening',
    'pricing',
    'vehicle_info',
    'sales',
    'objection',
    'callback',
    'termination',
    'unclear',
  ]),
  objectionCaseType: z
    .enum([
      'sold_car',
      'not_using_car',
      'already_renewed',
      'still_valid',
      'company_car',
      'bought_elsewhere',
      'ask_family',
      'busy_or_callback',
      'wrong_number_or_relative',
      'general_refusal',
      'other',
    ])
    .nullable(),
  supportConcernType: z
    .enum([
      'trust_or_scam',
      'inspection_center',
      'multi_year',
      'price_compare',
      'price_too_high',
      'promo_or_gift',
      'other',
    ])
    .nullable(),
  contactCaptureType: z
    .enum([
      'zalo_confirmed',
      'no_zalo',
      'address_capture',
      'online_payment',
      'accounting_contact',
      'other',
    ])
    .nullable(),
  busyCallbackType: z
    .enum([
      'busy_close',
      'callback_request',
      'other',
    ])
    .nullable(),
  objectionCaseConfidence: z.number().min(0).max(1).nullable(),
  supportConcernConfidence: z.number().min(0).max(1).nullable(),
  contactCaptureConfidence: z.number().min(0).max(1).nullable(),
  busyCallbackConfidence: z.number().min(0).max(1).nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

export type LeadgenVer02TurnIntent = z.infer<typeof LeadgenVer02TurnIntentZod>;

function classifierCacheKey(
  message: string,
  context?: { agentName?: string; currentBuc?: string },
) {
  return JSON.stringify({
    version: CLASSIFIER_PROMPT_VERSION,
    message: message.trim().toLowerCase(),
    agentName: context?.agentName ?? 'unknown',
    currentBuc: context?.currentBuc ?? 'unknown',
  });
}

async function classifyWithSchema<T>(
  prompt: string,
  schemaName: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch('/api/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      useClassifierModel: true,
      temperature: 0,
      max_output_tokens: 160,
      input: [{ role: 'user', content: prompt }],
      text: { format: zodTextFormat(schema, schemaName) },
    }),
  });

  if (!response.ok) {
    return Promise.reject(new Error(`classifier_request_failed:${schemaName}`));
  }

  const data = (await response.json()) as { output_parsed?: unknown };
  return schema.parse(data.output_parsed);
}

export async function classifyLeadgenVer02Turn(
  message: string,
  context?: { agentName?: string; currentBuc?: string },
): Promise<LeadgenVer02TurnIntent> {
  const key = classifierCacheKey(message, context);
  const cached = classifierCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const prompt = `
Classify the latest Vietnamese customer utterance in an outbound car-insurance renewal call.
Return JSON only, strictly following the schema.

<context>
- current_agent: ${context?.agentName ?? 'unknown'}
- current_buc: ${context?.currentBuc ?? 'unknown'}
</context>

<message>
${message}
</message>

<intent_rules>
- identity: asks who is calling, from where, why caller has the number
- confirm: confirms identity or agrees to continue after opening, including brief continuers that mean "go ahead / keep talking"
- no_hear: cannot hear, asks to repeat
- silence: empty, filler, or no usable content
- pricing_quote: asks fee/price/discount/promo, compares price, says expensive
- pricing_support: purchase FAQ or purchase concern such as scam concern, distrust of online buying, inspection-center buying, multi-year renewal, asking about gifts/promotions
- vehicle_info: provides vehicle details such as type, seat count, business usage, expiry, tonnage
- sales_accept: agrees with quote or agrees to proceed
- contact_capture: provides or asks about zalo, email, address, payment, delivery
- objection: real refusal or negative business-state exception such as sold car, not using car, still valid, company car, bought elsewhere, asks family first
- busy_callback: busy or asks callback time
- wrong_number: wrong number, not owner, relative/unrelated person answers
- unclear: ambiguous or low confidence
</intent_rules>

<priority_rules>
- In BUC_1 opening context, short continuers like "em nói đi", "nói đi em", "ừ em nói tiếp đi", "vâng em nói đi" mean the customer agrees to continue, so prefer confirm over unclear.
- If the customer says they can hear now and also asks about fee / discount / promotion, prefer pricing_quote over no_hear or confirm.
- If the customer mainly expresses a purchase concern but is still discussing the insurance offer, prefer pricing_support over objection.
- "Scared of scam", "afraid of being tricked", "not trusting online", "is this reputable?" are pricing_support, not objection.
- "Go buy at inspection center", "buy 2-3 years", "what gifts / what promotion", "why more expensive / compare with another place" are pricing_support unless the customer clearly ends the conversation.
- Use objection only when the customer clearly refuses to continue, says no need / not interested / stop calling, or provides a hard business-state blocker.
- If the customer both doubts trust and still seeks explanation, classify as pricing_support.
- If the customer provides a contact detail or confirms a delivery/contact channel, prefer contact_capture over sales_accept.
- If the customer says they are busy and only want to end quickly, prefer busy_callback with busyClose subtype rather than objection.
</priority_rules>

<support_concern_rules>
- Fill supportConcernType only if intent is pricing_support.
- trust_or_scam: scam concern, distrust of online purchase, asking whether seller is reputable or safe
- inspection_center: wants to buy at inspection center / says inspection center is easier
- multi_year: asks about buying 2-3 years
- price_compare: says another place is cheaper / compares with another quote
- price_too_high: says expensive / too high / hard to afford
- promo_or_gift: asks about discount, promotion, gift
- other: sales-support concern exists but none of the above fit well
- If intent is not pricing_support, set supportConcernType = null and supportConcernConfidence = null
</support_concern_rules>

<contact_capture_rules>
- Fill contactCaptureType only if intent is contact_capture.
- zalo_confirmed: confirms this phone has Zalo, agrees to receive via current number, agrees to add Zalo
- no_zalo: says no Zalo / does not use Zalo, asks to use email or phone instead
- address_capture: provides or confirms delivery address
- online_payment: asks to transfer, pay online, bank transfer, payment method online
- accounting_contact: provides accounting / responsible staff phone number or contact person for company-car case
- other: contact_capture exists but none of the above fit well
- If intent is not contact_capture, set contactCaptureType = null and contactCaptureConfidence = null
</contact_capture_rules>

<busy_callback_rules>
- Fill busyCallbackType only if intent is busy_callback.
- busy_close: customer only wants to end quickly, says busy now / call later / another time, without giving a scheduling window
- callback_request: customer asks callback or gives a rough time / time window
- other: busy_callback exists but subtype is unclear
- If intent is not busy_callback, set busyCallbackType = null and busyCallbackConfidence = null
</busy_callback_rules>

<objection_case_rules>
- Fill objectionCaseType only if intent is objection, busy_callback, or wrong_number.
- sold_car: customer sold the car and may have another car
- not_using_car: customer no longer uses any car / that car is no longer in use
- already_renewed: customer already renewed or already bought insurance
- still_valid: customer says insurance is still valid / not due yet
- company_car: customer says this is a company car or asks to contact accounting / responsible staff
- bought_elsewhere: customer bought at another place such as inspection center or another seller
- ask_family: customer wants to ask spouse/family/friend first
- busy_or_callback: customer is busy or requests callback later
- wrong_number_or_relative: wrong number, not owner, another person answers
- general_refusal: customer says no need, not interested, does not want to continue
- other: use only if objection exists but none of the above fit well
- If intent is not objection-like, set objectionCaseType = null and objectionCaseConfidence = null
</objection_case_rules>

<examples>
- "em ở bên nào ý nhỉ" => identity
- "em nói đi" => confirm
- "ừ em nói tiếp đi" => confirm
- "vâng em cứ nói đi" => confirm
- "anh nghe được rồi, em xem giá ưu đãi thế nào" => pricing_quote
- "nghe được rồi, báo giá giúp anh" => pricing_quote
- "sợ bị lừa lắm" => pricing_support + trust_or_scam
- "mua ở đăng kiểm cho nhanh" => pricing_support + inspection_center
- "mua 2 năm có giảm không" => pricing_support + multi_year
- "bên kia rẻ hơn" => pricing_support + price_compare
- "đắt quá" => pricing_support + price_too_high unless the customer clearly refuses to continue
- "anh có zalo số này" => contact_capture + zalo_confirmed
- "anh không có zalo, gửi email cho anh" => contact_capture + no_zalo
- "địa chỉ là 12 nguyễn trãi" => contact_capture + address_capture
- "anh chuyển khoản online được không" => contact_capture + online_payment
- "số kế toán là 0984..." => contact_capture + accounting_contact
- "anh đang bận, để hôm khác gọi lại nhé" => busy_callback + busy_close
- "chiều gọi lại nhé" => busy_callback + callback_request
- "không cần đâu em" => objection + general_refusal
- "xe này bán rồi" => objection + sold_car
</examples>
`;

  const result = await classifyWithSchema(
    prompt,
    'leadgen_ver02_turn_intent',
    LeadgenVer02TurnIntentZod,
  );
  classifierCache.set(key, {
    value: result,
    expiresAt: Date.now() + CLASSIFIER_CACHE_TTL_MS,
  });
  return result;
}
