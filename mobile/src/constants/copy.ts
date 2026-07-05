export function leakAnalysisComingSoon(count: number): string {
  const noun = count === 1 ? "transaction" : "transactions";
  return `We imported ${count} ${noun} from your SMS. Leak analysis is coming soon — we'll flag recurring fees, subscriptions, and hidden charges when ready.`;
}

export const LEAK_ANALYSIS_HOME =
  "Your SMS transactions are imported. Leak analysis is coming soon — we'll flag recurring fees and hidden charges when ready.";
