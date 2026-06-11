import { BankParser, RawSMS } from './sms.types';
import { FNBParser } from './parsers/FNBParser';
import { CapitecParser } from './parsers/CapitecParser';
import { ABSAParser } from './parsers/ABSAParser';
import { StandardBankParser } from './parsers/StandardBankParser';
import { TymeBankParser } from './parsers/TymeBankParser';

// ─── Register all parsers here ────────────────────────────────────────────────
// Order matters: more specific matchers should come first.

const REGISTERED_PARSERS: BankParser[] = [
  FNBParser,
  CapitecParser,
  ABSAParser,
  StandardBankParser,
  TymeBankParser,
];

// ─── Registry API ─────────────────────────────────────────────────────────────

export class ParserRegistry {
  private parsers: BankParser[];

  constructor(parsers: BankParser[] = REGISTERED_PARSERS) {
    this.parsers = parsers;
  }

  /**
   * Returns the first parser that claims it can handle this SMS.
   */
  findParser(sms: RawSMS): BankParser | null {
    return this.parsers.find((p) => p.canParse(sms)) ?? null;
  }

  /**
   * Returns true if any registered parser can handle this SMS.
   */
  isBankSMS(sms: RawSMS): boolean {
    return this.parsers.some((p) => p.canParse(sms));
  }

  /**
   * Add a custom parser at runtime (e.g. for a new bank added by user).
   */
  register(parser: BankParser): void {
    this.parsers = [parser, ...this.parsers];
  }

  getSupportedBanks(): string[] {
    return this.parsers.map((p) => p.bankName);
  }
}

export const parserRegistry = new ParserRegistry();