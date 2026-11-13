import {
  resolveTransactionLogo,
} from "./merchant-logos";
import { extractMerchantCandidate } from "./merchant-extract";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test("CapCut recurring purchase resolves to CapCut logo", () => {
  const result = resolveTransactionLogo({
    description: "Recurring Card Purchase: Capcut Video E London (Card 4426)",
    merchantName: null,
    category: "Subscriptions",
    transactionClass: "spending",
    type: "debit",
  });
  assert(result.domain === "capcut.com", `got ${result.domain}`);
});

test("airtime advance without network uses dedicated logo", () => {
  const result = resolveTransactionLogo({
    description: "Banking App Airtime Advance Fee (XCXMQUPBLRA4)",
    merchantName: null,
    category: "Airtime & Data",
    transactionClass: "spending",
    type: "debit",
  });
  assert(result.domain === "airtime-advance.tracepay", `got ${result.domain}`);
});

test("payment received from a bank uses bank logo", () => {
  const result = resolveTransactionLogo({
    description: "Payment Received: Absa Bank Sbm Learnership Transfer",
    merchantName: null,
    category: "Income",
    transactionClass: "income",
    type: "credit",
  });
  assert(result.domain === "absa.co.za", `got ${result.domain}`);
});

test("transfer received from a person uses initials", () => {
  const result = resolveTransactionLogo({
    description: "Banking App Transfer Received from Luvo Ngesi: Transfer",
    merchantName: null,
    category: "Transfers",
    transactionClass: "internal_transfer",
    type: "credit",
  });
  assert(result.kind === "person", `kind ${result.kind}`);
  assert(result.initials === "LN", `initials ${result.initials}`);
});

test("extracts CapCut from recurring description", () => {
  const label = extractMerchantCandidate(
    "Recurring Card Purchase: Capcut Video E London (Card 4426)",
  );
  assert(label?.toLowerCase().includes("capcut"), `got ${label}`);
});
