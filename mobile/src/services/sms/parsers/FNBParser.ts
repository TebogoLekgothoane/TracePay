import { BankParser, BankParserResult, RawSMS } from '../sms.types';
import {
  canParseBankSms,
  parseAmount,
  parseDate,
  normaliseMerchant,
  scoreConfidence,
} from '../sms.utils';

/**
 * FNB SMS examples this parser handles:
 *
 *   "FNB: R250.00 was debited from your account ending 1234 at WOOLWORTHS on 10/06/2025.
 *    Available balance: R4 500.00. Ref: 123456789."
 *
 *   "FNB: R1 200.00 was credited to your account ending 5678 from JOHN DOE on 09/06/2025.
 *    Available balance: R5 700.00."
 *
 *   "FNB: ATM withdrawal of R500.00 on 08/06/2025. Card ending 1234.
 *    Available balance: R3 200.00. Ref: 987654321."
 */
const FNB_NON_TRANSACTION =
  /congratulations|pre-?approved|loan\s+offer|you\s+have\s+won|competition|ebucks|marketing|click\s+here|call\s+\d/i;

export const FNBParser: BankParser = {
  bankName: 'FNB',
  senderPatterns: [/^FNB$/i, /^FNBSA$/i],
  // Real FNB alerts always start with "FNB:" — avoid loose "first national bank" in promos/scams.
  bodyPatterns: [/^FNB:/i],

  canParse(sms: RawSMS): boolean {
    return canParseBankSms(sms, this.senderPatterns, this.bodyPatterns);
  },

  parse(sms: RawSMS): BankParserResult {
    const body = sms.body.trim();

    if (FNB_NON_TRANSACTION.test(body)) {
      return { success: false, reason: 'Promotional or non-transaction message' };
    }

    // ── Transaction type ────────────────────────────────────────────────────
    const isDebit    = /debited|debit|withdrawal|purchase/i.test(body);
    const isCredit   = /credited|credit|deposit/i.test(body);
    const isReversal = /reversal|reversed/i.test(body);

    const type = isReversal ? 'reversal' : isCredit ? 'credit' : isDebit ? 'debit' : 'unknown';

    if (type === 'unknown') {
      return { success: false, reason: 'Not a debit/credit transaction' };
    }

    // ── Amount ───────────────────────────────────────────────────────────────
    const amountMatch = body.match(/R\s*([\d\s,]+\.?\d*)/i);
    const amount = amountMatch ? parseAmount(amountMatch[1]) : null;
    if (!amount) {
      return { success: false, reason: 'No amount found' };
    }

    // ── Account last 4 ───────────────────────────────────────────────────────
    const accountMatch = body.match(/account\s+ending\s+(\d{4})|card\s+ending\s+(\d{4})/i);
    const accountLast4 = accountMatch?.[1] ?? accountMatch?.[2];

    // ── Merchant / counterparty ──────────────────────────────────────────────
    const merchantMatch =
      body.match(/(?:at|from|to)\s+([A-Z][A-Z\s\*&'.\-]+?)(?:\s+on\s+\d|\s+Ref|\s+Available|\.$)/i);
    const merchant = merchantMatch ? normaliseMerchant(merchantMatch[1]) : undefined;

    // ── Date ─────────────────────────────────────────────────────────────────
    const dateMatch = body.match(/on\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i);
    const timestamp = parseDate(dateMatch?.[1], sms.date);

    // ── Available balance ────────────────────────────────────────────────────
    const balanceMatch = body.match(/[Aa]vailable\s+balance[:\s]+R\s*([\d\s,]+\.?\d*)/i);
    const availableBalance = balanceMatch ? parseAmount(balanceMatch[1]) ?? undefined : undefined;

    // ── Reference ────────────────────────────────────────────────────────────
    const refMatch = body.match(/[Rr]ef[:\s#]+(\w+)/);
    const reference = refMatch?.[1];

    const summary = isReversal
      ? 'Transaction reversed'
      : isCredit
        ? 'Deposit received'
        : /withdrawal/i.test(body)
          ? 'ATM withdrawal'
          : 'Card purchase';

    const confidence = scoreConfidence(true, !!merchant, !!dateMatch, !!availableBalance);

    return {
      success: true,
      transaction: {
        bank: 'FNB',
        type,
        amount,
        currency: 'ZAR',
        merchant,
        summary,
        reference,
        accountLast4,
        availableBalance,
        timestamp,
        confidence,
        rawBody: body,
      },
    };
  },
};