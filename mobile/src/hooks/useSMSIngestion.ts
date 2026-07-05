import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ParsedTransaction,
  PermissionStatus,
  SMSServiceState,
} from '../services/sms/sms.types';
import {
  requestSMSPermission,
  checkSMSPermission,
  ingestSMS,
  openAppPermissionSettings,
  SMS_PERMISSION_BLOCKED_HELP,
} from '../services/sms/SMSIngestionService';
import { SMSListener } from '../services/sms/SMSListener';
import {
  enrichParsedTransaction,
  isValidStoredTransaction,
} from '../lib/transaction-display';

const STORAGE_KEYS = {
  TRANSACTIONS: '@tracepay/transactions',
  LAST_SYNC:    '@tracepay/lastSync',
} as const;

interface UseSMSIngestionReturn {
  // State
  transactions: ParsedTransaction[];
  state: SMSServiceState;
  isLoading: boolean;
  error: string | null;

  // Actions
  requestPermission: () => Promise<PermissionStatus>;
  refreshPermission: () => Promise<PermissionStatus>;
  openPermissionSettings: () => Promise<void>;
  syncNow: () => Promise<boolean>;
  startListening: () => void;
  stopListening: () => void;
  clearTransactions: () => Promise<void>;
}

export function useSMSIngestion(): UseSMSIngestionReturn {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceState, setServiceState] = useState<SMSServiceState>({
    permissionStatus: 'undetermined',
    isListening: false,
    lastSyncAt: null,
    totalIngested: 0,
  });

  const listenerRef = useRef<SMSListener | null>(null);
  const transactionsRef = useRef<ParsedTransaction[]>([]);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const normalizeTransactions = useCallback(
    (txs: ParsedTransaction[]) =>
      txs.filter(isValidStoredTransaction).map(enrichParsedTransaction),
    [],
  );

  // ── Persist & restore ────────────────────────────────────────────────────────

  const persistTransactions = useCallback(async (txs: ParsedTransaction[]) => {
    await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
  }, []);

  const loadPersistedTransactions = useCallback(async (): Promise<ParsedTransaction[]> => {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ParsedTransaction[];
    // Rehydrate Date objects
    return parsed
      .map((t) => ({
        ...t,
        timestamp: new Date(t.timestamp),
        parsedAt: new Date(t.parsedAt),
      }))
      .filter(isValidStoredTransaction)
      .map(enrichParsedTransaction);
  }, []);

  // ── Boot: restore state and check permission ──────────────────────────────

  useEffect(() => {
    (async () => {
      const [stored, permission, lastSyncRaw] = await Promise.all([
        loadPersistedTransactions(),
        checkSMSPermission(),
        AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC),
      ]);

      setTransactions(stored);
      setServiceState((prev) => ({
        ...prev,
        permissionStatus: permission,
        lastSyncAt: lastSyncRaw ? new Date(lastSyncRaw) : null,
        totalIngested: stored.length,
      }));
    })();
  }, [loadPersistedTransactions]);

  // ── Permission ────────────────────────────────────────────────────────────

  const requestPermission = useCallback(async (): Promise<PermissionStatus> => {
    const status = await requestSMSPermission();
    setServiceState((prev) => ({ ...prev, permissionStatus: status }));
    return status;
  }, []);

  const refreshPermission = useCallback(async (): Promise<PermissionStatus> => {
    const status = await checkSMSPermission();
    setServiceState((prev) => ({ ...prev, permissionStatus: status }));
    return status;
  }, []);

  const openPermissionSettings = useCallback(async () => {
    await openAppPermissionSettings();
  }, []);

  // ── Sync (batch ingest) ───────────────────────────────────────────────────

  const syncNow = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      let permission = await checkSMSPermission();
      if (permission !== 'granted') {
        permission = await requestSMSPermission();
        setServiceState((prev) => ({ ...prev, permissionStatus: permission }));
      }
      if (permission !== 'granted') {
        throw new Error(SMS_PERMISSION_BLOCKED_HELP);
      }

      const current = normalizeTransactions(transactionsRef.current);
      const result = await ingestSMS({ existingTransactions: current });
      const newTransactions = normalizeTransactions(result.transactions);

      const existingIds = new Set(current.map((t) => t.id));
      const merged = [
        ...newTransactions.filter((t) => !existingIds.has(t.id)),
        ...current,
      ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      setTransactions(merged);
      await persistTransactions(merged);

      const now = new Date();
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, now.toISOString());

      setServiceState((prev) => ({
        ...prev,
        lastSyncAt: now,
        totalIngested: merged.length,
      }));
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [normalizeTransactions, persistTransactions]);

  // ── Real-time listener ────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (listenerRef.current?.isActive) return;

    listenerRef.current = new SMSListener(
      (tx) => {
        setTransactions((prev) => {
          const alreadyExists = prev.some((t) => t.id === tx.id);
          if (alreadyExists) return prev;
          const updated = [tx, ...prev];
          persistTransactions(updated);
          return updated;
        });
        setServiceState((prev) => ({
          ...prev,
          totalIngested: prev.totalIngested + 1,
        }));
      },
      (err) => setError(err.message)
    );

    const started = listenerRef.current.start();
    setServiceState((prev) => ({ ...prev, isListening: started }));
  }, [persistTransactions]);

  const stopListening = useCallback(() => {
    listenerRef.current?.stop();
    listenerRef.current = null;
    setServiceState((prev) => ({ ...prev, isListening: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listenerRef.current?.stop();
    };
  }, []);

  // ── Clear ─────────────────────────────────────────────────────────────────

  const clearTransactions = useCallback(async () => {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.TRANSACTIONS,
      STORAGE_KEYS.LAST_SYNC,
    ]);
    setTransactions([]);
    setServiceState((prev) => ({
      ...prev,
      lastSyncAt: null,
      totalIngested: 0,
    }));
  }, []);

  return {
    transactions,
    state: serviceState,
    isLoading,
    error,
    requestPermission,
    refreshPermission,
    openPermissionSettings,
    syncNow,
    startListening,
    stopListening,
    clearTransactions,
  };
}