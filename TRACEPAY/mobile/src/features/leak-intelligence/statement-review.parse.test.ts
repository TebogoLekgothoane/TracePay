import assert from "node:assert/strict";

import { parseGoodNews } from "./leak-intelligence.parse";
import { findingsIn, parseStatementReview, splitBold } from "./statement-review.parse";

const dropLine =
  "**Pineapple dropped from R1,054.66 to R676.23** in September, which is R378.43/month less.";

const review = parseStatementReview({
  report: "# TracePay leak report",
  findings: [
    { key: "double_debit:Virgin Active", group: "recoverable", title: "x", line: "" },
    { key: "price_drop:Pineapple", group: "good_news", title: "Pineapple dropped", line: dropLine },
    { key: "airtime", group: "review", title: "Airtime", line: "something" },
  ],
});

assert.ok(review);
assert.equal(review.report, "# TracePay leak report");
assert.deepEqual(
  review.goodNews,
  [{ key: "price_drop:Pineapple", title: "Pineapple dropped", line: dropLine, rows: [], rowsTotal: 0 }],
  "only good-news findings are kept, and no other group leaks into the section",
);

// No good news is an empty list, never an error.
assert.deepEqual(parseStatementReview({ report: "r", findings: [] })?.goodNews, []);
assert.deepEqual(parseStatementReview({ report: "r" })?.goodNews, []);

// A malformed good-news entry is dropped, not shown half-filled.
assert.deepEqual(
  parseStatementReview({
    report: "r",
    findings: [
      { key: "a", group: "good_news", title: "t" },
      { key: "b", group: "good_news", title: "t", line: "   " },
      { group: "good_news", title: "t", line: "no key" },
      "junk",
      null,
    ],
  })?.goodNews,
  [],
);

// Not a report at all.
assert.equal(parseStatementReview(null), null);
assert.equal(parseStatementReview({}), null);
assert.equal(parseStatementReview({ report: "   " }), null);
assert.equal(parseStatementReview([]), null);

// The report's questions come back in the engine's own question shape, including the new kind.
const withQuestions = parseStatementReview({
  report: "r",
  questions: [
    {
      question_key: "transfer_purpose:savings-and-cash-management",
      kind: "transfer_purpose",
      leak_id: "round_trip_transfers",
      leak_type: "recurring_transfer_leak",
      subject: "Savings and Cash Management",
      prompt: "R17,000 goes to Savings each month and comes back within days. What is that?",
      why_asked: "Only you know.",
      context: [],
      options: [
        { value: "kept", label: "Money I keep there" },
        { value: "moved_back", label: "A budgeting move I reverse" },
        { value: "not_sure", label: "Not sure" },
      ],
      can_skip: true,
      priority: 5,
      signature: "amt=17000",
    },
    { question_key: "x:y", kind: "not_a_kind", prompt: "dropped", options: [] },
  ],
  questions_not_shown: 6.9,
});
assert.ok(withQuestions);
assert.equal(withQuestions.questions.length, 1, "an unknown kind is dropped, not shown");
assert.equal(withQuestions.questions[0].kind, "transfer_purpose");
assert.equal(withQuestions.questions[0].signature, "amt=17000", "the signature travels back with the answer");
assert.equal(withQuestions.questionsNotShown, 6);

// No questions is an empty list, and a bad count is zero.
assert.deepEqual(parseStatementReview({ report: "r" })?.questions, []);
assert.equal(parseStatementReview({ report: "r", questions_not_shown: -2 })?.questionsNotShown, 0);
assert.equal(parseStatementReview({ report: "r", questions_not_shown: "3" })?.questionsNotShown, 0);

// The whole review: header, findings by group, commitments, notes.
const full = parseStatementReview({
  report: "# TracePay leak report",
  account_label: "Investec ••8379",
  account_count: 1,
  period_start: "2026-06-01",
  period_end: "2026-10-31",
  transaction_count: 296,
  month_count: 5,
  facility: "50000.00",
  reconciliation: "Bank fees and interest add up to each statement's own totals to the cent, in all 5 months.",
  commitments: [
    { name: "Rent (LANDLORD)", amount: "R25,300, about **53%** of the R48,048 salary" },
    { name: "bad", amount: 5 },
  ],
  context_notes: ["salary fell from R51,022 to R48,048 from September."],
  near_misses: ["Outsurance paid twice in July is timing, not a duplicate."],
  coverage_limits: ["Only this account is visible."],
  findings: [
    {
      key: "double_debit:Virgin Active",
      group: "recoverable",
      display: "card",
      leak_type: "duplicate_debit_order_leak",
      type_note: "",
      title: "Virgin Active charged double on 1 Oct",
      confidence: "medium",
      confirmed: ["R835 was debited on the 1st. On 1 Oct it was **R1,670, exactly 2×**."],
      possible: ["a duplicate debit or a price change."],
      cannot_see: [],
      check: "ask Virgin Active for the October debit-order breakdown.",
      shows: "",
      cannot_show: "",
      line: "",
      reported: [],
    },
    {
      key: "price_rise:Dotsure",
      group: "review",
      display: "table",
      leak_type: "recurring_payment_leak",
      type_note: "(price rise)",
      title: "Dotsure price rise",
      confidence: "",
      confirmed: [],
      possible: [],
      cannot_see: [],
      check: null,
      shows: "R678.62 for 4 months, then **R814.34** in October.",
      cannot_show: "Whether your cover changed.",
      line: "",
      reported: ["one of the payments was unexpected."],
    },
    { key: "empty", group: "review", display: "card", title: "Nothing to say" },
    { key: "odd", group: "not_a_group", display: "card", title: "x", shows: "y" },
    { key: "price_drop:Pineapple", group: "good_news", display: "item", title: "Pineapple", line: dropLine },
  ],
});
assert.ok(full);
assert.equal(full.header.accountLabel, "Investec ••8379");
assert.equal(full.header.transactionCount, 296);
assert.equal(full.header.monthCount, 5);
assert.equal(full.header.facility, "50000.00");
assert.match(full.header.reconciliation ?? "", /to the cent, in all 5 months/);
assert.deepEqual(
  full.findings.map((item) => item.key),
  ["double_debit:Virgin Active", "price_rise:Dotsure", "price_drop:Pineapple"],
  "a finding with nothing to show, or in an unknown group, is dropped",
);
assert.deepEqual(findingsIn(full, "recoverable").map((i) => i.display), ["card"]);
assert.equal(findingsIn(full, "review")[0].typeNote, "(price rise)");
assert.deepEqual(findingsIn(full, "review")[0].reported, ["one of the payments was unexpected."]);
assert.equal(findingsIn(full, "recoverable")[0].check, "ask Virgin Active for the October debit-order breakdown.");
assert.equal(full.goodNews.length, 1);
assert.deepEqual(full.commitments, [
  { name: "Rent (LANDLORD)", amount: "R25,300, about **53%** of the R48,048 salary" },
]);
assert.deepEqual(full.contextNotes, ["salary fell from R51,022 to R48,048 from September."]);
assert.equal(full.nearMisses.length, 1);
assert.equal(full.coverageLimits.length, 1);

// The rows behind a finding: kept in order, malformed ones dropped, and the total never below
// the rows actually listed.
const withRows = parseStatementReview({
  report: "r",
  findings: [
    {
      key: "double_debit:Virgin Active",
      group: "recoverable",
      display: "card",
      title: "Virgin Active charged double on 1 Oct",
      confirmed: ["R835 was debited on the 1st."],
      rows: [
        { date: "2026-09-01", description: "VIRGIN ACT NETCASH", amount: "R835", direction: "debit", role: "regular" },
        { date: "2026-10-01", description: "VIRGIN ACT NETCASH", amount: "R1,670", direction: "debit", role: "doubled" },
        { date: "2026-10-02", description: "no amount", direction: "debit" },
        { date: "2026-10-03", description: "bad direction", amount: "R1", direction: "sideways" },
        "junk",
      ],
      rows_total: 5,
    },
    {
      key: "bank_fees",
      group: "review",
      display: "table",
      title: "Bank fees",
      shows: "R3,842.57 over 5 months.",
      rows: [{ date: "2026-07-01", description: "Monthly service charge", amount: "R675", direction: "debit" }],
      rows_total: 0,
    },
  ],
});
assert.ok(withRows);
const doubled = withRows.findings[0];
assert.deepEqual(
  doubled.rows.map((row) => [row.date, row.amount, row.role]),
  [
    ["2026-09-01", "R835", "regular"],
    ["2026-10-01", "R1,670", "doubled"],
  ],
);
assert.equal(doubled.rowsTotal, 5, "the server's total is kept when a long list was cut");
const fees = withRows.findings[1];
assert.equal(fees.rows[0].role, "charge", "a row with no role is a plain charge");
assert.equal(fees.rowsTotal, 1, "the total is never below the rows listed");
assert.deepEqual(parseStatementReview({ report: "r", findings: [] })?.goodNews, []);

// What the original detector found that the review does not cover is kept, not lost.
const withOthers = parseStatementReview({
  report: "r",
  other_findings: [
    {
      key: "k1",
      title: "Post-payday discretionary spending concentration",
      description: "A large share of spending falls in the days after payday.",
      leak_type: "payday_spending_leak",
      group: "commitment",
      monthly: "R2,796.06",
      impact_kind: "recurring",
    },
    { key: "k2", title: "No description", description: "  " },
    "junk",
  ],
});
assert.deepEqual(withOthers?.otherFindings, [
  {
    key: "k1",
    title: "Post-payday discretionary spending concentration",
    description: "A large share of spending falls in the days after payday.",
    leakType: "payday_spending_leak",
  },
]);
assert.deepEqual(parseStatementReview({ report: "r" })?.otherFindings, []);

// The leak list carries good news too; a malformed entry is dropped.
assert.deepEqual(
  parseGoodNews([
    { key: "price_drop:Pineapple", title: "Pineapple", line: "  " + dropLine + " " },
    { key: "x", title: "no line" },
    { key: "y", title: "blank", line: "   " },
    null,
  ]),
  [{ key: "price_drop:Pineapple", title: "Pineapple", line: dropLine }],
);
assert.deepEqual(parseGoodNews(undefined), [], "an older backend sends none");
assert.deepEqual(parseGoodNews("junk"), []);

// A report with only the text still parses, with safe defaults for everything else.
const bare = parseStatementReview({ report: "r" });
assert.ok(bare);
assert.equal(bare.header.accountLabel, "Your account");
assert.equal(bare.header.accountCount, 1);
assert.deepEqual([bare.findings, bare.commitments, bare.nearMisses, bare.coverageLimits], [[], [], [], []]);

// Bold markers split a sentence into plain and bold parts.
assert.deepEqual(splitBold(dropLine), [
  { text: "Pineapple dropped from R1,054.66 to R676.23", bold: true },
  { text: " in September, which is R378.43/month less.", bold: false },
]);
assert.deepEqual(splitBold("No markers."), [{ text: "No markers.", bold: false }]);
assert.deepEqual(splitBold(""), []);

console.log("statement-review.parse tests passed");
