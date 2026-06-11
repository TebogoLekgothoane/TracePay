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

function fetchSMSFromDevice(filter: object): Promise<RawSMS[]> {
  const sms = getSmsModule();

  return new Promise((resolve, reject) => {
    sms.list(
      JSON.stringify(filter),
      (error: string) => reject(new Error(error)),
      (_count: number, smsList: string) => {
        try {
          resolve(JSON.parse(smsList) as RawSMS[]);
        } catch {
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
  // SMS inbox access is Android-only; return gracefully on other platforms.
  if (Platform.OS !== 'android') return EMPTY_RESULT;

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