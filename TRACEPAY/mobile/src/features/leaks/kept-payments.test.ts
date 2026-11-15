import assert from "node:assert/strict";

import { countsAsLeak, categoryTotal, leakDebugCategoryByKey } from "../leak-intelligence/leak-debug-categories";
import type { LeakDetection, LeakDetectionResult } from "../leak-intelligence/leak-intelligence.types";
import { isKeptLeak, leakMerchantKey, normaliseMerchantKey, withoutKept } from "./kept-payments";

function leak(over: Partial<LeakDetection> & { fingerprint: string }): LeakDetection {
  return {
    leak_id: over.fingerprint,
    leak_type: "subscription_leak",
    title: "t",
    description: "",
    severity: "medium",
    confidence: 0.9,
    status: "active",
    estimated_monthly_impact: 100,
    estimated_annual_impact: null,
    impact_kind: "recurring",
    evidence: {},
    supporting_behavior_ids: [],
    supporting_feature_references: [],
    supporting_transactions: [],
    supporting_transaction_count: 1,
    detector_version: "t",
    detected_at: "2026-11-01T00:00:00Z",
    period_start: null,
    period_end: null,
    ...over,
  };
}

const result: LeakDetectionResult = {
  user_id: "u",
  transaction_count: 1,
  period_start: null,
  period_end: null,
  detector_version: "t",
  questions: [],
  questions_not_shown: 0,
  leaks: [
    leak({ fingerprint: "a", evidence: { merchant_key: "Netflix" }, estimated_monthly_impact: 159 }),
    leak({ fingerprint: "b", evidence: { merchant_display_name: "Gym Pass" }, estimated_monthly_impact: 199 }),
    leak({ fingerprint: "c", leak_type: "recurring_transfer_leak", value_group: "commitment", estimated_monthly_impact: 500 }),
    leak({ fingerprint: "d", evidence: {}, estimated_monthly_impact: 20 }),
  ],
};

assert.equal(normaliseMerchantKey("  Netflix "), "netflix");
assert.equal(leakMerchantKey(result.leaks[0]), "netflix");
assert.equal(leakMerchantKey(result.leaks[3]), null, "a finding with no merchant cannot be kept");

// Keeping a merchant removes just its findings, whichever field names it.
const kept = new Set(["netflix"]);
assert.ok(isKeptLeak(result.leaks[0], kept));
assert.deepEqual(withoutKept(result, kept)!.leaks.map((l) => l.fingerprint), ["b", "c", "d"]);
assert.equal(withoutKept(result, new Set()), result, "nothing kept, nothing copied");
assert.equal(withoutKept(null, kept), null);

// A commitment is listed but never added into the leak total.
assert.equal(countsAsLeak(result.leaks[2]), false);
assert.equal(countsAsLeak(result.leaks[0]), true);
const subs = categoryTotal(leakDebugCategoryByKey("subs")!, result.leaks);
assert.equal(subs.monthly, 159 + 199 + 20);
const debit = categoryTotal(leakDebugCategoryByKey("debit")!, result.leaks);
assert.deepEqual(debit, { count: 0, monthly: 0 }, "the commitment adds nothing to the debit total");

console.log("kept-payments.test.ts: ok");
