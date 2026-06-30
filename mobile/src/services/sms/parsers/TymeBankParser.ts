import { BankParser, BankParserResult, RawSMS } from '../sms.types';
import {
  canParseBankSms,
  parseAmount,
  parseDate,
  normaliseMerchant,
  scoreConfidence,
} from '../sms.utils';

/**
 * TymeBank SMS examples:
 *
 *   "TymeBank: You have spent R45.00 at SPAR V&A. Available balance R1,234.56."
 *
 *   "TymeBank. Never share this One Time PIN with anyone." (OTP — skipped at parse)
 */
export const TymeBankParser: BankParser = {
  bankName: 'TYMEBANK',
  senderPatterns: [/^TYMEBANK$/i, /^TYME$/i],
  bodyPatterns: [/^TymeBank[.\s:]/i],

  canParse(sms: RawSMS): boolean {
    return canParseBankSms(sms, this.senderPatterns, this.bodyPatterns);
  },

  parse(sms: RawSMS): BankParserResult {
    const body = sms.body;

    // Skip OTP / verification messages
    if (/one\s*time\s*pin|verification\s*code|otp/i.test(body)) {
      return { success: false, reason: 'OTP message, not a transaction' };
    }

    const isCredit = /received|credit|deposit|credited/i.test(body);
    const isDebit = /spent|debited|purchase/i.test(body);
    const type = isCredit ? 'credit' : isDebit ? 'debit' : 'unknown';

    if (type === 'unknown') {
      return { success: false, reason: 'Not a debit/credit transaction' };
    }

    const amountMatch = body.match(/R\s*([\d\s,]+\.?\d*)/i);
    const amount = amountMatch ? parseAmount(amountMatch[1]) : null;
    if (!amount) return { success: false, reason: 'No amount found' };

    const merchantMatch = body.match(
      /(?:at|from)\s+([A-Z][A-Z0-9\s&*'.\-]+?)(?:\.\s*Available|\.\s*$)/i
    );
    const merchant = merchantMatch ? normaliseMerchant(merchantMatch[1]) : undefined;

    const balanceMatch = body.match(/[Aa]vailable\s+balance\s+R\s*([\d\s,]+\.?\d*)/i);
    const availableBalance = balanceMatch ? parseAmount(balanceMatch[1]) ?? undefined : undefined;

    const summary = isCredit ? 'Payment received' : 'Card purchase';

    const confidence = scoreConfidence(true, !!merchant, false, !!availableBalance);

    return {
      success: true,
      transaction: {
        bank: 'TYMEBANK',
        type,
        amount,
        currency: 'ZAR',
        merchant,
        summary,
        availableBalance,
        timestamp: parseDate(undefined, sms.date),
        confidence,
        rawBody: body,
      },
    };
  },
};
