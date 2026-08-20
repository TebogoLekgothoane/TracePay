// ─── Raw SMS from device ─────────────────────────────────────────────────────

export interface RawSMS {
    _id: string;
    address: string;       // sender (e.g. "FNB", "+27831234567")
    body: string;
    date: number;          // unix ms
    date_sent: number;
    read: number;          // 0 | 1
    type: number;          // 1 = inbox, 2 = sent
  }
  
  // ─── Parsed transaction ───────────────────────────────────────────────────────
  
  export type TransactionType = 'debit' | 'credit' | 'reversal' | 'unknown';
  
  export type TransactionCategory =
    | 'groceries'
    | 'fuel'
    | 'dining'
    | 'entertainment'
    | 'utilities'
    | 'transfer'
    | 'atm'
    | 'online'
    | 'medical'
    | 'other';
  
  export interface ParsedTransaction {
    id: string;                     // deterministic hash of sms _id + body
    rawSmsId: string;
    /** Financial-alert provider, e.g. "FNB", "MTN", or "VODACOM". */
    bank: string;
    type: TransactionType;
    amount: number;                 // always positive
    currency: string;               // "ZAR"
    merchant?: string;
    /** What happened, e.g. "Card purchase" or "Monthly admin fee". */
    summary?: string;
    reference?: string;
    accountLast4?: string;
    availableBalance?: number;
    timestamp: Date;
    category: TransactionCategory;
    rawBody: string;
    parsedAt: Date;
    confidence: 'high' | 'medium' | 'low';
    /** Hunter logo domain resolved at parse/enrich time, e.g. "spotify.com". */
    logoDomain?: string;
  }
  
  // ─── Parser contract ──────────────────────────────────────────────────────────
  
export interface FinancialAlertParserResult {
    success: boolean;
    transaction?: Omit<ParsedTransaction, 'id' | 'rawSmsId' | 'parsedAt' | 'category'>;
    reason?: string;        // why parsing failed
  }
  
  export interface FinancialAlertParser {
    providerName: string;
    senderPatterns: RegExp[];   // matches provider names and short codes
    bodyPatterns: RegExp[];     // matches provider names where sender IDs are numeric
    canParse(sms: RawSMS): boolean;
    parse(sms: RawSMS): FinancialAlertParserResult;
  }

  /** @deprecated Use FinancialAlertParserResult. */
  export type BankParserResult = FinancialAlertParserResult;

  /** @deprecated Use FinancialAlertParser. */
  export type BankParser = FinancialAlertParser;
  
  // ─── Ingestion result ────────────────────────────────────────────────────────
  
  export interface IngestionResult {
    total: number;
    parsed: number;
    skipped: number;
    failed: number;
    transactions: ParsedTransaction[];
    errors: Array<{ smsId: string; reason: string }>;
  }
  
  // ─── Service state ────────────────────────────────────────────────────────────
  
  export type PermissionStatus = 'granted' | 'denied' | 'never_ask_again' | 'undetermined';
  
  export interface SMSServiceState {
    permissionStatus: PermissionStatus;
    isListening: boolean;
    lastSyncAt: Date | null;
    totalIngested: number;
  }