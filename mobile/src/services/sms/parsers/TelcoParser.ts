import {
  FinancialAlertParser,
  FinancialAlertParserResult,
  RawSMS,
  TransactionType,
} from '../sms.types';
import {
  canParseFinancialAlertSms,
  normaliseMerchant,
  parseAmount,
  parseDate,
  scoreConfidence,
} from '../sms.utils';

type TelcoProvider = 'MTN' | 'VODACOM';

interface TelcoProviderConfig {
  provider: TelcoProvider;
  senderPatterns: RegExp[];
  bodyPatterns: RegExp[];
  merchant: string;
}

const NON_TRANSACTION_PATTERN =
  /\b(?:one[-\s]?time\s*(?:pin|password)|otp|verification\s*code|pin\s*(?:code)?|promotion|special\s+offer|competition|unsubscribe|terms\s+(?:and|&)\s+conditions)\b/i;

const AMOUNT_PATTERN = /(?:R|ZAR)\s*([\d\s,]+(?:\.\d{1,2})?)/i;
const REFERENCE_PATTERN = /\b(?:ref(?:erence)?|transaction\s*(?:id|number)|txn)\s*[:#-]?\s*([A-Z0-9-]{4,})/i;

function getTransactionType(body: string): TransactionType {
  if (/\b(?:reversal|reversed|refunded)\b/i.test(body)) return 'reversal';
  if (/\b(?:received|credited|deposit(?:ed)?|refund)\b/i.test(body)) return 'credit';
  return 'debit';
}

function getSummary(body: string): string | null {
  if (/\b(?:airtime|recharge|top[\s-]?up)\b/i.test(body)) return 'Airtime purchase';
  if (/\b(?:data\s*(?:bundle|purchase|recharge)|bundle\s*(?:purchase|activation))\b/i.test(body)) {
    return 'Data bundle purchase';
  }
  if (/\b(?:vas|value[-\s]?added|premium\s*sms|content\s*(?:charge|service)|subscription\s*(?:fee|charge))\b/i.test(body)) {
    return 'Value-added service charge';
  }
  if (/\b(?:service|transaction|transfer|cash[\s-]?out)\s*fee\b/i.test(body)) return 'MoMo transaction fee';
  if (/\b(?:cash[\s-]?out|withdrawal)\b/i.test(body)) return 'MoMo cash-out';
  if (/\b(?:momo|vodapay)\b.*\b(?:sent|paid|payment|transfer(?:red)?)\b/i.test(body)) {
    return 'Mobile money payment';
  }
  if (/\b(?:sent|paid|payment|transfer(?:red)?)\b/i.test(body)) return 'Mobile money payment';
  return null;
}

function parseTelcoTransaction(
  sms: RawSMS,
  config: TelcoProviderConfig
): FinancialAlertParserResult {
  const body = sms.body.trim();

  if (NON_TRANSACTION_PATTERN.test(body)) {
    return { success: false, reason: 'OTP or promotional message' };
  }

  const summary = getSummary(body);
  if (!summary) {
    return { success: false, reason: 'Not a supported financial alert' };
  }

  const amountMatch = body.match(AMOUNT_PATTERN);
  const amount = amountMatch ? parseAmount(amountMatch[1]) : null;
  if (!amount || amount <= 0) {
    return { success: false, reason: 'No valid transaction amount found' };
  }

  const reference = body.match(REFERENCE_PATTERN)?.[1];
  const type = getTransactionType(body);
  const merchant = normaliseMerchant(
    summary.startsWith('MoMo') ? `${config.merchant} MoMo` : config.merchant
  );

  return {
    success: true,
    transaction: {
      bank: config.provider,
      type,
      amount,
      currency: 'ZAR',
      merchant,
      summary,
      reference,
      timestamp: parseDate(undefined, sms.date),
      confidence: scoreConfidence(true, true, false, Boolean(reference)),
      rawBody: body,
    },
  };
}

function isSupportedTelcoTransaction(
  sms: RawSMS,
  config: TelcoProviderConfig
): boolean {
  const body = sms.body.trim();
  return (
    canParseFinancialAlertSms(sms, config.senderPatterns, config.bodyPatterns) &&
    !NON_TRANSACTION_PATTERN.test(body) &&
    getSummary(body) !== null &&
    AMOUNT_PATTERN.test(body)
  );
}

function createTelcoParser(config: TelcoProviderConfig): FinancialAlertParser {
  return {
    providerName: config.provider,
    senderPatterns: config.senderPatterns,
    bodyPatterns: config.bodyPatterns,
    canParse(sms) {
      return isSupportedTelcoTransaction(sms, config);
    },
    parse(sms) {
      return parseTelcoTransaction(sms, config);
    },
  };
}

export const MTNParser = createTelcoParser({
  provider: 'MTN',
  senderPatterns: [/^MTN(?:\s*(?:SA|MOMO|MOBILE\s*MONEY))?$/i, /^MTNMOMO$/i],
  bodyPatterns: [/\bMTN(?:\s+MoMo)?\b/i],
  merchant: 'MTN',
});

export const VodacomParser = createTelcoParser({
  provider: 'VODACOM',
  senderPatterns: [/^VODACOM(?:\s*(?:SA|MOMO))?$/i, /^VODAPAY$/i],
  bodyPatterns: [/\b(?:Vodacom|VodaPay)\b/i],
  merchant: 'Vodacom',
});
