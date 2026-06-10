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
} from '../services/sms/SMSIngestionService';
import { SMSListener } from '../services/sms/SMSListener';

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
  syncNow: () => Promise<void>;
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

  // ── Persist & restore ────────────────────────────────────────────────────────

  const persistTransactions = useCallback(async (txs: ParsedTransaction[]) => {
    await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
  }, []);

  const loadPersistedTransactions = useCallback(async (): Promise<ParsedTransaction[]> => {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ParsedTransaction[];
    // Rehydrate Date objects
    return parsed.map((t) => ({
      ...t,
      timestamp: new Date(t.timestamp),
      parsedAt: new Date(t.parsedAt),
    }));
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

  // ── Sync (batch ingest) ───────────────────────────────────────────────────

  const syncNow = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const current = await loadPersistedTransactions();
      const result = await ingestSMS({ existingTransactions: current });

      if (result.transactions.length > 0) {
        const merged = [
          ...result.transactions,
          ...current,
        ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        setTransactions(merged);
        await persistTransactions(merged);
      }

      const now = new Date();
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, now.toISOString());

      setServiceState((prev) => ({
        ...prev,
        lastSyncAt: now,
        totalIngested: current.length + result.transactions.length,
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [loadPersistedTransactions, persistTransactions]);

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
    syncNow,
    startListening,
    stopListening,
    clearTransactions,
  };
}