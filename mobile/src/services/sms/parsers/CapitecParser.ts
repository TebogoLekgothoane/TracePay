import { BankParser, BankParserResult, RawSMS } from '../sms.types';
import {
  canParseBankSms,
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
  bodyPatterns: [/^Capitec[:\s]/i],

  canParse(sms: RawSMS): boolean {
    return canParseBankSms(sms, this.senderPatterns, this.bodyPatterns);
  },

  parse(sms: RawSMS): BankParserResult {
    const body = sms.body.trim();

    const headerMatch = body.match(/^Capitec:\s*([A-Za-z\s]+?)\s+R([\d,\s.]+)\s+(.+)$/i);
    const kind = headerMatch?.[1]?.trim().toLowerCase() ?? '';

    // ── Transaction type ─────────────────────────────────────────────────────
    const isCredit   = kind === 'cr' || /^Capitec:\s*CR\b/i.test(body);
    const isAtm      = kind === 'atm wd' || /ATM\s*WD/i.test(body);
    const isReversal = /reversal|REV\b/i.test(body);
    const type = isReversal ? 'reversal' : isCredit ? 'credit' : 'debit';

    // ── Amount ────────────────────────────────────────────────────────────────
    const amountRaw = headerMatch?.[2] ?? body.match(/R\s*([\d,\s.]+)/i)?.[1];
    const amount = amountRaw ? parseAmount(amountRaw) : null;
    if (!amount) return { success: false, reason: 'No amount found' };

    // ── Merchant / description ────────────────────────────────────────────────
    let merchant: string | undefined;
    let summary: string | undefined;

    if (headerMatch?.[3]) {
      const detail = headerMatch[3]
        .replace(/\s+\d{2}[A-Za-z]{3}\d{2}.*$/i, '')
        .replace(/\s+Avail\b.*$/i, '')
        .trim();

      if (kind === 'purch' || kind === 'cr' || kind === 'atm wd') {
        merchant = detail ? normaliseMerchant(detail) : undefined;
        summary = kind === 'purch' ? 'Card purchase' : kind === 'cr' ? 'Deposit received' : 'ATM withdrawal';
      } else if (kind === 'fee' || kind === 'notify') {
        merchant = detail ? normaliseMerchant(detail) : 'Bank charge';
        summary = kind === 'fee' ? 'Bank fee' : 'Notification charge';
      } else if (detail) {
        merchant = normaliseMerchant(detail);
        summary = `${headerMatch[1].trim()} transaction`;
      }
    }

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
        summary,
        accountLast4: undefined,
        availableBalance,
        timestamp,
        confidence,
        rawBody: body,
      },
    };
  },
};