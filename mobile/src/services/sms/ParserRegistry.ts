import { FinancialAlertParser, RawSMS } from './sms.types';
import { FNBParser } from './parsers/FNBParser';
import { CapitecParser } from './parsers/CapitecParser';
import { ABSAParser } from './parsers/ABSAParser';
import { StandardBankParser } from './parsers/StandardBankParser';
import { TymeBankParser } from './parsers/TymeBankParser';
import { MTNParser, VodacomParser } from './parsers/TelcoParser';

// ─── Register all parsers here ────────────────────────────────────────────────
// Only allowlisted financial-alert providers reach the parser pipeline.

const REGISTERED_PARSERS: FinancialAlertParser[] = [
  FNBParser,
  CapitecParser,
  ABSAParser,
  StandardBankParser,
  TymeBankParser,
  MTNParser,
  VodacomParser,
];

// ─── Registry API ─────────────────────────────────────────────────────────────

export class ParserRegistry {
  private parsers: FinancialAlertParser[];

  constructor(parsers: FinancialAlertParser[] = REGISTERED_PARSERS) {
    this.parsers = parsers;
  }

  /**
   * Returns the first parser that claims it can handle this SMS.
   */
  findParser(sms: RawSMS): FinancialAlertParser | null {
    return this.parsers.find((p) => p.canParse(sms)) ?? null;
  }

  /**
   * Returns true if any registered parser can handle this SMS.
   */
  isFinancialAlertSMS(sms: RawSMS): boolean {
    return this.parsers.some((p) => p.canParse(sms));
  }

  /**
   * Add a custom parser at runtime (e.g. for a newly supported provider).
   */
  register(parser: FinancialAlertParser): void {
    this.parsers = [parser, ...this.parsers];
  }

  getSupportedProviders(): string[] {
    return this.parsers.map((p) => p.providerName);
  }
}

export const parserRegistry = new ParserRegistry();