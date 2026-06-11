import { TransactionCategory } from './sms.types';

// ─── Known SA bank SMS sender addresses ──────────────────────────────────────

export const BANK_SENDERS: Record<string, RegExp[]> = {
  FNB: [/^FNB$/i, /^FNBSA$/i, /firstnational/i],
  ABSA: [/^ABSA$/i, /^ABSA\s*BANK/i],
  NEDBANK: [/^NEDBANK$/i, /^NED$/i],
  CAPITEC: [/^CAPITEC$/i, /^CAP\s*BANK/i],
  STANDARD_BANK: [/^STD\s*BANK$/i, /^STANDARDBANK$/i, /^SBSA$/i],
  INVESTEC: [/^INVESTEC$/i],
  AFRICAN_BANK: [/^AFRICAN\s*BANK$/i, /^AFRICANBANK$/i],
  TYM_BANK: [/^TYMEBANK$/i, /^TYME$/i],
  DISCOVERY: [/^DISCOVERY\s*BANK$/i, /^DISCBANK$/i],
  OLDMUTUAL: [/^OLD\s*MUTUAL$/i, /^OLDMUTUAL$/i],
};

export const ALL_BANK_SENDER_REGEX: RegExp = new RegExp(
  Object.values(BANK_SENDERS)
    .flat()
    .map((r) => r.source)
    .join('|'),
  'i'
);

// ─── Merchant → category keyword map ─────────────────────────────────────────

export const CATEGORY_KEYWORDS: Record<TransactionCategory, RegExp> = {
  groceries: /checkers|woolworths|pick\s*n\s*pay|pnp|spar|shoprite|food\s*lover|woolies/i,
  fuel:       /shell|engen|bp\s|total\s|sasol|caltex|astron|fuel|petrol/i,
  dining:     /kfc|mcdonald|steers|nando|spur|wimpy|restaurant|cafe|coffee|java|vida/i,
  entertainment: /netflix|showmax|dstv|movies|cinema|nu\s*metro|ster.?kinekor|spotify|gaming/i,
  utilities:  /eskom|municipality|city\s*power|telkom|vodacom|mtn\s|cell\s*c|rain\s|water/i,
  transfer:   /transfer|payment\s*to|pay\s*to|eft|immediate\s*payment/i,
  atm:        /atm\s*withdrawal|cash\s*withdrawal|atm\s*deposit/i,
  online:     /online|e.?commerce|takealot|amazon|bash\.com|superbalist/i,
  medical:    /clicks|dischem|pharmacy|hospital|clinic|doctor|medical|dentist/i,
  other:      /.*/,
};

// ─── Currency symbols ─────────────────────────────────────────────────────────

export const CURRENCY_PATTERNS = /(?:R|ZAR|rand)\s*/i;

// ─── SMS fetch config defaults ────────────────────────────────────────────────

export const SMS_FETCH_DEFAULTS = {
  box: 'inbox',
  maxCount: 500,
  indexFrom: 0,
  minDate: 0,              // 0 = no lower bound; set to epoch ms for partial sync
};

export const SYNC_LOOKBACK_DAYS = 90;  // how far back to scan on first sync