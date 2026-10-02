export type StatementImportStage =
  | "preparing"
  | "uploading"
  | "extracting"
  | "saving";

export type StatementImportProgress = {
  stage: StatementImportStage;
  /** Floor progress for the current stage (0–1). */
  ratio: number;
};

export const STATEMENT_IMPORT_STAGE_COPY: Record<
  StatementImportStage,
  { title: string; detail: string }
> = {
  preparing: {
    title: "Preparing your PDF…",
    detail: "Reading the selected statement.",
  },
  uploading: {
    title: "Uploading securely…",
    detail: "Sending your statement for processing.",
  },
  extracting: {
    title: "Extracting transactions…",
    detail: "Larger or scanned PDFs can take a few minutes.",
  },
  saving: {
    title: "Saving transactions…",
    detail: "Almost done — writing results to your account.",
  },
};

/** Stage floor ratios so the bar only moves forward. */
export const STATEMENT_IMPORT_STAGE_RATIO: Record<StatementImportStage, number> =
  {
    preparing: 0.06,
    uploading: 0.16,
    extracting: 0.28,
    saving: 0.9,
  };

const EXTRACTING_CEILING = 0.86;

/**
 * Rough client-side estimate for the long PDF-processor step.
 * Tuned for text PDFs (faster) vs larger/OCR-heavy files (slower).
 */
export function estimateExtractionMs(fileSizeBytes: number | null | undefined): number {
  const mb = Math.max((fileSizeBytes ?? 1_500_000) / (1024 * 1024), 0.25);
  return Math.min(240_000, Math.max(40_000, Math.round(35_000 + mb * 28_000)));
}

/** Soft progress while waiting on the processor (never reaches saving). */
export function extractingProgressRatio(elapsedMs: number, estimateMs: number): number {
  const floor = STATEMENT_IMPORT_STAGE_RATIO.extracting;
  if (estimateMs <= 0) return floor;
  const t = Math.min(elapsedMs / estimateMs, 1);
  // Ease out so early movement is visible, then slows near the ceiling.
  const eased = 1 - (1 - t) ** 1.6;
  return floor + (EXTRACTING_CEILING - floor) * eased;
}

export function formatWaitHint(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (seconds <= 15) return "Almost finished";
  if (seconds < 60) return `About ${seconds} seconds left`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return "About 1 minute left";
  return `About ${minutes} minutes left`;
}

export function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 60) return `${seconds}s elapsed`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest.toString().padStart(2, "0")}s elapsed`;
}
