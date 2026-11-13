import {
  ACTION_TYPES,
  guidanceHref,
  isActionType,
  parseFindingGuidance,
  sanitiseActionNote,
} from "./finding-guidance.model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const findingId = "33333333-3333-4333-8333-333333333333";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    finding_id: findingId,
    title: "Recurring payment",
    detection_status: "open",
    detection_status_label: "Open",
    user_response: null,
    reason: "A recurring payment pattern was observed.",
    evidence: [{ label: "Merchant", value: "WOOLWORTHS" }],
    known: ["Finding type: Recurring payment."],
    uncertain: ["Your response is stored separately and does not change detection status."],
    steps: ["Verify the merchant, the amount, and whether the payment is still wanted."],
    actions: [],
    ...overrides,
  };
}

for (const actionType of ACTION_TYPES) {
  const parsed = parseFindingGuidance(
    payload({
      user_response: actionType,
      actions: [
        {
          id: `action-${actionType}`,
          action_type: actionType,
          note: "Checked the merchant",
          created_at: "2026-10-10T18:00:00+00:00",
        },
      ],
    }),
  );
  assert(parsed?.userResponse === actionType, actionType);
  assert(parsed?.detectionStatus === "open", `${actionType} keeps detection open`);
  assert(isActionType(actionType), `${actionType} is supported`);
}

assert(!isActionType("resolved"), "resolved is rejected");
assert(!isActionType("saved"), "saved is rejected");
assert(parseFindingGuidance(payload({ user_response: "resolved" })) === null, "invalid response");
assert(parseFindingGuidance(payload({ detection_status: "resolved" })) === null, "resolved status");
assert(parseFindingGuidance(payload({ detection_status: "new" })) === null, "diff label is not status");

const sanitised = parseFindingGuidance(
  payload({
    evidence: [
      { label: "Merchant", value: "WOOLWORTHS" },
      { label: "Description", value: "CARD 4111111111111111" },
    ],
    actions: [
      {
        id: "action-1",
        action_type: "reviewed",
        note: "card 4111111111111111",
        created_at: "2026-10-10T18:00:00+00:00",
      },
    ],
  }),
);
assert(sanitised?.evidence.length === 1, "unsafe evidence is dropped");
assert(sanitised?.evidence[0]?.value === "WOOLWORTHS", "safe evidence remains");
assert(sanitised?.actions[0]?.note === null, "unsafe note is dropped");
assert(!JSON.stringify(sanitised).includes("411111"), "digits are not shown");

assert(sanitiseActionNote("  Checked the fee schedule  ") === "Checked the fee schedule", "note trimmed");
assert(sanitiseActionNote("   ") === null, "blank note");
let rejected = false;
try {
  sanitiseActionNote(`account ${"1".repeat(6)}`);
} catch {
  rejected = true;
}
assert(rejected, "long numbers are rejected");

const dismissed = parseFindingGuidance(
  payload({
    detection_status: "not_observed",
    detection_status_label: "Not in the latest report",
    user_response: "dismissed",
    uncertain: ["A finding missing from a later report is not marked resolved."],
    actions: [
      {
        id: "action-2",
        action_type: "dismissed",
        note: null,
        created_at: "2026-10-10T19:00:00+00:00",
      },
    ],
  }),
);
assert(dismissed?.detectionStatus === "not_observed", "absence stays not observed");
assert(dismissed?.userResponse === "dismissed", "dismissal is only the user response");
assert(dismissed?.detectionStatus !== dismissed?.userResponse, "response is separate");

const withOutcome = parseFindingGuidance(
  payload({
    outcome_checks: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        outcome: "no_longer_detected",
        basis: "This pattern was not detected in the latest analysed statement.",
        checked_at: "2026-10-10T18:00:00+00:00",
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        outcome: "saved",
        basis: "You saved 500000",
        checked_at: "2026-10-10T19:00:00+00:00",
      },
    ],
  }),
);
assert(withOutcome?.outcomeChecks.length === 1, "unsafe outcome checks are dropped");
assert(withOutcome?.outcomeChecks[0]?.outcome === "no_longer_detected", "outcome kept");
assert(
  !JSON.stringify(withOutcome?.outcomeChecks).toLowerCase().includes("saved"),
  "outcome checks do not claim savings",
);

assert(
  guidanceHref(findingId) === `/settings/notifications/${findingId}`,
  "guidance stays in notification navigation",
);
assert(guidanceHref("not-a-finding") === "/(tabs)/leaks", "invalid finding uses the leaks list");
assert(!guidanceHref(findingId).startsWith("/leak/"), "fingerprint is not a leak route");

console.log("finding-guidance.model.test.ts passed");
