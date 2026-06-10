import { BankParser, BankParserResult, RawSMS } from '../sms.types';
import {
  parseAmount,
  parseDate,
  normaliseMerchant,
  scoreConfidence,
} from '../sms.utils';

/**
 * Standard Bank SMS examples:
 *
 *   "Std Bk: Acc *1234 Purch R299.99 WOOLWORTHS FOOD 10/06/25 15:32
 *    Avail bal R1 234.56"
 *
 *   "Std Bk: Acc *5678 Payment rcvd R10 000.00 09/06/25 09:01
 *    Avail bal R11 234.56"
 */
export const StandardBankParser: BankParser = {
  bankName: 'STANDARD_BANK',
  senderPatterns: [/^STD\s*B(AN)?K$/i, /^STANDARDBANK$/i, /^SBSA$/i],

  canParse(sms: RawSMS): boolean {
    return this.senderPatterns.some((p) => p.test(sms.address.trim()));
  },

  parse(sms: RawSMS): BankParserResult {
    const body = sms.body;

    const isCredit   = /rcvd|received|credit|deposit/i.test(body);
    const isReversal = /reversal|reversed/i.test(body);
    const type = isReversal ? 'reversal' : isCredit ? 'credit' : 'debit';

    // ── Amount ────────────────────────────────────────────────────────────────
    const amountMatch = body.match(/R\s*([\d\s,]+\.?\d*)/i);
    const amount = amountMatch ? parseAmount(amountMatch[1]) : null;
    if (!amount) return { success: false, reason: 'No amount found' };

    // ── Account ───────────────────────────────────────────────────────────────
    const accountMatch = body.match(/Acc\s+\*?(\d{4})/i);
    const accountLast4 = accountMatch?.[1];

    // ── Merchant (between amount and date) ───────────────────────────────────
    const merchantMatch = body.match(
      /R[\d\s,.]+\s+([A-Z][A-Z0-9\s&*'.\-]+?)\s+\d{2}[\/\-]\d{2}/i
    );
    const merchant = merchantMatch ? normaliseMerchant(merchantMatch[1]) : undefined;

    // ── Date (dd/mm/yy or dd/mm/yyyy) ─────────────────────────────────────────
    const dateMatch = body.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/);
    let dateStr = dateMatch?.[1];
    // Normalise 2-digit year
    if (dateStr && dateStr.split(/[\/\-]/)[2]?.length === 2) {
      dateStr = dateStr.replace(/(\d{2}[\/\-]\d{2}[\/\-])(\d{2})$/, '$120$2');
    }
    const timestamp = parseDate(dateStr, sms.date);

    // ── Balance ───────────────────────────────────────────────────────────────
    const balanceMatch = body.match(/Avail\s+bal\s+R\s*([\d\s,]+\.?\d*)/i);
    const availableBalance = balanceMatch ? parseAmount(balanceMatch[1]) ?? undefined : undefined;

    const confidence = scoreConfidence(true, !!merchant, !!dateMatch, !!availableBalance);

    return {
      success: true,
      transaction: {
        bank: 'STANDARD_BANK',
        type,
        amount,
        currency: 'ZAR',
        merchant,
        accountLast4,
        availableBalance,
        timestamp,
        confidence,
        rawBody: body,
      },
    };
  },
};