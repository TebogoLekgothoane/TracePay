import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { ParsedTransaction } from '@/services/sms/sms.types';
import {
  fromStoredTransaction,
  toStoredTransaction,
  type StoredTransaction,
} from './mapParsedTransaction';
import { pipelineError, pipelineLog } from '@/lib/pipeline-log';
import type { LifecycleLeak } from '../../../lib/backend-client';

const DATABASE_NAME = 'tracepay-transactions.db';
const DATABASE_KEY_NAME = 'tracepay_transactions_database_key_v1';
const LEGACY_TRANSACTIONS_KEY = '@tracepay/transactions';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface TransactionRow {
  id: string;
  bank: string;
  type: StoredTransaction['type'];
  amount: number;
  currency: string;
  merchant: string | null;
  summary: string | null;
  occurred_at: string;
  category: StoredTransaction['category'];
  parsed_at: string;
  confidence: StoredTransaction['confidence'];
  logo_domain: string | null;
}

interface LeakRow {
  payload: string;
}

type SQLiteDatabase = import('expo-sqlite').SQLiteDatabase;

let databasePromise: Promise<SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getOrCreateDatabaseKey(): Promise<string> {
  pipelineLog('db.key.start');
  const available = await SecureStore.isAvailableAsync();
  if (!available) {
    throw new Error('Secure transaction storage is unavailable on this device');
  }

  const existing = await SecureStore.getItemAsync(
    DATABASE_KEY_NAME,
    SECURE_STORE_OPTIONS
  );
  if (existing) {
    if (!/^[0-9a-f]{64}$/.test(existing)) {
      throw new Error('Secure transaction storage key is invalid');
    }
    pipelineLog('db.key.loaded', { keyLength: existing.length, created: false });
    return existing;
  }

  const key = bytesToHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(
    DATABASE_KEY_NAME,
    key,
    SECURE_STORE_OPTIONS
  );
  pipelineLog('db.key.created', { keyLength: key.length, created: true });
  return key;
}

async function openEncryptedDatabase(): Promise<SQLiteDatabase> {
  if (Platform.OS === 'web') {
    throw new Error('Encrypted transaction persistence is unavailable on web');
  }

  pipelineLog('db.open.start', { databaseName: DATABASE_NAME, platform: Platform.OS });
  const [SQLite, key] = await Promise.all([
    import('expo-sqlite'),
    getOrCreateDatabaseKey(),
  ]);

  try {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    pipelineLog('db.open.fileOpened');

    // The key must be the first statement executed against a SQLCipher database.
    await database.execAsync(`PRAGMA key = "x'${key}'";`);
    pipelineLog('db.open.pragmaKeyApplied');

    await database.execAsync(`
      PRAGMA cipher_memory_security = ON;
      PRAGMA secure_delete = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS transactions (
        owner_id TEXT NOT NULL,
        id TEXT NOT NULL,
        bank TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('debit', 'credit', 'reversal')),
        amount REAL NOT NULL CHECK (amount > 0),
        currency TEXT NOT NULL,
        merchant TEXT,
        summary TEXT,
        occurred_at TEXT NOT NULL,
        category TEXT NOT NULL,
        parsed_at TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
        logo_domain TEXT,
        PRIMARY KEY (owner_id, id)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS transactions_owner_date_idx
        ON transactions (owner_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS leaks (
        owner_id TEXT NOT NULL,
        id TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, id)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS leaks_owner_updated_idx
        ON leaks (owner_id, updated_at DESC);
    `);
    pipelineLog('db.open.schemaReady');
    return database;
  } catch (error) {
    pipelineError('db.open', error);
    throw error;
  }
}

function getDatabase(): Promise<SQLiteDatabase> {
  databasePromise ??= openEncryptedDatabase().catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function rowToStoredTransaction(row: TransactionRow): StoredTransaction {
  return {
    id: row.id,
    bank: row.bank,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    merchant: row.merchant ?? undefined,
    summary: row.summary ?? undefined,
    timestamp: row.occurred_at,
    category: row.category,
    parsedAt: row.parsed_at,
    confidence: row.confidence,
    logoDomain: row.logo_domain ?? undefined,
  };
}

export async function loadStoredTransactions(
  ownerId: string
): Promise<ParsedTransaction[]> {
  if (Platform.OS === 'web') return [];

  pipelineLog('db.load.start', { ownerIdPrefix: ownerId.slice(0, 8) });
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<TransactionRow>(
      `SELECT id, bank, type, amount, currency, merchant, summary,
              occurred_at, category, parsed_at, confidence, logo_domain
         FROM transactions
        WHERE owner_id = ?
        ORDER BY occurred_at DESC`,
      ownerId
    );
    pipelineLog('db.load.done', { rowCount: rows.length });
    return rows.map(rowToStoredTransaction).map(fromStoredTransaction);
  } catch (error) {
    pipelineError('db.load', error);
    throw error;
  }
}

async function replaceStoredTransactions(
  ownerId: string,
  transactions: ParsedTransaction[]
): Promise<void> {
  if (Platform.OS === 'web') return;

  const records = transactions
    .map(toStoredTransaction)
    .filter((record): record is StoredTransaction => record !== null);
  pipelineLog('db.save.start', {
    ownerIdPrefix: ownerId.slice(0, 8),
    inputCount: transactions.length,
    sanitisedCount: records.length,
    droppedCount: transactions.length - records.length,
  });

  try {
    const database = await getDatabase();

    // Must use the same keyed connection. withExclusiveTransactionAsync opens a
    // second connection that never receives PRAGMA key → "file is not a database".
    // writeQueue already serializes writers on this path.
    await database.withTransactionAsync(async () => {
      await database.runAsync(
        'DELETE FROM transactions WHERE owner_id = ?',
        ownerId
      );
      pipelineLog('db.save.deletedExisting');

      const statement = await database.prepareAsync(`
        INSERT INTO transactions (
          owner_id, id, bank, type, amount, currency, merchant, summary,
          occurred_at, category, parsed_at, confidence, logo_domain
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      pipelineLog('db.save.prepareInsert');

      try {
        for (const record of records) {
          await statement.executeAsync([
            ownerId,
            record.id,
            record.bank,
            record.type,
            record.amount,
            record.currency,
            record.merchant ?? null,
            record.summary ?? null,
            record.timestamp,
            record.category,
            record.parsedAt,
            record.confidence,
            record.logoDomain ?? null,
          ]);
        }
      } finally {
        await statement.finalizeAsync();
      }
    });
    pipelineLog('db.save.done', { savedCount: records.length });
  } catch (error) {
    pipelineError('db.save', error);
    throw error;
  }
}

export function saveStoredTransactions(
  ownerId: string,
  transactions: ParsedTransaction[]
): Promise<void> {
  const operation = writeQueue
    .catch(() => undefined)
    .then(() => replaceStoredTransactions(ownerId, transactions));
  writeQueue = operation;
  return operation;
}

export async function loadStoredLeaks(ownerId: string): Promise<LifecycleLeak[]> {
  if (Platform.OS === 'web') return [];
  const database = await getDatabase();
  const rows = await database.getAllAsync<LeakRow>(
    'SELECT payload FROM leaks WHERE owner_id = ? ORDER BY updated_at DESC',
    ownerId,
  );
  const leaks: LifecycleLeak[] = [];
  for (const row of rows) {
    try {
      const leak = JSON.parse(row.payload) as LifecycleLeak;
      if (
        typeof leak.id === 'string'
        && typeof leak.fi_code === 'string'
        && ['active', 'monitoring', 'resolved'].includes(leak.status)
        && Number.isFinite(leak.amount_monthly)
        && typeof leak.exact_action === 'string'
      ) {
        leaks.push(leak);
      }
    } catch {
      // Skip a corrupt cached record; the server remains authoritative.
    }
  }
  return leaks;
}

export function saveStoredLeaks(ownerId: string, leaks: LifecycleLeak[]): Promise<void> {
  const operation = writeQueue
    .catch(() => undefined)
    .then(async () => {
      if (Platform.OS === 'web') return;
      const database = await getDatabase();
      const updatedAt = new Date().toISOString();
      await database.withTransactionAsync(async () => {
        await database.runAsync('DELETE FROM leaks WHERE owner_id = ?', ownerId);
        const statement = await database.prepareAsync(
          'INSERT INTO leaks (owner_id, id, payload, updated_at) VALUES (?, ?, ?, ?)',
        );
        try {
          for (const leak of leaks) {
            await statement.executeAsync([ownerId, leak.id, JSON.stringify(leak), updatedAt]);
          }
        } finally {
          await statement.finalizeAsync();
        }
      });
    });
  writeQueue = operation;
  return operation;
}

export async function migrateLegacyTransactions(
  ownerId: string
): Promise<ParsedTransaction[]> {
  pipelineLog('db.migrate.start', { ownerIdPrefix: ownerId.slice(0, 8) });
  const encrypted = await loadStoredTransactions(ownerId);
  if (encrypted.length > 0) {
    pipelineLog('db.migrate.usingEncrypted', { count: encrypted.length });
    return encrypted;
  }
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(LEGACY_TRANSACTIONS_KEY);
    return [];
  }

  const legacyRaw = await AsyncStorage.getItem(LEGACY_TRANSACTIONS_KEY);
  if (!legacyRaw) {
    pipelineLog('db.migrate.noLegacy');
    return [];
  }

  pipelineLog('db.migrate.foundLegacy');
  let legacy: ParsedTransaction[];
  try {
    legacy = (JSON.parse(legacyRaw) as ParsedTransaction[]).map((transaction) => ({
      ...transaction,
      timestamp: new Date(transaction.timestamp),
      parsedAt: new Date(transaction.parsedAt),
    }));
  } catch {
    await AsyncStorage.removeItem(LEGACY_TRANSACTIONS_KEY);
    pipelineLog('db.migrate.legacyInvalidCleared');
    return [];
  }

  await saveStoredTransactions(ownerId, legacy);
  await AsyncStorage.removeItem(LEGACY_TRANSACTIONS_KEY);
  pipelineLog('db.migrate.legacyMoved', { count: legacy.length });
  return loadStoredTransactions(ownerId);
}

export async function clearStoredTransactions(): Promise<void> {
  await writeQueue.catch(() => undefined);
  await AsyncStorage.removeItem(LEGACY_TRANSACTIONS_KEY);
  if (Platform.OS === 'web') return;

  const database = databasePromise ? await databasePromise : null;
  if (database) {
    await database.closeAsync();
    databasePromise = null;
  }

  const SQLite = await import('expo-sqlite');
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  await SecureStore.deleteItemAsync(
    DATABASE_KEY_NAME,
    SECURE_STORE_OPTIONS
  );
}
