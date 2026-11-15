export function parseRandAmount(value: string): number {
  const text = value.replace(/[R\s]/g, "");
  // South African formatting can print the decimals with a comma ("100,00"); a comma followed by
  // exactly one or two digits is a decimal point, anything else is a thousands separator.
  const normalised = /,\d{1,2}$/.test(text)
    ? text.replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "")
    : text.replace(/,/g, "");
  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatRandAmount(value: number): string {
  const formatted = Math.abs(value).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}R${formatted}`;
}
