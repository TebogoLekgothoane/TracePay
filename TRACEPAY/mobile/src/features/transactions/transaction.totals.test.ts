import assert from "node:assert/strict";

import { ALL_ACCOUNTS_KEY, summariseTotalsByAccount } from "./transaction.totals";

const totals = summariseTotalsByAccount([
  { account_id: "a", amount: "100.50", type: "debit" },
  { account_id: "a", amount: 20, type: "debit" },
  { account_id: "a", amount: "1000", type: "credit" },
  { account_id: "b", amount: "-49.5", type: "debit" },
  { account_id: "b", amount: "oops", type: "debit" },
]);

assert.equal(totals.a?.spent, 120.5);
assert.equal(totals.a?.income, 1000);
assert.equal(totals.a?.count, 3);
assert.equal(totals.b?.spent, 49.5);
assert.equal(totals.b?.count, 1, "unreadable amounts are skipped");
assert.equal(totals[ALL_ACCOUNTS_KEY]?.spent, 170);
assert.equal(totals[ALL_ACCOUNTS_KEY]?.count, 4);
assert.equal(summariseTotalsByAccount([])[ALL_ACCOUNTS_KEY]?.count, 0);

console.log("transaction.totals.test.ts passed");
