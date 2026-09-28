/** Documented max ingestion batch constraints — keep Express JSON limit in sync. */
export const MAX_BATCH_SIZE = 100;
export const MAX_CLIENT_ID = 128;
export const MAX_BODY = 4000;
export const MAX_SENDER = 128;
export const MAX_APP_IDENTIFIER = 256;
export const MAX_TITLE = 256;
export const MAX_METADATA_BYTES = 8192;
export const MAX_FUTURE_MS = 5 * 60 * 1000;

/** Per-reading JSON overhead for keys, punctuation, and ISO timestamps. */
const PER_READING_JSON_OVERHEAD = 512;
const BATCH_ENVELOPE_OVERHEAD = 4096;

/**
 * Upper bound for a valid max-size batch so Express does not 413 documented payloads.
 * Derived from field caps in this module — do not lower independently.
 */
export const MAX_INGESTION_JSON_BYTES =
  MAX_BATCH_SIZE *
    (MAX_CLIENT_ID +
      MAX_BODY +
      MAX_METADATA_BYTES +
      MAX_SENDER +
      MAX_APP_IDENTIFIER +
      MAX_TITLE +
      PER_READING_JSON_OVERHEAD) +
  BATCH_ENVELOPE_OVERHEAD;
