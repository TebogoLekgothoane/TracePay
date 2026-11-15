import assert from "node:assert/strict";

import {
  buildLeakTransactionsHref,
  leakLineItemTransactionFilter,
} from "./leak-transaction-filters";

{
  const filter = leakLineItemTransactionFilter("fees", "atm");
  assert.ok(filter, "maps ATM fees");
  assert.ok(filter!.categories.includes("Bank fees"), "includes Bank fees");
  assert.ok(filter!.keywords.some((item) => item.includes("ATM")), "has ATM keywords");
}

{
  const href = buildLeakTransactionsHref("fees", "sms");
  assert.ok(href?.includes("categories="), "href has categories");
  assert.ok(href?.includes("SMS"), "href has SMS keyword");
  assert.ok(href?.includes("label="), "href has label");
}

{
  const href = buildLeakTransactionsHref("airtime", "data");
  assert.ok(href?.includes("Airtime"), "airtime category");
}

{
  assert.equal(buildLeakTransactionsHref("subs", "netflix"), null, "subs stay on detail pages");
}

console.log("leak-transaction-filters.test.ts: ok");
