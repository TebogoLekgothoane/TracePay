import {
  Linking,
  NativeModules,
  PermissionsAndroid,
  Platform,
  type Permission,
} from 'react-native';

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
import { loadDemoTransactions } from './demo/loadDemoTransactions';
import { getSmsIngestionSource, isDemoSmsSource } from './smsSource';

// Static literals — avoids PermissionsAndroid.PERMISSIONS (undefined on web/iOS).
const SMS_PERMISSIONS: Permission[] = [
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
];

export const SMS_PERMISSION_BLOCKED_HELP =
  'Android blocked SMS access for this app. Open Settings, tap Permissions → SMS, ' +
  'and allow access. Then return to TracePay and tap "Check again".';

export async function openAppPermissionSettings(): Promise<void> {
  await Linking.openSettings();
}

async function areSmsPermissionsGranted(): Promise<boolean> {
  if (Platform.OS !== 'android' || !PermissionsAndroid) return false;

  const results = await Promise.all(
    SMS_PERMISSIONS.map((p) => PermissionsAndroid.check(p))
  );
  return results.every(Boolean);
}

export async function requestSMSPermission(): Promise<PermissionStatus> {
  if (isDemoSmsSource()) return 'granted';

  if (Platform.OS !== 'android') {
    return 'denied';
  }

  if (await areSmsPermissionsGranted()) {
    return 'granted';
  }

  try {
    if (!PermissionsAndroid) return 'denied';

    const results = await PermissionsAndroid.requestMultiple(SMS_PERMISSIONS);

    const statuses = SMS_PERMISSIONS.map((p) => results[p]);
    if (statuses.every((s) => s === 'granted')) {
      return 'granted';
    }
    if (statuses.some((s) => s === 'never_ask_again')) {
      return 'never_ask_again';
    }
    return 'denied';
  } catch {
    return 'denied';
  }
}

export async function checkSMSPermission(): Promise<PermissionStatus> {
  if (isDemoSmsSource()) return 'granted';
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

const SMS_DEBUG = __DEV__;

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
            sampleSenders: parsed.slice(0, 5).map((m) => m.address),
          });
          resolve(parsed);
        } catch (err) {
          smsLog('fetchSMSFromDevice ✗ JSON parse failed', {
            error: (err as Error).message,
          });
          reject(new Error('Failed to parse SMS list JSON'));
        }
      }
    );
  });
}

async function fetchDeviceRawMessages(options: {
  sinceMs: number;
  maxCount: number;
}): Promise<RawSMS[]> {
  if (Platform.OS !== 'android') {
    return [];
  }

  if (!isSmsNativeModuleAvailable()) {
    throw new Error(
      'SMS scanning is not available in this build. Run "npx expo run:android" ' +
      'to create a dev build with SMS support — Expo Go cannot read SMS.'
    );
  }

  const permission = await checkSMSPermission();
  if (permission !== 'granted') {
    throw new Error(SMS_PERMISSION_BLOCKED_HELP);
  }

  return fetchSMSFromDevice({
    box: 'inbox',
    minDate: options.sinceMs,
    maxCount: options.maxCount,
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

function parseFinancialAlertMessages(
  rawMessages: RawSMS[],
  existingTransactions: ParsedTransaction[]
): IngestionResult {
  const result: IngestionResult = {
    total: rawMessages.length,
    parsed: 0,
    skipped: 0,
    failed: 0,
    transactions: [],
    errors: [],
  };

  const financialAlertMessages = rawMessages.filter((sms) =>
    parserRegistry.isFinancialAlertSMS(sms)
  );
  result.skipped = rawMessages.length - financialAlertMessages.length;

  for (const sms of financialAlertMessages) {
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
      const parsed = enrichParsedTransaction({
        ...tx,
        id: makeTransactionId(sms._id, sms.body),
        rawSmsId: sms._id,
        parsedAt: new Date(),
        category: inferCategory(tx.merchant),
      });

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

  result.transactions = deduplicateTransactions(
    result.transactions,
    existingTransactions
  );

  return result;
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
  const source = getSmsIngestionSource();
  smsLog('ingestSMS start', { platform: Platform.OS, source, options });

  if (!isDemoSmsSource() && Platform.OS !== 'android') {
    smsLog('ingestSMS abort — not Android');
    return EMPTY_RESULT;
  }

  const {
    sinceMs = Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    existingTransactions = [],
    maxCount = SMS_FETCH_DEFAULTS.maxCount,
  } = options;

  smsLog('ingestSMS config', {
    source,
    sinceMs,
    sinceDate: new Date(sinceMs).toISOString(),
    lookbackDays: SYNC_LOOKBACK_DAYS,
    maxCount,
    existingCount: existingTransactions.length,
    supportedProviders: parserRegistry.getSupportedProviders(),
  });

  if (isDemoSmsSource()) {
    try {
      const demoTransactions = await loadDemoTransactions({ sinceMs, maxCount });
      const transactions = deduplicateTransactions(
        demoTransactions,
        existingTransactions
      );
      const result: IngestionResult = {
        total: demoTransactions.length,
        parsed: demoTransactions.length,
        skipped: 0,
        failed: 0,
        transactions,
        errors: [],
      };
      smsLog('ingestSMS done', {
        source,
        total: result.total,
        afterDedup: result.transactions.length,
      });
      return result;
    } catch (err) {
      throw new Error(`Demo dataset fetch failed: ${(err as Error).message}`);
    }
  }

  let rawMessages: RawSMS[] = [];
  try {
    rawMessages = await fetchDeviceRawMessages({ sinceMs, maxCount });
  } catch (err) {
    throw new Error(`SMS fetch failed: ${(err as Error).message}`);
  }

  smsLog('ingestSMS step 1 — raw alerts', {
    source,
    total: rawMessages.length,
  });

  const result = parseFinancialAlertMessages(rawMessages, existingTransactions);

  smsLog('ingestSMS done', {
    source,
    total: result.total,
    parsed: result.parsed,
    skipped: result.skipped,
    failed: result.failed,
    afterDedup: result.transactions.length,
    errors: result.errors.slice(0, 5),
  });

  return result;
}
