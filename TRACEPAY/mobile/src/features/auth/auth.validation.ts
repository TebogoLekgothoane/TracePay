const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidName(value: string): boolean {
  return value.trim().length >= 2;
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function isValidPassword(value: string): boolean {
  return value.length >= 8;
}

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
  return /^\+27\d{9}$/.test(normalizeSaPhone(phone));
}
