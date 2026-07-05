import { Platform } from 'react-native';

import type { ParsedTransaction, PermissionStatus } from './sms.types';

type SmsIngestionModule = typeof import('./SMSIngestionService');
type SmsListenerModule = typeof import('./SMSListener');

let ingestionModule: SmsIngestionModule | null = null;
let listenerModule: SmsListenerModule | null = null;

async function loadIngestionModule(): Promise<SmsIngestionModule> {
  if (!ingestionModule) {
    ingestionModule = await import('./SMSIngestionService');
  }
  return ingestionModule;
}

async function loadListenerModule(): Promise<SmsListenerModule> {
  if (!listenerModule) {
    listenerModule = await import('./SMSListener');
  }
  return listenerModule;
}

export async function checkSMSPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'denied';
  const sms = await loadIngestionModule();
  return sms.checkSMSPermission();
}

export async function requestSMSPermission(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'denied';
  const sms = await loadIngestionModule();
  return sms.requestSMSPermission();
}

export async function openAppPermissionSettings(): Promise<void> {
  const sms = await loadIngestionModule();
  await sms.openAppPermissionSettings();
}

export async function ingestSMS(
  options: Parameters<SmsIngestionModule['ingestSMS']>[0],
) {
  const sms = await loadIngestionModule();
  return sms.ingestSMS(options);
}

export async function getSmsPermissionBlockedHelp(): Promise<string> {
  const sms = await loadIngestionModule();
  return sms.SMS_PERMISSION_BLOCKED_HELP;
}

export type SmsListenerInstance = InstanceType<SmsListenerModule['SMSListener']>;

export async function createSmsListener(
  onTransaction: (transaction: ParsedTransaction) => void,
  onError: (error: Error, rawBody: string) => void = () => {},
): Promise<SmsListenerInstance> {
  const mod = await loadListenerModule();
  return new mod.SMSListener(onTransaction, onError);
}
