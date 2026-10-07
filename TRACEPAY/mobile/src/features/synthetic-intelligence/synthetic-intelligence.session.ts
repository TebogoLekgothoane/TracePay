import type { SyntheticScenarioAnalysis } from "./synthetic-intelligence.types";

let current: SyntheticScenarioAnalysis | null = null;

export function storeSyntheticAnalysis(analysis: SyntheticScenarioAnalysis): void {
  current = analysis;
}

export function readSyntheticAnalysis(): SyntheticScenarioAnalysis | null {
  return current;
}

export function clearSyntheticAnalysis(): void {
  current = null;
}

export function isSyntheticDebugSource(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) {
    return value[0] === "synthetic";
  }
  return value === "synthetic";
}
