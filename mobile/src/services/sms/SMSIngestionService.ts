import { Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';

import {
  RawSMS,
  ParsedTransaction,
  IngestionResult,
  PermissionStatus,
} from './sms.types';
import { SMS_FETCH_DEFAULTS, SYNC_LOOKBACK_DAYS } from './banks.constants';
import { makeTransactionId, inferCategory } from './sms.utils';
import { parserRegistry } from './ParserRegistry';
import { enrichParsedTransaction } from '@/lib/transaction-display';

// ─── SMS permission ───────────────────────────────────────────────────────────

const SMS_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.READ_SMS,
  PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
] as const;

export const SMS_PERMISSION_BLOCKED_HELP =
  'Android blocked SMS access for this app. Open Settings, tap Permissions → SMS, ' +
  'and allow access. Then return to TracePay and tap "Check again".';

export async function openAppPermissionSettings(): Promise<void> {
  await Linking.openSettings();
}

async function areSmsPermissionsGranted(): Promise<boolean> {
  const results = await Promise.all(
    SMS_PERMISSIONS.map((p) => PermissionsAndroid.check(p))
  );
  return results.every(Boolean);
}

export async function requestSMSPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'denied';
  }

  if (await areSmsPermissionsGranted()) {
    return 'granted';
  }

  try {
    const results = await PermissionsAndroid.requestMultiple([...SMS_PERMISSIONS]);

    const statuses = SMS_PERMISSIONS.map((p) => results[p]);
    if (statuses.every((s) => s === PermissionsAndroid.RESULTS.GRANTED)) {
      return 'granted';
    }
    if (statuses.some((s) => s === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) {
      return 'never_ask_again';
    }
    return 'denied';
  } catch {
    return 'denied';
  }
}

export async function checkSMSPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'denied';
  return (await areSmsPermissionsGranted()) ? 'granted' : 'undetermined';
}

// ─── Native module access ─────────────────────────────────────────────────────
// react-native-get-sms-android exports NativeModules.Sms — null in Expo Go / web.

type SmsNativeModule = {
  list: (
    filter: string,
    fail: (error: string) => void,
    success: (count: number, smsList: string) => void
  ) => void;
};

export function isSmsNativeModuleAvailable(): boolean {
  if (Platform.OS !== 'android') return false;
  const sms = NativeModules.Sms as SmsNativeModule | undefined;
  return typeof sms?.list === 'function';
}

function getSmsModule(): SmsNativeModule {
  const sms = NativeModules.Sms as SmsNativeModule | undefined;
  if (!sms?.list) {
    throw new Error(
      'SMS scanning is not available in this build. Install the dev client with ' +
      '"npx expo run:android" — Expo Go cannot read SMS.'
    );
  }
  return sms;
}

// ─── Raw SMS fetch ────────────────────────────────────────────────────────────

const SMS_DEBUG = true;

function smsLog(label: string, data?: unknown) {
  if (!SMS_DEBUG) return;
  if (data !== undefined) {
    console.log(`[SMS] ${label}`, data);
  } else {
    console.log(`[SMS] ${label}`);
  }
}

function fetchSMSFromDevice(filter: object): Promise<RawSMS[]> {
  const sms = getSmsModule();
  const filterJson = JSON.stringify(filter);
  smsLog('fetchSMSFromDevice → filter', filter);

  return new Promise((resolve, reject) => {
    sms.list(
      filterJson,
      (error: string) => {
        smsLog('fetchSMSFromDevice ✗ native error', error);
        reject(new Error(error));
      },
      (count: number, smsList: string) => {
        smsLog('fetchSMSFromDevice ← native callback', {
          reportedCount: count,
          jsonLength: smsList?.length ?? 0,
        });
        try {
          const parsed = JSON.parse(smsList) as RawSMS[];
          smsLog('fetchSMSFromDevice parsed', {
            arrayLength: parsed.length,
            sampleSenders: parsed.slice(0, 5).map((m) => ({
              address: m.address,
              date: m.date,
              bodyPreview: m.body?.slice(0, 60),
            })),
          });
          resolve(parsed);
        } catch (err) {
          smsLog('fetchSMSFromDevice ✗ JSON parse failed', {
            error: (err as Error).message,
            preview: smsList?.slice(0, 200),
          });
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

const EMPTY_RESULT: IngestionResult = {
  total: 0, parsed: 0, skipped: 0, failed: 0, transactions: [], errors: [],
};

export async function ingestSMS(options: IngestOptions = {}): Promise<IngestionResult> {
  smsLog('ingestSMS start', { platform: Platform.OS, options });

  // SMS inbox access is Android-only; return gracefully on other platforms.
  if (Platform.OS !== 'android') {
    smsLog('ingestSMS abort — not Android');
    return EMPTY_RESULT;
  }

  const nativeAvailable = isSmsNativeModuleAvailable();
  smsLog('ingestSMS native module', { available: nativeAvailable });
  if (!nativeAvailable) {
    throw new Error(
      'SMS scanning is not available in this build. Run "npx expo run:android" ' +
      'to create a dev build with SMS support — Expo Go cannot read SMS.'
    );
  }

  const permission = await checkSMSPermission();
  smsLog('ingestSMS permission', { permission });
  if (permission !== 'granted') {
    throw new Error(SMS_PERMISSION_BLOCKED_HELP);
  }

  const {
    sinceMs = Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    existingTransactions = [],
    maxCount = SMS_FETCH_DEFAULTS.maxCount,
  } = options;

  smsLog('ingestSMS config', {
    sinceMs,
    sinceDate: new Date(sinceMs).toISOString(),
    lookbackDays: SYNC_LOOKBACK_DAYS,
    maxCount,
    existingCount: existingTransactions.length,
    supportedBanks: parserRegistry.getSupportedBanks(),
  });

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
  smsLog('ingestSMS step 1 — raw inbox', { total: result.total });

  // 2. Filter to bank SMS only
  const bankMessages = rawMessages.filter((sms) => parserRegistry.isBankSMS(sms));
  result.skipped = rawMessages.length - bankMessages.length;

  const nonBankSenders = [...new Set(
    rawMessages
      .filter((sms) => !parserRegistry.isBankSMS(sms))
      .map((sms) => sms.address)
  )].slice(0, 15);

  smsLog('ingestSMS step 2 — bank filter', {
    bankMessages: bankMessages.length,
    nonBankSkipped: result.skipped,
    bankSenders: bankMessages.map((m) => m.address),
    sampleNonBankSenders: nonBankSenders,
  });

  // 3. Parse each bank SMS
  for (const sms of bankMessages) {
    const parser = parserRegistry.findParser(sms);
    if (!parser) {
      smsLog('ingestSMS no parser for bank SMS', {
        address: sms.address,
        bodyPreview: sms.body?.slice(0, 80),
      });
      result.skipped++;
      continue;
    }

    try {
      const parseResult = parser.parse(sms);

      if (!parseResult.success || !parseResult.transaction) {
        smsLog('ingestSMS parse failed', {
          bank: parser.bankName,
          address: sms.address,
          reason: parseResult.reason,
          bodyPreview: sms.body?.slice(0, 120),
        });
        result.failed++;
        result.errors.push({
          smsId: sms._id,
          reason: parseResult.reason ?? 'Unknown parse failure',
        });
        continue;
      }

      const tx = parseResult.transaction;
      const id = makeTransactionId(sms._id, sms.body);

      const parsed = enrichParsedTransaction({
        ...tx,
        id,
        rawSmsId: sms._id,
        parsedAt: new Date(),
        category: inferCategory(tx.merchant),
      });

      smsLog('ingestSMS parsed ✓', {
        bank: parsed.bank,
        type: parsed.type,
        amount: parsed.amount,
        merchant: parsed.merchant,
        id: parsed.id,
      });
      result.transactions.push(parsed);
      result.parsed++;
    } catch (err) {
      smsLog('ingestSMS parse threw', {
        address: sms.address,
        error: (err as Error).message,
      });
      result.failed++;
      result.errors.push({
        smsId: sms._id,
        reason: `Parser threw: ${(err as Error).message}`,
      });
    }
  }

  const beforeDedup = result.transactions.length;

  // 4. Deduplicate against existing transactions
  result.transactions = deduplicateTransactions(
    result.transactions,
    existingTransactions
  );

  smsLog('ingestSMS done', {
    total: result.total,
    parsed: result.parsed,
    skipped: result.skipped,
    failed: result.failed,
    beforeDedup,
    afterDedup: result.transactions.length,
    dedupedOut: beforeDedup - result.transactions.length,
    errors: result.errors.slice(0, 5),
  });

  return result;
}