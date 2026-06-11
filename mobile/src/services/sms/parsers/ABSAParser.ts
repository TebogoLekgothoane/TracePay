import { BankParser, BankParserResult, RawSMS } from '../sms.types';
import {
  parseAmount,
  parseDate,
  normaliseMerchant,
  scoreConfidence,
} from '../sms.utils';

/**
 * ABSA SMS examples:
 *
 *   "ABSA: Your account *1234 was debited R450.00 at PICK N PAY on 2025/06/10.
 *    Bal: R3 250.00. Ref: 000123456789."
 *
 *   "ABSA: Your account *5678 was credited R2 000.00 by EFT DEPOSIT on 2025/06/09.
 *    Bal: R5 250.00."
 */
export const ABSAParser: BankParser = {
  bankName: 'ABSA',
  senderPatterns: [/^ABSA$/i, /^ABSA\s*BANK/i],

  canParse(sms: RawSMS): boolean {
    return this.senderPatterns.some((p) => p.test(sms.address.trim()));
  },

  parse(sms: RawSMS): BankParserResult {
    const body = sms.body;

    const isCredit   = /credited/i.test(body);
    const isReversal = /reversal|reversed/i.test(body);
    const type = isReversal ? 'reversal' : isCredit ? 'credit' : 'debit';

    // ── Amount ────────────────────────────────────────────────────────────────
    const amountMatch = body.match(/(?:debited|credited)\s+R\s*([\d\s,]+\.?\d*)/i);
    const amount = amountMatch ? parseAmount(amountMatch[1]) : null;
    if (!amount) return { success: false, reason: 'No amount found' };

    // ── Account ───────────────────────────────────────────────────────────────
    const accountMatch = body.match(/account\s+\*?(\d{4})/i);
    const accountLast4 = accountMatch?.[1];

    // ── Merchant ──────────────────────────────────────────────────────────────
    const merchantMatch = body.match(/(?:at|by)\s+([A-Z][A-Z0-9\s&*'.\-]+?)(?:\s+on\s+\d|\s+Bal|\s+Ref|\.$)/i);
    const merchant = merchantMatch ? normaliseMerchant(merchantMatch[1]) : undefined;

    // ── Date (yyyy/mm/dd) ─────────────────────────────────────────────────────
    const dateMatch = body.match(/on\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
    const timestamp = parseDate(dateMatch?.[1], sms.date);

    // ── Balance ───────────────────────────────────────────────────────────────
    const balanceMatch = body.match(/Bal[:\s]+R\s*([\d\s,]+\.?\d*)/i);
    const availableBalance = balanceMatch ? parseAmount(balanceMatch[1]) ?? undefined : undefined;

    // ── Reference ─────────────────────────────────────────────────────────────
    const refMatch = body.match(/[Rr]ef[:\s]+(\w+)/);
    const reference = refMatch?.[1];

    const confidence = scoreConfidence(true, !!merchant, !!dateMatch, !!availableBalance);

    return {
      success: true,
      transaction: {
        bank: 'ABSA',
        type,
        amount,
        currency: 'ZAR',
        merchant,
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