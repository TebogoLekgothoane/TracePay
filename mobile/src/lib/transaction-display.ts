import { ParsedTransaction, TransactionType } from '@/services/sms/sms.types';
import { normaliseMerchant } from '@/services/sms/sms.utils';

const TYPE_LABELS: Record<TransactionType, string> = {
  debit: 'Debit',
  credit: 'Credit',
  reversal: 'Reversed',
  unknown: 'Activity',
};

const CAPITEC_KIND_LABELS: Record<string, string> = {
  purch: 'Card purchase',
  cr: 'Deposit received',
  'atm wd': 'ATM withdrawal',
  fee: 'Bank fee',
  notify: 'Notification charge',
  payment: 'Payment',
  dep: 'Deposit',
};

function stripCapitecTail(text: string): string {
  return text
    .replace(/\s+\d{2}[A-Za-z]{3}\d{2}.*$/i, '')
    .replace(/\s+Avail\b.*$/i, '')
    .trim();
}

function describeCapitec(body: string): { headline?: string; summary?: string } {
  const match = body.match(/^Capitec:\s*([A-Za-z\s]+?)\s+R([\d,\s.]+)\s+(.+)$/i);
  if (!match) return {};

  const kind = match[1].trim().toLowerCase();
  const detail = stripCapitecTail(match[3]);
  const summary = CAPITEC_KIND_LABELS[kind] ?? `${match[1].trim()} transaction`;

  if (kind === 'purch' || kind === 'cr' || kind === 'atm wd') {
    return {
      headline: detail ? normaliseMerchant(detail) : undefined,
      summary,
    };
  }

  if (kind === 'fee' || kind === 'notify') {
    return {
      headline: detail ? normaliseMerchant(detail) : 'Bank charge',
      summary,
    };
  }

  return {
    headline: detail ? normaliseMerchant(detail) : undefined,
    summary,
  };
}

function describeFNB(body: string): { headline?: string; summary?: string } {
  if (!/^FNB:/i.test(body)) return {};

  let summary: string | undefined;
  if (/withdrawal/i.test(body)) summary = 'ATM withdrawal';
  else if (/debited|purchase/i.test(body)) summary = 'Card purchase';
  else if (/credited|deposit/i.test(body)) summary = 'Deposit received';
  else if (/reversal|reversed/i.test(body)) summary = 'Transaction reversed';

  const merchantMatch = body.match(
    /(?:at|from|to)\s+([A-Z][A-Z\s*'.\-]+?)(?:\s+on\s+\d|\s+Ref|\s+Available|\.$)/i
  );

  return {
    headline: merchantMatch ? normaliseMerchant(merchantMatch[1]) : undefined,
    summary,
  };
}

function describeABSA(body: string): { headline?: string; summary?: string } {
  if (!/^Absa:/i.test(body)) return {};

  if (/CashSend/i.test(body)) {
    const amountMatch = body.match(/R\s*([\d\s,]+\.?\d*)/i);
    return {
      headline: amountMatch ? `CashSend R${amountMatch[1].trim()}` : 'CashSend voucher',
      summary: 'CashSend voucher',
    };
  }

  if (/locked|unlocked/i.test(body)) {
    return { headline: 'Card security', summary: 'Card security alert' };
  }

  let summary: string | undefined;
  if (/debited/i.test(body)) summary = 'Card purchase';
  else if (/credited/i.test(body)) summary = 'Deposit received';
  else if (/reversal|reversed/i.test(body)) summary = 'Transaction reversed';

  const merchantMatch = body.match(
    /(?:at|by)\s+([A-Z][A-Z0-9\s&*'.\-]+?)(?:\s+on\s+\d|\s+Bal|\s+Ref|\.$)/i
  );

  return {
    headline: merchantMatch ? normaliseMerchant(merchantMatch[1]) : undefined,
    summary,
  };
}

function describeStandardBank(body: string): { headline?: string; summary?: string } {
  if (!/^Std\s*Bk:/i.test(body) && !/\bStandard\s*Bank\b/i.test(body)) return {};

  let summary: string | undefined;
  if (/Purch/i.test(body)) summary = 'Card purchase';
  else if (/rcvd|received|credit|deposit/i.test(body)) summary = 'Payment received';
  else if (/ATM/i.test(body)) summary = 'ATM withdrawal';
  else if (/reversal|reversed/i.test(body)) summary = 'Transaction reversed';
  else summary = 'Transaction';

  const merchantMatch = body.match(
    /R[\d\s,.]+\s+([A-Z][A-Z0-9\s&*'.\-]+?)\s+\d{2}[\/\-]\d{2}/i
  );

  return {
    headline: merchantMatch ? normaliseMerchant(merchantMatch[1]) : undefined,
    summary,
  };
}

function describeTymeBank(body: string): { headline?: string; summary?: string } {
  if (!/^TymeBank/i.test(body)) return {};

  if (/one\s*time\s*pin|verification\s*code|\bOTP\b/i.test(body)) {
    return { headline: 'Payment authorisation', summary: 'OTP — not a completed transaction' };
  }

  let summary: string | undefined;
  if (/spent/i.test(body)) summary = 'Card purchase';
  else if (/received|credit|deposit/i.test(body)) summary = 'Payment received';
  else if (/debited|paid/i.test(body)) summary = 'Payment';

  const merchantMatch = body.match(
    /(?:spent\s+R[\d,\s.]+\s+at|at)\s+([A-Z][A-Z0-9\s&*'.\-]+?)(?:\.\s*Available|\.\s*$)/i
  );

  return {
    headline: merchantMatch ? normaliseMerchant(merchantMatch[1]) : undefined,
    summary,
  };
}

function describeFromRawBody(tx: ParsedTransaction): { headline?: string; summary?: string } {
  const body = tx.rawBody.trim();

  switch (tx.bank) {
    case 'CAPITEC':
      return describeCapitec(body);
    case 'FNB':
      return describeFNB(body);
    case 'ABSA':
      return describeABSA(body);
    case 'STANDARD_BANK':
      return describeStandardBank(body);
    case 'TYMEBANK':
      return describeTymeBank(body);
    default:
      if (/^Capitec:/i.test(body)) return describeCapitec(body);
      if (/^FNB:/i.test(body)) return describeFNB(body);
      if (/^Absa:/i.test(body)) return describeABSA(body);
      if (/^Std\s*Bk:/i.test(body)) return describeStandardBank(body);
      if (/^TymeBank/i.test(body)) return describeTymeBank(body);
      return {};
  }
}

/** Fill in headline/summary from raw SMS when older parses left them blank. */
export function enrichParsedTransaction(tx: ParsedTransaction): ParsedTransaction {
  const derived = describeFromRawBody(tx);
  return {
    ...tx,
    merchant: tx.merchant ?? derived.headline,
    summary: tx.summary ?? derived.summary,
  };
}

export function getTransactionHeadline(tx: ParsedTransaction): string {
  const enriched = enrichParsedTransaction(tx);
  return enriched.merchant ?? enriched.summary ?? `${enriched.bank} ${TYPE_LABELS[enriched.type].toLowerCase()}`;
}

export function getTransactionSummary(tx: ParsedTransaction): string {
  const enriched = enrichParsedTransaction(tx);
  const parts: string[] = [TYPE_LABELS[enriched.type]];

  if (enriched.summary) {
    parts.push(enriched.summary);
  } else if (enriched.rawBody) {
    const snippet = enriched.rawBody.replace(/\s+/g, ' ').trim();
    parts.push(snippet.length > 72 ? `${snippet.slice(0, 72)}…` : snippet);
  }

  if (enriched.availableBalance != null) {
    parts.push(`Balance R${enriched.availableBalance.toFixed(2)}`);
  }

  return parts.join(' · ');
}

export function isValidStoredTransaction(tx: ParsedTransaction): boolean {
  if (tx.type === 'unknown') return false;
  if (tx.amount <= 0) return false;
  return true;
}
