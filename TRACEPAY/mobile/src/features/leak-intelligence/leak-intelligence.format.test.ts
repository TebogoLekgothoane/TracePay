import {
  DUPLICATE_MATCH_DISCLAIMER,
  formatConfidence,
  formatCurrency,
  formatDuplicateFinding,
  formatEvidence,
  formatFindingEvidence,
  formatImpactKind,
  formatPercentValue,
  formatPrimaryImpactLabel,
  merchantDisplayName,
  recognisedCategoryKey,
} from "./leak-intelligence.format";
import { parseLeakDetectionResult } from "./leak-intelligence.parse";
import { catalogLogoUrl, resolveCatalogLogo } from "../transactions/merchant-logos";

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

test("duplicate finding shows merchant, date, count, and both amounts", () => {
  const finding = formatDuplicateFinding({
    estimated_monthly_impact: "186.40",
    evidence: {
      merchant_key: "WOOLWORTHS",
      merchant_display_name: "Woolworths",
      description: "WOOLWORTHS REF 123456789",
      transaction_ids: ["wool-a", "wool-b"],
      observed_date: "2026-07-18",
      transaction_count_in_group: 2,
      candidate_amount: "186.40",
      group_total: "372.80",
      date_span_days: 0,
      verification_required: true,
    },
  });
  const labels = finding.rows.map((row) => row.label);
  assert(
    labels.join("|") ===
      "Merchant|Transaction date|Matching transactions|Amount per transaction|Candidate amount",
    "duplicate rows",
  );
  assert(finding.rows[0]?.value === "Woolworths", "merchant");
  assert(finding.rows[1]?.value === "2026-07-18", "date");
  assert(finding.rows[2]?.value === "2", "count");
  assert(finding.rows[3]?.value === formatCurrency("186.40"), "amount per transaction");
  assert(finding.rows[4]?.value === formatCurrency("186.40"), "candidate amount");
  assert(finding.disclaimer === DUPLICATE_MATCH_DISCLAIMER, "disclaimer");
  const rendered = finding.rows.map((row) => `${row.label} ${row.value}`).join(" ");
  assert(!rendered.includes("WOOLWORTHS REF"), "hides description");
  assert(!rendered.includes("wool-a"), "hides transaction ids");
  assert(!rendered.includes("372.80"), "hides group total");
  assert(!labels.includes("Date span"), "hides repeated date span");
  assert(!labels.includes("Verification required"), "hides repeated verification row");
  assert(!labels.includes("Potential duplicate amount"), "does not repeat the generic amount label");
});

test("card boilerplate and sensitive keys stay off the finding", () => {
  assert(merchantDisplayName({ merchant_display_name: "With Card At" }) === null, "boilerplate");
  assert(
    merchantDisplayName({ merchant_display_name: "PURCHASE WITH CARD AT" }) === null,
    "purchase boilerplate",
  );
  assert(resolveCatalogLogo("With Card At") === null, "boilerplate logo");
  assert(resolveCatalogLogo("PURCHASE WITH CARD AT") === null, "purchase boilerplate logo");
  const rows = formatFindingEvidence("recurring_payment_leak", {
    merchant_key: "WITH CARD AT",
    merchant_display_name: "With Card At",
    description: "PURCHASE WITH CARD AT",
    transaction_ids: ["tx-1"],
  });
  assert(rows.length === 0, "no merchant row for boilerplate");
});

test("catalogue logos match reliable names and reject arbitrary text", () => {
  const woolworths = resolveCatalogLogo("Woolworths");
  const checkers = resolveCatalogLogo("Checkers");
  assert(woolworths?.domain === "woolworths.co.za", "woolworths domain");
  assert(checkers?.domain === "checkers.co.za", "checkers domain");
  assert(
    catalogLogoUrl(woolworths?.domain ?? "") === "https://logos.hunter.io/woolworths.co.za",
    "validated hunter url",
  );
  assert(resolveCatalogLogo("North Cafe") === null, "unknown merchant");
  assert(catalogLogoUrl("Woolworths") === null, "display name is not a domain");
  assert(catalogLogoUrl("https://evil.example/woolworths.co.za") === null, "rejects url");
  assert(catalogLogoUrl("not-a-catalog.example") === null, "rejects unknown domain");
});

test("category finding keeps its category and has no logo without a merchant", () => {
  const rows = formatFindingEvidence("food_spending_leak", {
    category_name: "Groceries",
    category_transaction_count: 4,
    merchant_key: "HIDDEN MERCHANT",
  });
  assert(rows.some((row) => row.label === "Category" && row.value === "Groceries"), "category");
  assert(!rows.some((row) => row.label === "Merchant"), "no merchant row");
  assert(recognisedCategoryKey("Groceries") === "groceries", "category icon key");
  assert(recognisedCategoryKey("Unknown category") === null, "unrecognised category");
  assert(resolveCatalogLogo(null) === null, "no logo");
});

test("payloads without merchant_display_name still parse and render", () => {
  const parsed = parseLeakDetectionResult({
    user_id: "user-a",
    transaction_count: 3,
    period_start: "2026-07-01",
    period_end: "2026-09-30",
    detector_version: "1.0",
    leaks: [
      {
        leak_id: "a".repeat(16),
        fingerprint: "b".repeat(16),
        leak_type: "duplicate_payment_leak",
        title: "Potential duplicate payment requires verification",
        description: "Same-day transactions with the same merchant and amount.",
        severity: "low",
        confidence: 0.62,
        status: "active",
        estimated_monthly_impact: "186.40",
        estimated_annual_impact: null,
        impact_kind: "one_time",
        evidence: {
          observed_date: "2026-07-18",
          transaction_count_in_group: 2,
          candidate_amount: "186.40",
          verification_required: true,
        },
        supporting_behavior_ids: [],
        supporting_feature_references: ["duplicate_candidates"],
        detector_version: "1.0",
        detected_at: "2026-09-30T00:00:00+00:00",
        period_start: "2026-07-01",
        period_end: "2026-09-30",
      },
    ],
  });
  const leak = parsed.leaks[0];
  assert(leak, "parsed");
  assert(merchantDisplayName(leak.evidence) === null, "missing display name");
  const finding = formatDuplicateFinding(leak);
  assert(!finding.rows.some((row) => row.label === "Merchant"), "no merchant row");
  assert(finding.rows.some((row) => row.label === "Transaction date"), "date still shown");
  assert(finding.disclaimer === DUPLICATE_MATCH_DISCLAIMER, "disclaimer still shown");
});
