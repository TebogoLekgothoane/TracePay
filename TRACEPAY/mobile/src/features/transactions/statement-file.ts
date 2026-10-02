import * as Crypto from "expo-crypto";

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return globalThis.btoa(binary);
}

export async function hashStatementContent(bytes: ArrayBuffer): Promise<string> {
  const base64 = bytesToBase64(new Uint8Array(bytes));
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
}

export async function readPdfBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error("TracePay could not read the selected PDF.");
  }
  if (typeof response.arrayBuffer === "function") {
    return response.arrayBuffer();
  }
  const blob = await response.blob();
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }
  throw new Error("TracePay could not read the selected PDF.");
}
