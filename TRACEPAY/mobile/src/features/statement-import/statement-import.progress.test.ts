import {
  estimateExtractionMs,
  extractingProgressRatio,
  formatElapsed,
  formatWaitHint,
  STATEMENT_IMPORT_STAGE_RATIO,
} from "./statement-import.progress";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(estimateExtractionMs(500_000) >= 40_000, "small files get a floor estimate");
assert(estimateExtractionMs(20 * 1024 * 1024) <= 240_000, "large files are capped");
assert(
  extractingProgressRatio(0, 60_000) === STATEMENT_IMPORT_STAGE_RATIO.extracting,
  "extracting starts at stage floor",
);
assert(
  extractingProgressRatio(60_000, 60_000) < 0.9,
  "extracting never reaches saving before completion",
);
assert(formatWaitHint(10_000) === "Almost finished", "short remaining wait");
assert(formatWaitHint(90_000) === "About 2 minutes left", "minute remaining wait");
assert(formatElapsed(45_000) === "45s elapsed", "seconds elapsed");
assert(formatElapsed(125_000) === "2m 05s elapsed", "minutes elapsed");

console.log("statement-import progress tests passed");
