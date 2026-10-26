import assert from "node:assert/strict";

import { formatCents, formatWholeRand } from "./billing.format";
import { parseCheckout, parseEntitlements, parseVerify } from "./billing.parse";

const empty = parseEntitlements(null);
assert.equal(empty.fullAnalysis.unlocked, false);
assert.equal(empty.monitoring.status, "none");
assert.equal(empty.monitoring.active, false);

// A missing or malformed answer must never read as paid.
assert.equal(parseEntitlements({ full_analysis: { unlocked: "true" } }).fullAnalysis.unlocked, false);

const paid = parseEntitlements({
  full_analysis: { unlocked: true, analysis_keys: ["primary", 3], purchased_at: "2026-10-26T10:00:00Z" },
  monitoring: { active: true, status: "active", current_period_end: "2027-10-26T10:00:00Z" },
  pending: [{ reference: "tp_1", product: "annual_monitoring", created_at: "x" }, { reference: 5 }],
});
assert.deepEqual(paid.fullAnalysis.analysisKeys, ["primary"]);
assert.equal(paid.monitoring.active, true);
assert.equal(paid.pending.length, 1);

assert.equal(parseEntitlements({ monitoring: { status: "weird" } }).monitoring.status, "none");

assert.deepEqual(parseCheckout({ status: "already_owned" }), { status: "already_owned" });
assert.throws(() => parseCheckout({ status: "pending", reference: "tp_1", authorization_url: "http://insecure" }));
assert.equal(
  parseCheckout({ status: "pending", reference: "tp_1", authorization_url: "https://checkout.paystack.com/x" }).status,
  "pending",
);

assert.throws(() => parseVerify({ status: "paid" }));
assert.equal(parseVerify({ status: "succeeded", product: "full_analysis", entitlements: {} }).status, "succeeded");

assert.equal(formatWholeRand(3900), "R39");
assert.equal(formatWholeRand(29900), "R299");
assert.match(formatCents(3900), /^R39[.,]00$/);

console.log("billing.parse.test passed");
