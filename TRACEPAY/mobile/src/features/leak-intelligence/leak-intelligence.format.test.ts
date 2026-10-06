import {
  formatConfidence,
  formatCurrency,
  formatEvidence,
  formatImpactKind,
  formatPercentValue,
  formatPrimaryImpactLabel,
} from "./leak-intelligence.format";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name: string, run: () => void) {
  try {
    run();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("formats monetary and confidence values", () => {
  assert(formatCurrency("2655.48").includes("2"), "formats currency");
  assert(formatConfidence(0.8) === "80%", "formats confidence");
  assert(formatImpactKind("one_time") === "One-time", "formats impact kind");
  assert(formatPrimaryImpactLabel("one_time") === "Potential amount", "one-time impact label");
  assert(formatPrimaryImpactLabel("recurring") === "Monthly impact", "recurring impact label");
});

test("formats fee share with two decimal places and no duplicate percent", () => {
  assert(formatPercentValue("0.022359261737830622", "bank_fee_ratio") === "2.24%", "fee share");
  assert(formatPercentValue(0, "bank_fee_ratio") === "0.00%", "zero fee share");
});

test("renders allowlisted evidence as readable rows", () => {
  const rows = formatEvidence({
    previous_amount: "5715.86",
    current_amount: "8371.33",
    change_amount: "2655.47",
    change_percentage: "46.46",
    bank_fee_ratio: "0.02",
  });
  assert(rows.length === 5, "includes known evidence keys");
  assert(
    rows.some(
      (row) =>
        row.label === "Previous monthly baseline" && row.value.includes("5"),
    ),
    "formats baseline",
  );
  assert(
    rows.some((row) => row.label === "Change percentage" && row.value === "+46.46%"),
    "formats percentage",
  );
  const feeRow = rows.find((row) => row.label === "Fee share of spending");
  assert(feeRow?.value === "2.00%", "formats bank fee ratio once");
});

test("redacts raw identity and transaction evidence", () => {
  const rows = formatEvidence({
    merchant_key: "RAW MERCHANT REF 123456789",
    transaction_ids: ["a", "b"],
    description: "RAW DESCRIPTION",
    account_number: "1234567890",
    candidate_amount: "50",
  });
  assert(rows.length === 1, "shows only safe evidence");
  assert(rows[0]?.label === "Potential duplicate amount", "keeps safe amount");
});
