import type { DocumentPickerAsset } from "expo-document-picker";
import { File } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";

import { TransactionImportError } from "./transaction-import.errors";

const CSV_EXTENSIONS = new Set(["csv", "txt"]);

function normalizePickerUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^(file:|content:)/i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return `file://${trimmed}`;
  }

  return trimmed;
}

function looksLikeCsvFile(asset: DocumentPickerAsset): boolean {
  const name = asset.name?.trim().toLowerCase() ?? "";
  const extension = name.includes(".") ? (name.split(".").pop() ?? "") : "";

  if (CSV_EXTENSIONS.has(extension)) {
    return true;
  }

  const mimeType = asset.mimeType?.trim().toLowerCase() ?? "";
  return (
    mimeType.includes("csv") ||
    mimeType.includes("comma-separated") ||
    mimeType === "text/plain" ||
    mimeType === "application/vnd.ms-excel"
  );
}

function assertReadableCsvText(text: string): string {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) {
    throw new TransactionImportError("empty_csv", "The selected CSV file is empty.");
  }

  return text;
}

async function readWithFileClass(uri: string): Promise<string> {
  const file = new File(uri);
  return await file.text();
}

async function readWithLegacyApi(uri: string): Promise<string> {
  return await LegacyFileSystem.readAsStringAsync(uri, { encoding: "utf8" });
}

async function copyToCacheAndRead(uri: string): Promise<string> {
  const cacheDirectory = LegacyFileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error("Cache directory is unavailable.");
  }

  const destination = `${cacheDirectory}DocumentPicker-${Date.now()}.csv`;
  await LegacyFileSystem.copyAsync({ from: uri, to: destination });
  return await readWithLegacyApi(destination);
}

export async function readPickedCsvFile(asset: DocumentPickerAsset): Promise<string> {
  if (!asset.uri?.trim()) {
    throw new TransactionImportError(
      "file_access",
      "We could not access the selected file. Please try choosing it again.",
    );
  }

  if (!looksLikeCsvFile(asset)) {
    throw new TransactionImportError(
      "not_csv",
      "Please choose a CSV bank statement (.csv).",
    );
  }

  const uri = normalizePickerUri(asset.uri);
  const readers = [() => readWithFileClass(uri), () => readWithLegacyApi(uri), () => copyToCacheAndRead(uri)];
  let lastError: unknown;

  for (const read of readers) {
    try {
      return assertReadableCsvText(await read());
    } catch (error) {
      if (error instanceof TransactionImportError) {
        throw error;
      }
      lastError = error;
    }
  }

  if (__DEV__ && lastError instanceof Error) {
    console.warn("CSV file read failed:", lastError.message);
  }

  throw new TransactionImportError(
    "file_access",
    "We could not open the selected file on your device. Please try again or pick a different copy of your statement.",
  );
}
