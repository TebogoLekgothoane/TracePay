/**
 * Dev-only pipeline logger. Never logs secrets, raw SMS, or encryption keys.
 */
export function pipelineLog(stage: string, data?: Record<string, unknown>) {
  if (!__DEV__) return;
  if (data) {
    console.log(`[TracePay] ${stage}`, data);
  } else {
    console.log(`[TracePay] ${stage}`);
  }
}

export function pipelineError(stage: string, error: unknown) {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`[TracePay] ${stage} FAILED`, { name, message });
}
