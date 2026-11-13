import assert from "node:assert/strict";

import { PRINTED_FIGURE_KEYS, readPrintedFigures } from "./statement-import.figures";

// The processor's own output for one statement: Decimals arrive as strings.
assert.deepEqual(
  readPrintedFigures({
    statement_date: "2026-06-30",
    debit_interest_rate: "10.50",
    credit_interest_rate: "0.50",
    facility: "50000.00",
    card_purchases: "6486.96",
    fees_total: "747.17",
    interest_paid: "414.03",
    interest_received: null,
  }),
  {
    statement_date: "2026-06-30",
    debit_interest_rate: "10.50",
    credit_interest_rate: "0.50",
    facility: "50000.00",
    card_purchases: "6486.96",
    fees_total: "747.17",
    interest_paid: "414.03",
  },
  "a figure the statement did not print stays absent, never zero",
);

// Numbers keep every digit as text.
assert.deepEqual(readPrintedFigures({ facility: 50000, fees_total: 747.17 }), {
  facility: "50000",
  fees_total: "747.17",
});

// Nothing printed, or not an object: nothing saved.
assert.equal(readPrintedFigures(null), null);
assert.equal(readPrintedFigures(undefined), null);
assert.equal(readPrintedFigures([]), null);
assert.equal(readPrintedFigures("10.50%"), null);
assert.equal(readPrintedFigures({ facility: null, fees_total: "" }), null);

// Unknown keys are dropped, so nothing else the processor adds is stored by accident.
assert.deepEqual(readPrintedFigures({ facility: "50000.00", account_number: "4620124729" }), {
  facility: "50000.00",
});
assert.ok(!(PRINTED_FIGURE_KEYS as readonly string[]).includes("account_number"));

// Junk values are not kept.
assert.equal(readPrintedFigures({ facility: Number.NaN, fees_total: "x".repeat(40) }), null);

console.log("statement-import.figures tests passed");
