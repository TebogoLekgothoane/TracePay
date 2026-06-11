import { Platform } from 'react-native';
import AndroidSmsListener from 'react-native-android-sms-listener';

import { ParsedTransaction, RawSMS } from './sms.types';
import { makeTransactionId, inferCategory } from './sms.utils';
import { parserRegistry } from './ParserRegistry';
import { isSmsNativeModuleAvailable } from './SMSIngestionService';

type OnTransactionCallback = (transaction: ParsedTransaction) => void;
type OnErrorCallback = (error: Error, rawBody: string) => void;

interface ListenerSubscription {
  remove: () => void;
}

// ─── Listener ─────────────────────────────────────────────────────────────────

export class SMSListener {
  private subscription: ListenerSubscription | null = null;
  private onTransaction: OnTransactionCallback;
  private onError: OnErrorCallback;

  constructor(
    onTransaction: OnTransactionCallback,
    onError: OnErrorCallback = () => {}
  ) {
    this.onTransaction = onTransaction;
    this.onError = onError;
  }

  start(): boolean {
    if (Platform.OS !== 'android' || !isSmsNativeModuleAvailable()) return false;
    if (this.subscription) return true; // already listening

    this.subscription = AndroidSmsListener.addListener((message: { originatingAddress: string; body: string }) => {
      this.handleIncomingSMS(message);
    });

    return true;
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }

  get isActive(): boolean {
    return this.subscription !== null;
  }

  private handleIncomingSMS(message: { originatingAddress: string; body: string }): void {
    // Build a minimal RawSMS shape for the parser
    const sms: RawSMS = {
      _id: `live_${Date.now()}`,
      address: message.originatingAddress,
      body: message.body,
      date: Date.now(),
      date_sent: Date.now(),
      read: 0,
      type: 1,
    };

    if (!parserRegistry.isBankSMS(sms)) return;

    const parser = parserRegistry.findParser(sms);
    if (!parser) return;

    try {
      const result = parser.parse(sms);
      if (!result.success || !result.transaction) return;

      const tx = result.transaction;
      const transaction: ParsedTransaction = {
        ...tx,
        id: makeTransactionId(sms._id, sms.body),
        rawSmsId: sms._id,
        parsedAt: new Date(),
        category: inferCategory(tx.merchant),
      };

      this.onTransaction(transaction);
    } catch (err) {
      this.onError(err as Error, message.body);
    }
  }
}