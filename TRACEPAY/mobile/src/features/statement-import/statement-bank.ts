/**
 * Canonical bank identity for statements (a user may upload many per bank).
 * Mirrors TRACEPAY/backend/pdf_processor/statement_schema.py aliases
 * and public.normalize_statement_bank_key().
 */

export const BANK_UNIDENTIFIED_MESSAGE =
  "We couldn't confidently identify the bank on this statement. Please verify you selected the correct bank, or try a clearer statement PDF.";

export const BANK_MISMATCH_MESSAGE =
  "This statement appears to be from a different bank than the one you selected. Please verify the bank and try again.";

export const BANK_REQUIRED_MESSAGE =
  "Select a supported bank before uploading a statement.";

/** Alias needles → canonical key. Longest / most specific first. */
const BANK_ALIAS_KEYS: ReadonlyArray<{ needle: RegExp; key: string }> = [
  // GoTyme (Tyme Group) statements map to TymeBank — TracePay's supported Tyme slot.
  { needle: /(?:^|[^a-z0-9])go\s*tyme(?:[^a-z0-9]|$)/, key: "tymebank" },
  { needle: /(?:^|[^a-z0-9])tyme\s*bank(?:[^a-z0-9]|$)/, key: "tymebank" },
  { needle: /^tymebank$/, key: "tymebank" },
  { needle: /^gotyme$/, key: "tymebank" },
  { needle: /(?:^|[^a-z0-9])standard\s*bank(?:[^a-z0-9]|$)/, key: "standard bank" },
  { needle: /(?:^|[^a-z0-9])first\s*national(?:[^a-z0-9]|$)/, key: "fnb" },
  { needle: /(?:^|[^a-z0-9])fnb(?:[^a-z0-9]|$)/, key: "fnb" },
  { needle: /(?:^|[^a-z0-9])discovery\s*bank(?:[^a-z0-9]|$)/, key: "discovery bank" },
  { needle: /^discovery$/, key: "discovery bank" },
  { needle: /(?:^|[^a-z0-9])african\s*bank(?:[^a-z0-9]|$)/, key: "african bank" },
  { needle: /(?:^|[^a-z0-9])capitec(?:[^a-z0-9]|$)/, key: "capitec" },
  { needle: /(?:^|[^a-z0-9])nedbank(?:[^a-z0-9]|$)/, key: "nedbank" },
  { needle: /(?:^|[^a-z0-9])investec(?:[^a-z0-9]|$)/, key: "investec" },
  { needle: /(?:^|[^a-z0-9])absa(?:[^a-z0-9]|$)/, key: "absa" },
];

export function normalizeStatementBankKey(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const haystack = raw.trim().toLowerCase();
  if (!haystack) return null;
  for (const alias of BANK_ALIAS_KEYS) {
    if (alias.needle.test(haystack)) {
      return alias.key;
    }
  }
  return null;
}

export function assertKnownStatementBankKey(
  raw: string | null | undefined,
): string {
  const key = normalizeStatementBankKey(raw);
  if (!key) {
    throw new Error(BANK_REQUIRED_MESSAGE);
  }
  return key;
}

/**
 * After PDF extraction: require a confident bank match against the selected institution.
 * Does not guess or silently accept unidentified banks.
 */
export function bankMismatchMessage(
  selectedInstitution: string | null | undefined,
  extractedBank: string | null | undefined,
): string {
  const selected = selectedInstitution?.trim();
  const extracted = extractedBank?.trim();
  if (selected && extracted) {
    return `This PDF looks like a ${extracted} statement, but you selected ${selected}. Choose the matching bank and try again.`;
  }
  return BANK_MISMATCH_MESSAGE;
}

export function assertExtractedBankMatchesSelected(
  selectedInstitution: string | null | undefined,
  extractedBank: string | null | undefined,
): void {
  const selectedKey = normalizeStatementBankKey(selectedInstitution);
  if (!selectedKey) {
    throw new Error(BANK_REQUIRED_MESSAGE);
  }
  const extractedKey = normalizeStatementBankKey(extractedBank);
  if (!extractedKey) {
    throw new Error(BANK_UNIDENTIFIED_MESSAGE);
  }
  if (extractedKey !== selectedKey) {
    throw new Error(bankMismatchMessage(selectedInstitution, extractedBank));
  }
}

export function isBankMismatchError(message: string): boolean {
  return (
    /different bank than the one you selected/i.test(message) ||
    /looks like a .+ statement, but you selected/i.test(message)
  );
}
