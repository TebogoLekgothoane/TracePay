import { PermissionsAndroid, Platform } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';

import {
  RawSMS,
  ParsedTransaction,
  IngestionResult,
  PermissionStatus,
} from './sms.types';
import { SMS_FETCH_DEFAULTS, SYNC_LOOKBACK_DAYS } from './banks.constants';
import { makeTransactionId, inferCategory } from './sms.utils';
import { parserRegistry } from './ParserRegistry';

// ─── SMS permission ───────────────────────────────────────────────────────────

export async function requestSMSPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') {
    // iOS does not support SMS reading
    return 'denied';
  }

  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: 'TracePay needs SMS access',
        message:
          'To automatically track your bank transactions, TracePay needs ' +
          'permission to read your SMS messages. Only messages from known ' +
          'banks are processed — personal messages are never read.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );

    switch (result) {
      case PermissionsAndroid.RESULTS.GRANTED:
        return 'granted';
      case PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN:
        return 'never_ask_again';
      default:
        return 'denied';
    }
  } catch {
    return 'denied';
  }
}

export async function checkSMSPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'denied';

  const granted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.READ_SMS
  );
  return granted ? 'granted' : 'undetermined';
}

// ─── Raw SMS fetch ────────────────────────────────────────────────────────────

function fetchSMSFromDevice(filter: object): Promise<RawSMS[]> {
  return new Promise((resolve, reject) => {
    SmsAndroid.list(
      JSON.stringify(filter),
      (error: string) => reject(new Error(error)),
      (_count: number, smsList: string) => {
        try {
          resolve(JSON.parse(smsList) as RawSMS[]);
        } catch (e) {
          reject(new Error('Failed to parse SMS list JSON'));
        }
      }
    );
  });
}

// ─── Deduplication ────────────────────────────────────────────────────────────

export function deduplicateTransactions(
  incoming: ParsedTransaction[],
  existing: ParsedTransaction[]
): ParsedTransaction[] {
  const existingIds = new Set(existing.map((t) => t.id));
  return incoming.filter((t) => !existingIds.has(t.id));
}

// ─── Core ingestion ───────────────────────────────────────────────────────────

export interface IngestOptions {
  /** Only fetch SMS after this timestamp (ms). Defaults to 90 days ago. */
  sinceMs?: number;
  /** Existing transactions to deduplicate against. */
  existingTransactions?: ParsedTransaction[];
  /** Max SMS to fetch. Defaults to SMS_FETCH_DEFAULTS.maxCount. */
  maxCount?: number;
}

export async function ingestSMS(options: IngestOptions = {}): Promise<IngestionResult> {
  const {
    sinceMs = Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    existingTransactions = [],
    maxCount = SMS_FETCH_DEFAULTS.maxCount,
  } = options;

  const result: IngestionResult = {
    total: 0,
    parsed: 0,
    skipped: 0,
    failed: 0,
    transactions: [],
    errors: [],
  };

  // 1. Fetch raw SMS from device
  let rawMessages: RawSMS[] = [];
  try {
    rawMessages = await fetchSMSFromDevice({
      box: 'inbox',
      minDate: sinceMs,
      maxCount,
    });
  } catch (err) {
    throw new Error(`SMS fetch failed: ${(err as Error).message}`);
  }

  result.total = rawMessages.length;

  // 2. Filter to bank SMS only
  const bankMessages = rawMessages.filter((sms) => parserRegistry.isBankSMS(sms));
  result.skipped = rawMessages.length - bankMessages.length;

  // 3. Parse each bank SMS
  for (const sms of bankMessages) {
    const parser = parserRegistry.findParser(sms);
    if (!parser) {
      result.skipped++;
      continue;
    }

    try {
      const parseResult = parser.parse(sms);

      if (!parseResult.success || !parseResult.transaction) {
        result.failed++;
        result.errors.push({
          smsId: sms._id,
          reason: parseResult.reason ?? 'Unknown parse failure',
        });
        continue;
      }

      const tx = parseResult.transaction;
      const id = makeTransactionId(sms._id, sms.body);

      const parsed: ParsedTransaction = {
        ...tx,
        id,
        rawSmsId: sms._id,
        parsedAt: new Date(),
        category: inferCategory(tx.merchant),
      };

      result.transactions.push(parsed);
      result.parsed++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        smsId: sms._id,
        reason: `Parser threw: ${(err as Error).message}`,
      });
    }
  }

  // 4. Deduplicate against existing transactions
  result.transactions = deduplicateTransactions(
    result.transactions,
    existingTransactions
  );

  return result;
}