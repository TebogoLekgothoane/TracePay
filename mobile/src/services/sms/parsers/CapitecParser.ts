import { BankParser, BankParserResult, RawSMS } from '../sms.types';
import {
  parseAmount,
  parseDate,
  normaliseMerchant,
  scoreConfidence,
} from '../sms.utils';

/**
 * Capitec SMS examples:
 *
 *   "Capitec: Purch R350.00 CHECKERS #1234 10Jun25 Avail R2150.00"
 *
 *   "Capitec: CR R5000.00 SALARY DEPOSIT 09Jun25 Avail R7150.00"
 *
 *   "Capitec: ATM WD R1000.00 CAPITEC ATM 08Jun25 Avail R1150.00"
 */
export const CapitecParser: BankParser = {
  bankName: 'CAPITEC',
  senderPatterns: [/^CAPITEC$/i, /^CAP\s*BANK/i],

  canParse(sms: RawSMS): boolean {
    return this.senderPatterns.some((p) => p.test(sms.address.trim()));
  },

  parse(sms: RawSMS): BankParserResult {
    const body = sms.body;

    // ── Transaction type ─────────────────────────────────────────────────────
    const isCredit   = /^Capitec:\s*CR\b/i.test(body);
    const isAtm      = /ATM\s*WD/i.test(body);
    const isReversal = /reversal|REV\b/i.test(body);
    const type = isReversal ? 'reversal' : isCredit ? 'credit' : 'debit';

    // ── Amount ────────────────────────────────────────────────────────────────
    const amountMatch = body.match(/R\s*([\d,]+\.?\d*)/i);
    const amount = amountMatch ? parseAmount(amountMatch[1]) : null;
    if (!amount) return { success: false, reason: 'No amount found' };

    // ── Merchant ──────────────────────────────────────────────────────────────
    // Capitec puts merchant AFTER the amount, before the date (ddMonyy)
    const merchantMatch = body.match(
      /R[\d,\s.]+\s+([A-Z][A-Z0-9\s#&*'.\-]+?)\s+\d{2}[A-Za-z]{3}\d{2}/i
    );
    const merchant = merchantMatch ? normaliseMerchant(merchantMatch[1]) : undefined;

    // ── Date (ddMonyy) ────────────────────────────────────────────────────────
    const dateMatch = body.match(/(\d{2}[A-Za-z]{3}\d{2})/);
    // Convert "10Jun25" → "10 Jun 2025"
    let dateStr: string | undefined;
    if (dateMatch) {
      const raw = dateMatch[1];
      const d = raw.slice(0, 2);    
      const m = raw.slice(2, 5);
      const y = '20' + raw.slice(5);
      dateStr = `${d} ${m} ${y}`;
    }
    const timestamp = parseDate(dateStr, sms.date);

    // ── Available balance ─────────────────────────────────────────────────────
    const balanceMatch = body.match(/Avail\s+R\s*([\d,]+\.?\d*)/i);
    const availableBalance = balanceMatch ? parseAmount(balanceMatch[1]) ?? undefined : undefined;

    const confidence = scoreConfidence(true, !!merchant, !!dateMatch, !!availableBalance);

    return {
      success: true,
      transaction: {
        bank: 'CAPITEC',
        type,
        amount,
        currency: 'ZAR',
        merchant,
        accountLast4: undefined,
        availableBalance,   
        timestamp,
        confidence,
        rawBody: body,
      },
    };
  },
};