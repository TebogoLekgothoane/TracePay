import assert from "node:assert/strict";

import type { LeakDetection, LeakDetectionResult } from "../leak-intelligence/leak-intelligence.types";
import {
  personalCancelGuide,
  personalDebitGuide,
  personalGuideForAction,
  resolveServiceLink,
} from "./personalCancelSteps";

function leak(over: Partial<LeakDetection> & { fingerprint: string }): LeakDetection {
  return {
    leak_id: over.fingerprint,
    leak_type: "subscription_leak",
    title: "Subscription",
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
    supporting_transaction_count: 0,
    detector_version: "t",
    detected_at: "2026-11-01T00:00:00Z",
    period_start: null,
    period_end: null,
    ...over,
  };
}

function result(leaks: LeakDetection[]): LeakDetectionResult {
  return {
    user_id: "u",
    transaction_count: 10,
    period_start: null,
    period_end: null,
    detector_version: "t",
    leaks,
    questions: [],
    questions_not_shown: 0,
  };
}

assert.equal(personalCancelGuide(null), null);
assert.equal(personalCancelGuide(result([])), null);
// Findings from other categories are not subscriptions to cancel.
assert.equal(personalCancelGuide(result([leak({ fingerprint: "f", leak_type: "bank_fee_leak" })])), null);

const guide = personalCancelGuide(
  result([
    leak({
      fingerprint: "a",
      estimated_monthly_impact: 59,
      evidence: { merchant_display_name: "Canva" },
      supporting_transactions: [
        { transaction_id: "1", date: "2026-10-05", description: "CANVA* 0421", amount: 59, direction: "debit", role: "payment" },
        { transaction_id: "2", date: "2026-11-05", description: "CANVA* 0933", amount: 59, direction: "debit", role: "payment" },
      ],
    }),
    leak({ fingerprint: "b", estimated_monthly_impact: 199, evidence: { merchant_display_name: "Gym Pass" } }),
    leak({
      fingerprint: "c",
      estimated_monthly_impact: 65,
      evidence: { merchant_display_name: "Crunchyroll" },
      supporting_transactions: [
        { transaction_id: "3", date: "2026-11-08", description: "POS Purchase 65.00 Google Crunch", amount: 65, direction: "debit", role: "payment" },
      ],
    }),
    leak({ fingerprint: "d", estimated_monthly_impact: 50, status: "resolved", evidence: { merchant_display_name: "Old Thing" } }),
  ]),
);
assert.ok(guide);
assert.equal(guide.count, 3);
assert.equal(guide.monthlyTotal, 323);
// Biggest first, real name, the latest charge date and the bank's own wording.
assert.match(guide.steps[0].title, /^Cancel Gym Pass/);
assert.match(guide.steps[1].title, /^Cancel Crunchyroll/);
assert.match(guide.steps[2].title, /^Cancel Canva/);
assert.match(guide.steps[2].description, /CANVA\* 0933/);
assert.ok(guide.steps[2].link, "known service links to its own cancel page");
// Unknown merchant still gets Google Play and App Store subscription deep-links.
assert.ok(guide.steps[0].links && guide.steps[0].links.length >= 2);
assert.ok(guide.steps[0].links!.some((link) => link.label.includes("Google Play")));
assert.ok(guide.steps[0].links!.some((link) => link.label.includes("App Store")));
// Crunchyroll billed via Google gets both the Crunchyroll app/web deep-link and Google Play subscriptions.
assert.equal(guide.steps[1].link?.url, "crunchyroll://");
assert.equal(guide.steps[1].link?.fallbackUrl, "https://www.crunchyroll.com/account/membership");
assert.ok(guide.steps[1].links!.some((link) => link.label.includes("Google Play")));
assert.ok(!guide.steps[1].links!.some((link) => link.label.includes("App Store")));
// A resolved finding is not listed.
assert.ok(!guide.steps.some((step) => /Old Thing/.test(step.title)));
// Closing steps name the same payments.
assert.match(guide.steps.at(-1)!.description, /Gym Pass, Crunchyroll and Canva/);

// Service link resolution covers app schemes + web fallback and merchant catalog domains.
const spotifyLink = resolveServiceLink("Spotify", "POS Purchase Spotify");
assert.equal(spotifyLink?.url, "spotify://");
assert.equal(spotifyLink?.fallbackUrl, "https://www.spotify.com/account/subscription/");

const debitGuide = personalDebitGuide(
  result([
    leak({
      fingerprint: "d1",
      leak_type: "recurring_payment_leak",
      estimated_monthly_impact: 450,
      evidence: { merchant_display_name: "Edgequig QUI35877" },
      supporting_transactions: [
        { transaction_id: "10", date: "2026-10-01", description: "Magtape Debit Edgequig Qui35877", amount: 450, direction: "debit", role: "payment" },
      ],
    }),
  ]),
);
assert.ok(debitGuide);
assert.equal(debitGuide.count, 1);
assert.match(debitGuide.steps[0].title, /^Stop Edgequig QUI35877, R450[.,]00 a month/);
assert.match(debitGuide.steps[0].description, /Magtape Debit Edgequig Qui35877/);
assert.ok((debitGuide.steps[1].links?.length ?? 0) >= 5, "bank mandate step includes banking app links");
assert.equal(personalGuideForAction("pause", result([
  leak({ fingerprint: "d1", leak_type: "recurring_payment_leak", estimated_monthly_impact: 450 }),
]))?.count, 1);

console.log("personalCancelSteps tests passed");
