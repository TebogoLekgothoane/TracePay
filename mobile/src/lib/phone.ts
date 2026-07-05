/** Normalize SA mobile input to E.164 (+27…) for Supabase phone auth. */
export function normalizeSaPhone(phone: string): string {
  const digits = phone.replace(/\s/g, "");

  if (digits.startsWith("+27")) {
    return `+27${digits.slice(3).replace(/\D/g, "")}`;
  }
  if (digits.startsWith("27")) {
    return `+27${digits.slice(2).replace(/\D/g, "")}`;
  }
  if (digits.startsWith("0")) {
    return `+27${digits.slice(1).replace(/\D/g, "")}`;
  }

  return `+27${digits.replace(/\D/g, "")}`;
}

export function isValidSaPhone(phone: string): boolean {
  const normalized = normalizeSaPhone(phone);
  return /^\+27\d{9}$/.test(normalized);
}
