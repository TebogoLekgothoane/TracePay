import assert from "node:assert/strict";

import {
  buildSubscriptionCalendarMonth,
  shiftCalendarMonth,
} from "./subscriptions.calendar";

{
  const month = buildSubscriptionCalendarMonth(2026, 10, new Date(2026, 10, 15));
  assert.equal(month.monthLabel, "November");
  assert.equal(month.days.length % 7, 0, "grid fills complete weeks");
  assert.ok(month.days.some((day) => !day.isMuted && day.date === 15));
  assert.ok(
    month.days.some((day) => day.charges.some((item) => item.id === "netflix")),
    "places Netflix on its billing day",
  );
  assert.ok(
    month.days.some((day) => day.charges.some((item) => item.id === "rent")),
    "places rent on its billing day",
  );
  assert.ok(
    month.days.some((day) => day.charges.some((item) => item.id === "insurance")),
    "places insurance on its billing day",
  );
  assert.ok(
    month.days.some((day) => day.charges.some((item) => item.id === "personal-loan")),
    "places loan repayment on its billing day",
  );
  assert.ok(month.chargesCount > 6, "includes subscriptions plus other recurring charges");
  assert.ok(month.monthlyTotal > 5000, "includes large obligations in total");
}

{
  const next = shiftCalendarMonth(2026, 11, 1);
  assert.deepEqual(next, { year: 2027, month: 0 });
}

console.log("subscriptions.calendar.test.ts: ok");
