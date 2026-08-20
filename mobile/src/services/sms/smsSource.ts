export type SmsIngestionSource = 'device' | 'demo';

const DEFAULT_SOURCE: SmsIngestionSource = 'device';

/**
 * Controls where financial alerts are loaded from during ingestion.
 *
 * - device: Android inbox (production path)
 * - demo: remote transaction dataset for pitches / local testing
 *
 * Set EXPO_PUBLIC_SMS_SOURCE=demo and EXPO_PUBLIC_DEMO_SMS_URL in mobile/.env.
 */
export function getSmsIngestionSource(): SmsIngestionSource {
  const raw = process.env.EXPO_PUBLIC_SMS_SOURCE?.trim().toLowerCase();
  if (raw === 'demo') return 'demo';
  if (raw === 'device') return 'device';
  return DEFAULT_SOURCE;
}

export function isDemoSmsSource(): boolean {
  return getSmsIngestionSource() === 'demo';
}

export function getDemoSmsUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_DEMO_SMS_URL?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
