import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ParsedTransaction,
  PermissionStatus,
  SMSServiceState,
} from '../services/sms/sms.types';
import { getUserId } from '@/constants/api';
import {
  clearStoredTransactions,
  migrateLegacyTransactions,
  saveStoredTransactions,
} from '@/services/transactions/transactionRepository';
import {
  checkSMSPermission,
  requestSMSPermission,
  ingestSMS,
  openAppPermissionSettings,
  getSmsPermissionBlockedHelp,
  createSmsListener,
  isDemoSmsSource,
  type SmsListenerInstance,
} from '../services/sms/sms-module';
import {
  enrichParsedTransaction,
  isValidStoredTransaction,
} from '../lib/transaction-display';
import { analyzeMobileTransactions } from '@/services/analysis/transactionAnalysis';
import { useLeaksStore } from '@/stores/leaksStore';
import { pipelineError, pipelineLog } from '@/lib/pipeline-log';

const STORAGE_KEYS = {
  LAST_SYNC:    '@tracepay/lastSync',
} as const;

interface UseSMSIngestionReturn {
  transactions: ParsedTransaction[];
  state: SMSServiceState;
  isLoading: boolean;
  error: string | null;
  isDemoMode: boolean;
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

  const listenerRef = useRef<SmsListenerInstance | null>(null);
  const transactionsRef = useRef<ParsedTransaction[]>([]);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const syncInFlightRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const normalizeTransactions = useCallback(
    (txs: ParsedTransaction[]) =>
      txs.filter(isValidStoredTransaction).map(enrichParsedTransaction),
    [],
  );

  const persistTransactions = useCallback(async (txs: ParsedTransaction[]) => {
    const ownerId = await getUserId();
    pipelineLog('persist.start', { ownerIdPrefix: ownerId.slice(0, 8), count: txs.length });
    await saveStoredTransactions(ownerId, txs);
    pipelineLog('persist.done', { count: txs.length });
  }, []);

  const loadPersistedTransactions = useCallback(async (): Promise<ParsedTransaction[]> => {
    const ownerId = await getUserId();
    pipelineLog('boot.loadStored.start', { ownerIdPrefix: ownerId.slice(0, 8) });
    const stored = await migrateLegacyTransactions(ownerId);
    pipelineLog('boot.loadStored.done', { count: stored.length });
    return stored
      .filter(isValidStoredTransaction)
      .map(enrichParsedTransaction);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        pipelineLog('boot.start');
        const [stored, permission, lastSyncRaw] = await Promise.all([
          loadPersistedTransactions(),
          checkSMSPermission(),
          AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC),
        ]);

        if (cancelled) return;

        pipelineLog('boot.ready', {
          storedCount: stored.length,
          permission,
          hasLastSync: Boolean(lastSyncRaw),
          demoMode: isDemoSmsSource(),
        });
        setTransactions(stored);
        setServiceState((prev) => ({
          ...prev,
          permissionStatus: permission,
          lastSyncAt: lastSyncRaw ? new Date(lastSyncRaw) : null,
          totalIngested: stored.length,
        }));
      } catch (err) {
        pipelineError('boot', err);
        if (!cancelled) {
          setError((err as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadPersistedTransactions]);

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

  const syncNow = useCallback((): Promise<boolean> => {
    if (syncInFlightRef.current) {
      pipelineLog('sync.skipped', { reason: 'already in flight' });
      return syncInFlightRef.current;
    }

    const operation = (async () => {
      setIsLoading(true);
      setError(null);
      const demoMode = isDemoSmsSource();
      pipelineLog('sync.start', { demoMode });

      try {
        if (!demoMode) {
          let permission = await checkSMSPermission();
          pipelineLog('sync.permission.check', { permission });
          if (permission !== 'granted') {
            permission = await requestSMSPermission();
            pipelineLog('sync.permission.request', { permission });
            setServiceState((prev) => ({ ...prev, permissionStatus: permission }));
          }
          if (permission !== 'granted') {
            throw new Error(await getSmsPermissionBlockedHelp());
          }
        } else {
          setServiceState((prev) => ({ ...prev, permissionStatus: 'granted' }));
          pipelineLog('sync.permission.skipped', { reason: 'demo mode' });
        }

        const current = normalizeTransactions(transactionsRef.current);
        pipelineLog('sync.ingest.start', { existingCount: current.length });
        const result = await ingestSMS({ existingTransactions: current });
        const newTransactions = normalizeTransactions(result.transactions);
        pipelineLog('sync.ingest.done', {
          total: result.total,
          parsed: result.parsed,
          skipped: result.skipped,
          failed: result.failed,
          newCount: newTransactions.length,
          sampleProviders: newTransactions.slice(0, 5).map((tx) => tx.bank),
        });

        const existingIds = new Set(current.map((t) => t.id));
        const merged = [
          ...newTransactions.filter((t) => !existingIds.has(t.id)),
          ...current,
        ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        pipelineLog('sync.merge.done', { mergedCount: merged.length });

        setTransactions(merged);
        await persistTransactions(merged);

        analysisAbortRef.current?.abort();
        const controller = new AbortController();
        analysisAbortRef.current = controller;
        pipelineLog('sync.analyze.start', {
          count: merged.length,
          channel: demoMode ? 'demo' : 'sms',
        });
        const report = await analyzeMobileTransactions(
          merged,
          demoMode ? 'demo' : 'sms',
          controller.signal
        );
        if (analysisAbortRef.current !== controller) {
          throw new Error('Analysis request was superseded.');
        }
        pipelineLog('sync.analyze.done', {
          healthScore: report.healthScore,
          healthBand: report.healthBand,
          leakCount: report.leaks.length,
        });
        await useLeaksStore.getState().replaceWithAnalysis(report);
        analysisAbortRef.current = null;

        const now = new Date();
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, now.toISOString());

        setServiceState((prev) => ({
          ...prev,
          lastSyncAt: now,
          totalIngested: merged.length,
        }));
        pipelineLog('sync.success', { totalIngested: merged.length });
        return true;
      } catch (err) {
        pipelineError('sync', err);
        setError((err as Error).message);
        return false;
      } finally {
        setIsLoading(false);
      }
    })();

    syncInFlightRef.current = operation;
    void operation.finally(() => {
      if (syncInFlightRef.current === operation) {
        syncInFlightRef.current = null;
      }
    });
    return operation;
  }, [normalizeTransactions, persistTransactions]);

  const startListening = useCallback(() => {
    if (isDemoSmsSource()) return;
    if (listenerRef.current?.isActive) return;

    void (async () => {
      try {
        const listener = await createSmsListener(
          (tx) => {
            setTransactions((prev) => {
              const alreadyExists = prev.some((t) => t.id === tx.id);
              if (alreadyExists) return prev;
              const updated = [tx, ...prev];
              void persistTransactions(updated);
              return updated;
            });
            setServiceState((prev) => ({
              ...prev,
              totalIngested: prev.totalIngested + 1,
            }));
          },
          (err) => setError(err.message),
        );

        listenerRef.current = listener;
        const started = listener.start();
        setServiceState((prev) => ({ ...prev, isListening: started }));
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [persistTransactions]);

  const stopListening = useCallback(() => {
    listenerRef.current?.stop();
    listenerRef.current = null;
    setServiceState((prev) => ({ ...prev, isListening: false }));
  }, []);

  useEffect(() => {
    return () => {
      listenerRef.current?.stop();
      analysisAbortRef.current?.abort();
    };
  }, []);

  const clearTransactions = useCallback(async () => {
    await Promise.all([
      clearStoredTransactions(),
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC),
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
    isDemoMode: isDemoSmsSource(),
    requestPermission,
    refreshPermission,
    openPermissionSettings,
    syncNow,
    startListening,
    stopListening,
    clearTransactions,
  };
}
