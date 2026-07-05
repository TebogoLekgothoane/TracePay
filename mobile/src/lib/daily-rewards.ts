export const DAILY_CHECK_IN_POINTS = 1;

export function getUtcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
