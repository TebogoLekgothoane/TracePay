import { TransactionImportError } from "./transaction-import.errors";
import type { CsvDelimiter, ParsedCsvFile } from "./transaction-import.types";

const DELIMITERS: readonly CsvDelimiter[] = [",", ";", "\t", "|"];

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function splitLines(text: string): string[] {
  return stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function countDelimiter(line: string, delimiter: CsvDelimiter): number {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      const next = line[index + 1];
      if (inQuotes && next === "\"") {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }

  return count;
}

function detectDelimiter(text: string): CsvDelimiter {
  const sampleLines = splitLines(text)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);

  if (sampleLines.length === 0) {
    throw new TransactionImportError("empty_csv", "The selected CSV file is empty.");
  }

  let bestDelimiter: CsvDelimiter = ",";
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const counts = sampleLines.map((line) => countDelimiter(line, delimiter));
    const score = counts.reduce((sum, value) => sum + value, 0);
    const consistent = counts.every((value) => value === counts[0]);

    if (score > bestScore && score > 0) {
      bestDelimiter = delimiter;
      bestScore = score + (consistent ? 1 : 0);
    }
  }

  if (bestScore < 0) {
    throw new TransactionImportError(
      "malformed_csv",
      "This CSV uses an unsupported layout. Check that rows are separated with commas, semicolons, or tabs.",
    );
  }

  return bestDelimiter;
}

function parseDelimitedText(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const normalized = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new TransactionImportError(
      "malformed_csv",
      "This CSV contains malformed quoted text. Fix any broken quotes and try again.",
    );
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows
    .map((current) => current.map((value) => value.trim()))
    .filter((current) => current.some((value) => value.length > 0));
}

export function parseCsvText(text: string): ParsedCsvFile {
  const trimmed = stripBom(text).trim();
  if (!trimmed) {
    throw new TransactionImportError("empty_csv", "The selected CSV file is empty.");
  }

  const delimiter = detectDelimiter(trimmed);
  const parsedRows = parseDelimitedText(trimmed, delimiter);
  const [headers, ...rows] = parsedRows;

  if (!headers || headers.length === 0) {
    throw new TransactionImportError(
      "malformed_csv",
      "This CSV is missing a header row with column names.",
    );
  }

  if (rows.length === 0) {
    throw new TransactionImportError(
      "empty_csv",
      "This CSV does not contain any transaction rows.",
    );
  }

  return {
    delimiter,
    headers,
    rows,
  };
}
