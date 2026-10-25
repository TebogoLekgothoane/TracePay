import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { buildOccurrenceDedupeKeys } from "../../../mobile/src/features/transactions/transaction.dedupe.ts";
import {
  asAdmin,
  asUser,
  createAccount,
  createDatabase,
  createStatement,
  createUser,
  importRows,
  scalar,
  type Db,
  type RowInput,
} from "./harness.ts";

let db: Db;

before(async () => {
  db = await createDatabase();
});

type Overview = Record<string, number>;

async function overview(userId: string, accountId?: string): Promise<Overview> {
  await asUser(db, userId);
  const result = await db.query<{ o: Overview }>("SELECT public.financial_overview($1) AS o", [
    accountId ?? null,
  ]);
  return result.rows[0].o;
}

async function canonicalCount(userId: string, accountId?: string): Promise<number> {
  await asAdmin(db);
  return Number(
    await scalar(
      db,
      `SELECT count(*) FROM public.transactions
       WHERE user_id = $1 AND NOT is_duplicate AND ($2::uuid IS NULL OR account_id = $2)`,
      [userId, accountId ?? null],
    ),
  );
}

async function setup(banks: Array<[string, string]>) {
  const userId = await createUser(db);
  const accounts: string[] = [];
  for (const [institution, last4] of banks) {
    accounts.push(await createAccount(db, userId, institution, last4));
  }
  return { userId, accounts };
}

const JAN_CAPITEC: RowInput[] = [
  { date: "2026-01-25", description: "SALARY ACME PTY LTD", amount: 25000, balance: 26000 },
  { date: "2026-01-26", description: "NETFLIX.COM", amount: -199, balance: 25801 },
  { date: "2026-01-27", description: "CHECKERS SANDTON", amount: -540.5, balance: 25260.5 },
];

describe("multi-statement ingestion", () => {
  test("three banks upload side by side; one bank slot no longer limits the user", async () => {
    const { userId, accounts } = await setup([
      ["Capitec", "1111"],
      ["Standard Bank", "2222"],
      ["TymeBank", "3333"],
    ]);
    for (const [index, account] of accounts.entries()) {
      const statement = await createStatement(db, userId, { accountId: account });
      const result = await importRows(db, userId, statement, [
        { date: "2026-01-10", description: `Account ${index} payment`, amount: -100 - index },
      ]);
      assert.equal(result.inserted, 1);
    }
    // A second active statement for the same bank must now be allowed.
    const second = await createStatement(db, userId, { accountId: accounts[0] });
    const result = await importRows(db, userId, second, [
      { date: "2026-02-10", description: "February payment", amount: -50 },
    ]);
    assert.equal(result.inserted, 1);
    assert.equal(await canonicalCount(userId), 4);
    assert.equal(await canonicalCount(userId, accounts[1]), 1);

    await asAdmin(db);
    const banks = await db.query(
      "SELECT DISTINCT bank_key FROM public.transactions WHERE user_id = $1 ORDER BY 1",
      [userId],
    );
    assert.deepEqual(
      banks.rows.map((row) => (row as { bank_key: string }).bank_key),
      ["capitec", "standard bank", "tymebank"],
    );
  });

  test("consecutive statements for one account accumulate without overlap", async () => {
    const { userId, accounts } = await setup([["Capitec", "4444"]]);
    for (const month of ["2026-01", "2026-02", "2026-03"]) {
      const statement = await createStatement(db, userId, { accountId: accounts[0] });
      await importRows(
        db,
        userId,
        statement,
        [
          { date: `${month}-05`, description: "DEBIT ORDER GYM", amount: -450 },
          { date: `${month}-25`, description: "SALARY ACME", amount: 20000 },
        ],
        { statement_start_date: `${month}-01`, statement_end_date: `${month}-28`, period_source: "declared" },
      );
    }
    assert.equal(await canonicalCount(userId, accounts[0]), 6);
    const totals = await overview(userId);
    assert.equal(totals.money_in, 60000);
    assert.equal(totals.money_out, 1350);
  });

  test("overlapping statements share transactions without double counting", async () => {
    const { userId, accounts } = await setup([["Capitec", "5555"]]);
    const first = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, first, JAN_CAPITEC);
    const before = await overview(userId);

    // Second statement re-prints 26 and 27 Jan and adds 28 Jan.
    const second = await createStatement(db, userId, { accountId: accounts[0] });
    const result = await importRows(db, userId, second, [
      JAN_CAPITEC[1],
      JAN_CAPITEC[2],
      { date: "2026-01-28", description: "UBER TRIP", amount: -88, balance: 25172.5 },
    ]);
    assert.equal(result.overlap_duplicates, 2);
    assert.equal(result.inserted, 3);
    assert.equal(result.canonical_transactions, 1);

    const after = await overview(userId);
    assert.equal(after.money_out, before.money_out + 88);
    assert.equal(after.money_in, before.money_in);
    assert.equal(after.duplicate_count, 2);

    await asAdmin(db);
    const marked = await db.query(
      "SELECT dedupe_status, duplicate_of IS NOT NULL AS linked FROM public.transactions WHERE statement_id = $1 AND is_duplicate",
      [second],
    );
    assert.equal(marked.rows.length, 2);
    for (const row of marked.rows as Array<{ dedupe_status: string; linked: boolean }>) {
      assert.equal(row.dedupe_status, "overlap_duplicate");
      assert.equal(row.linked, true);
    }
  });

  test("reprocessing the same statement is idempotent, with or without replace", async () => {
    const { userId, accounts } = await setup([["Capitec", "6666"]]);
    const statement = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, statement, JAN_CAPITEC);
    const baseline = await overview(userId);

    for (let run = 0; run < 3; run += 1) {
      const again = await importRows(db, userId, statement, JAN_CAPITEC);
      assert.equal(again.already_present, 3);
      assert.equal(again.inserted, 0);
    }
    assert.deepEqual(await overview(userId), baseline);

    for (let run = 0; run < 3; run += 1) {
      const replaced = await importRows(db, userId, statement, JAN_CAPITEC, {}, true);
      assert.equal(replaced.canonical_transactions, 3);
    }
    assert.deepEqual(await overview(userId), baseline);
    assert.equal(await canonicalCount(userId), 3);
    await asAdmin(db);
    assert.equal(
      Number(await scalar(db, "SELECT count(*) FROM public.transactions WHERE user_id = $1", [userId])),
      3,
    );
  });

  test("replace promotes an overlap duplicate whose canonical copy was removed", async () => {
    const { userId, accounts } = await setup([["Capitec", "6767"]]);
    const first = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, first, JAN_CAPITEC);
    const second = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, second, [JAN_CAPITEC[1], JAN_CAPITEC[2]]);
    assert.equal((await overview(userId)).transaction_count, 3);

    // The first statement is re-extracted and now yields only the salary row.
    await importRows(db, userId, first, [JAN_CAPITEC[0]], {}, true);
    const totals = await overview(userId);
    // Netflix and Checkers survive through the second statement; nothing vanished.
    assert.equal(totals.transaction_count, 3);
    assert.equal(totals.money_out, 199 + 540.5);
  });

  test("two genuine payments to one merchant for one amount on one day are both kept", async () => {
    const { userId, accounts } = await setup([["Capitec", "7777"]]);
    const twoCoffees: RowInput[] = [
      { date: "2026-02-03", description: "CARD PURCHASE VIDA E CAFFE", amount: -42, balance: 958 },
      { date: "2026-02-03", description: "CARD PURCHASE VIDA E CAFFE", amount: -42, balance: 916 },
    ];
    const first = await createStatement(db, userId, { accountId: accounts[0] });
    const result = await importRows(db, userId, first, twoCoffees);
    assert.equal(result.overlap_duplicates, 0);
    assert.equal((await overview(userId)).money_out, 84);

    // An overlapping statement prints both again: each matches one-for-one.
    const second = await createStatement(db, userId, { accountId: accounts[0] });
    const overlap = await importRows(db, userId, second, twoCoffees);
    assert.equal(overlap.overlap_duplicates, 2);
    assert.equal((await overview(userId)).money_out, 84);

    // A third statement that prints only ONE of them still matches only one,
    // leaving the other untouched rather than collapsing both.
    const third = await createStatement(db, userId, { accountId: accounts[0] });
    const partial = await importRows(db, userId, third, [twoCoffees[0]]);
    assert.equal(partial.overlap_duplicates, 1);
    assert.equal((await overview(userId)).money_out, 84);
  });

  test("the same ledger position with different text is a definite duplicate; text alone is only a possible one", async () => {
    const { userId, accounts } = await setup([["Capitec", "8888"]]);
    const first = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, first, [
      { date: "2026-03-02", description: "POS PURCHASE CHECKERS SANDTON", amount: -310, balance: 5000, reference: "REF99887766" },
      { date: "2026-03-03", description: "WOOLWORTHS MELROSE", amount: -120, balance: 4880 },
    ]);
    const second = await createStatement(db, userId, { accountId: accounts[0] });
    const result = await importRows(db, userId, second, [
      // same date, amount and running balance; truncated description
      { date: "2026-03-02", description: "CHECKERS", amount: -310, balance: 5000 },
      // same date and amount, description contained, but no balance to prove it
      { date: "2026-03-03", description: "WOOLWORTHS", amount: -120, balance: null },
    ]);
    assert.equal(result.overlap_duplicates, 1);
    assert.equal(result.possible_duplicates, 1);

    const totals = await overview(userId);
    // The possible duplicate is preserved (counted) and flagged, never deleted.
    assert.equal(totals.money_out, 310 + 120 + 120);
    assert.equal(totals.possible_duplicate_count, 1);
    await asAdmin(db);
    const flagged = await db.query(
      "SELECT dedupe_evidence ->> 'matched_on' AS why FROM public.transactions WHERE dedupe_status = 'possible_duplicate' AND user_id = $1",
      [userId],
    );
    assert.equal((flagged.rows[0] as { why: string }).why, "description_containment");
  });

  test("a different amount or day is never merged, however similar the text", async () => {
    const { userId, accounts } = await setup([["Capitec", "8899"]]);
    const first = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, first, [{ date: "2026-03-02", description: "NETFLIX.COM", amount: -199, balance: 1000 }]);
    const second = await createStatement(db, userId, { accountId: accounts[0] });
    const result = await importRows(db, userId, second, [
      { date: "2026-03-03", description: "NETFLIX.COM", amount: -199, balance: 801 },
      { date: "2026-03-02", description: "NETFLIX.COM", amount: -229, balance: 771 },
    ]);
    assert.equal(result.overlap_duplicates, 0);
    assert.equal(result.possible_duplicates, 0);
    assert.equal((await overview(userId)).money_out, 199 * 2 + 229);
  });

  test("original description, date text, value date and signed amount are preserved", async () => {
    const { userId, accounts } = await setup([["Standard Bank", "9090"]]);
    const statement = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, statement, [
      {
        date: "2026-02-28",
        description: "  Card Purchase  Spar 02/03/2026  ",
        amount: -75.25,
        date_text: "28 Feb",
        date_confidence: "medium",
        value_date: "2026-03-02",
      },
    ]);
    await asAdmin(db);
    const row = (
      await db.query(
        `SELECT description, original_description, original_date_text, date_confidence,
                value_date::text AS value_date, date::text AS date, original_signed_amount::float AS signed,
                transaction_time
         FROM public.transactions WHERE user_id = $1`,
        [userId],
      )
    ).rows[0] as Record<string, unknown>;
    assert.equal(row.original_description, "  Card Purchase  Spar 02/03/2026  ");
    assert.equal(row.original_date_text, "28 Feb");
    assert.equal(row.date_confidence, "medium");
    assert.equal(row.date, "2026-02-28");
    assert.equal(row.value_date, "2026-03-02");
    assert.equal(row.signed, -75.25);
    assert.equal(row.transaction_time, null, "no timestamp is fabricated");
  });

  test("imports store the source the application has always written", async () => {
    const { userId, accounts } = await setup([["Capitec", "9100"]]);
    const statement = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, statement, JAN_CAPITEC);
    await asAdmin(db);
    const sources = await db.query("SELECT DISTINCT source FROM public.transactions WHERE user_id = $1", [userId]);
    assert.deepEqual(sources.rows, [{ source: "statement" }]);
  });

  test("a year-end sequence keeps true dates and order", async () => {
    const { userId, accounts } = await setup([["Capitec", "1212"]]);
    const statement = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, statement, [
      { date: "2026-01-02", description: "SALARY ACME", amount: 20000 },
      { date: "2025-12-31", description: "CHECKERS", amount: -100 },
      { date: "2025-12-30", description: "WOOLWORTHS", amount: -80 },
    ]);
    await asAdmin(db);
    const dates = await db.query(
      "SELECT date::text AS d FROM public.transactions WHERE user_id = $1 ORDER BY date, id",
      [userId],
    );
    assert.deepEqual(
      (dates.rows as Array<{ d: string }>).map((row) => row.d),
      ["2025-12-30", "2025-12-31", "2026-01-02"],
    );
  });

  test("an unknown merchant with a valid date is kept unclassified", async () => {
    const { userId, accounts } = await setup([["Capitec", "1313"]]);
    const statement = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, statement, [
      { date: "2026-04-09", description: "XYZZY HOLDINGS 4471", amount: -321.1 },
    ]);
    await asAdmin(db);
    const row = (
      await db.query(
        "SELECT transaction_class, category_id, date::text AS d FROM public.transactions WHERE user_id = $1",
        [userId],
      )
    ).rows[0] as Record<string, unknown>;
    assert.equal(row.transaction_class, "unknown");
    assert.equal(row.category_id, null);
    assert.equal(row.d, "2026-04-09");
    assert.equal((await overview(userId)).leak_spend, 321.1);
  });
});

describe("compatibility with rows the app already stored", () => {
  test("server-built dedupe keys equal the keys the app used to build", async () => {
    const { userId, accounts } = await setup([["Capitec", "9001"]]);
    const rows: RowInput[] = [
      { date: "2026-02-03", description: "CARD PURCHASE VIDA E CAFFE", amount: -42 },
      { date: "2026-02-03", description: "CARD PURCHASE VIDA E CAFFE", amount: -42 },
      { date: "2026-02-04", description: "  Woolworths – Melrose Arch (R)  ", amount: -1234.5 },
      { date: "2026-02-05", description: "SALARY: ACME/PTY  LTD", amount: 25000 },
      { date: "2026-02-06", description: "Café Münch 4471", amount: -19.9 },
      { date: "2026-02-07", description: "!!!", amount: 0.01 },
    ];
    const statement = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, statement, rows);
    const expected = buildOccurrenceDedupeKeys(
      accounts[0],
      rows.map((row) => ({
        date: row.date,
        description: row.description,
        amount: row.amount,
        type: row.amount < 0 ? ("debit" as const) : ("credit" as const),
      })),
    );
    await asAdmin(db);
    const stored = await db.query(
      "SELECT dedupe_key FROM public.transactions WHERE statement_id = $1 ORDER BY source_row",
      [statement],
    );
    assert.deepEqual(
      (stored.rows as Array<{ dedupe_key: string }>).map((row) => row.dedupe_key),
      expected,
    );
  });

  test("a row stored by the old client dedupes against a new overlapping upload", async () => {
    const { userId, accounts } = await setup([["Capitec", "9002"]]);
    const first = await createStatement(db, userId, { accountId: accounts[0] });
    // Insert exactly what the previous client wrote: no provenance columns.
    await asAdmin(db);
    const key = buildOccurrenceDedupeKeys(accounts[0], [
      { date: "2026-03-02", description: "NETFLIX.COM", amount: -199, type: "debit" },
    ])[0];
    await db.query(
      `INSERT INTO public.transactions
         (user_id, account_id, statement_id, date, description, amount, type, source, dedupe_key, is_duplicate)
       VALUES ($1, $2, $3, '2026-03-02', 'NETFLIX.COM', -199, 'debit', 'statement', $4, false)`,
      [userId, accounts[0], first, key],
    );
    const second = await createStatement(db, userId, { accountId: accounts[0] });
    const result = await importRows(db, userId, second, [
      { date: "2026-03-02", description: "NETFLIX.COM", amount: -199 },
      { date: "2026-03-09", description: "UBER TRIP", amount: -88 },
    ]);
    assert.equal(result.overlap_duplicates, 1);
    assert.equal((await overview(userId)).money_out, 199 + 88);
  });
});

describe("refunds and reversals", () => {
  test("a refund offsets spending and is not counted as income", async () => {
    const { userId, accounts } = await setup([["Capitec", "1414"]]);
    const statement = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, statement, [
      { date: "2026-02-01", description: "SALARY ACME", amount: 20000 },
      { date: "2026-02-02", description: "TAKEALOT ORDER 123", amount: -1500 },
      { date: "2026-02-09", description: "TAKEALOT REFUND 123", amount: 1500 },
      { date: "2026-02-10", description: "UBER TRIP REVERSAL", amount: 60, category_rule: "description:purchase-reversal" },
    ]);
    const totals = await overview(userId);
    assert.equal(totals.money_in, 20000);
    assert.equal(totals.refunds, 1560);
    assert.equal(totals.money_out, 1500);
    assert.equal(totals.net_money_out, 1500 - 1560);
  });
});

describe("internal transfers", () => {
  async function ids(userId: string, descriptionLike: string): Promise<string[]> {
    await asAdmin(db);
    const result = await db.query(
      "SELECT id FROM public.transactions WHERE user_id = $1 AND description LIKE $2 ORDER BY date, id",
      [userId, descriptionLike],
    );
    return (result.rows as Array<{ id: string }>).map((row) => row.id);
  }

  async function transferFixture() {
    const { userId, accounts } = await setup([
      ["Capitec", "2001"],
      ["Standard Bank", "2002"],
    ]);
    const capitec = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, capitec, [
      { date: "2026-03-01", description: "SALARY ACME", amount: 30000 },
      { date: "2026-03-05", description: "IB PAYMENT TO STANDARD BANK 2002", amount: -5000 },
      { date: "2026-03-05", description: "IMMEDIATE PAYMENT FEE", amount: -9.5, transaction_class: "bank_fee" },
    ]);
    const standard = await createStatement(db, userId, { accountId: accounts[1] });
    await importRows(db, userId, standard, [
      { date: "2026-03-05", description: "IB TRANSFER FROM CAPITEC 2001", amount: 5000 },
    ]);
    return { userId, accounts };
  }

  test("a confirmed pair is excluded from income and spending; the fee stays a leak", async () => {
    const { userId } = await transferFixture();
    const [debit] = await ids(userId, "IB PAYMENT TO STANDARD%");
    const [credit] = await ids(userId, "IB TRANSFER FROM CAPITEC%");
    const [fee] = await ids(userId, "IMMEDIATE PAYMENT FEE");

    const unlinked = await overview(userId);
    assert.equal(unlinked.money_out, 5000 + 9.5, "not paired yet: principal still counted");
    assert.equal(unlinked.money_in, 35000);

    await asUser(db, userId);
    const applied = await db.query<{ r: Record<string, number> }>(
      "SELECT public.apply_transfer_links($1::jsonb) AS r",
      [JSON.stringify([{ debit_id: debit, credit_id: credit, confidence: 0.95, evidence: { reference: "2002/2001" }, fee_ids: [fee] }])],
    );
    assert.equal(applied.rows[0].r.linked_pairs, 1);

    const linked = await overview(userId);
    assert.equal(linked.money_in, 30000);
    assert.equal(linked.money_out, 9.5);
    assert.equal(linked.transfer_volume, 5000);
    assert.equal(linked.leak_spend, 9.5, "the separate transfer fee remains a potential leak");

    await asAdmin(db);
    const feeRow = (
      await db.query("SELECT transfer_fee_for FROM public.transactions WHERE id = $1", [fee])
    ).rows[0] as { transfer_fee_for: string };
    assert.equal(feeRow.transfer_fee_for, debit);

    // Applying the identical decision again changes nothing (deterministic pair id).
    await asUser(db, userId);
    await db.query("SELECT public.apply_transfer_links($1::jsonb)", [
      JSON.stringify([{ debit_id: debit, credit_id: credit, confidence: 0.95, evidence: {} }]),
    ]);
    assert.deepEqual(await overview(userId), linked);
  });

  test("unconfirmed candidates are preserved and reported separately, not excluded", async () => {
    const { userId } = await transferFixture();
    const [debit] = await ids(userId, "IB PAYMENT TO STANDARD%");
    const [credit] = await ids(userId, "IB TRANSFER FROM CAPITEC%");
    await asUser(db, userId);
    await db.query("SELECT public.apply_transfer_links('[]'::jsonb, $1::jsonb)", [
      JSON.stringify([{ ids: [debit, credit], confidence: 0.5, evidence: { reason: "amount and window only" } }]),
    ]);
    const totals = await overview(userId);
    assert.equal(totals.money_out, 5009.5);
    assert.equal(totals.money_in, 35000);
    assert.equal(totals.unconfirmed_transfer_volume, 5000);
    assert.equal(totals.transfer_volume, 0);
  });

  test("invalid pairs are rejected by the database", async () => {
    const { userId, accounts } = await transferFixture();
    const [debit] = await ids(userId, "IB PAYMENT TO STANDARD%");
    const [credit] = await ids(userId, "IB TRANSFER FROM CAPITEC%");
    const [salary] = await ids(userId, "SALARY ACME");
    await asUser(db, userId);

    const attempt = (link: object) =>
      db.query("SELECT public.apply_transfer_links($1::jsonb)", [JSON.stringify([link])]);

    await assert.rejects(attempt({ debit_id: debit, credit_id: salary, confidence: 1 }), /equal amounts|different accounts/);
    await assert.rejects(attempt({ debit_id: credit, credit_id: debit, confidence: 1 }), /one debit with one credit/);

    // Same account on both sides.
    await asAdmin(db);
    const sameAccountCredit = (
      await db.query<{ id: string }>(
        `INSERT INTO public.transactions (user_id, account_id, statement_id, date, description, amount, type, source)
         SELECT user_id, $2, statement_id, date, 'SAME ACCOUNT CREDIT', 5000, 'credit', 'statement'
         FROM public.transactions WHERE id = $1 RETURNING id`,
        [debit, accounts[0]],
      )
    ).rows[0].id;
    await asUser(db, userId);
    await assert.rejects(attempt({ debit_id: debit, credit_id: sameAccountCredit, confidence: 1 }), /two different accounts/);
  });

  test("withdrawing a decision restores the original classification", async () => {
    const { userId } = await transferFixture();
    const [debit] = await ids(userId, "IB PAYMENT TO STANDARD%");
    const [credit] = await ids(userId, "IB TRANSFER FROM CAPITEC%");
    await asUser(db, userId);
    await db.query("SELECT public.apply_transfer_links($1::jsonb)", [
      JSON.stringify([{ debit_id: debit, credit_id: credit, confidence: 0.9, evidence: {} }]),
    ]);
    await db.query("SELECT public.apply_transfer_links('[]'::jsonb, '[]'::jsonb, $1::uuid[])", [[debit, credit]]);
    const totals = await overview(userId);
    assert.equal(totals.transfer_volume, 0);
    assert.equal(totals.money_in, 35000);
  });

  test("re-extracting one side of a pair unlinks the surviving half", async () => {
    const { userId, accounts } = await transferFixture();
    const [debit] = await ids(userId, "IB PAYMENT TO STANDARD%");
    const [credit] = await ids(userId, "IB TRANSFER FROM CAPITEC%");
    await asUser(db, userId);
    await db.query("SELECT public.apply_transfer_links($1::jsonb)", [
      JSON.stringify([{ debit_id: debit, credit_id: credit, confidence: 0.9, evidence: {} }]),
    ]);
    await asAdmin(db);
    const standardStatement = (
      await db.query<{ statement_id: string }>("SELECT statement_id FROM public.transactions WHERE id = $1", [credit])
    ).rows[0].statement_id;
    await importRows(db, userId, standardStatement, [], {}, true);
    await asAdmin(db);
    const survivor = (
      await db.query("SELECT transfer_status, transfer_pair_id, transaction_class FROM public.transactions WHERE id = $1", [debit])
    ).rows[0] as Record<string, unknown>;
    assert.equal(survivor.transfer_status, "none");
    assert.equal(survivor.transfer_pair_id, null);
    assert.notEqual(survivor.transaction_class, "internal_transfer");
    void accounts;
  });

  test("the retired amount-only linker is a no-op", async () => {
    const { userId } = await transferFixture();
    await asUser(db, userId);
    assert.equal(await scalar(db, "SELECT public.link_internal_transfers()"), 0);
    assert.equal((await overview(userId)).transfer_volume, 0);
  });
});

describe("concurrency", () => {
  test("the same file imported concurrently keeps one copy of the transactions", async () => {
    const { userId, accounts } = await setup([["Capitec", "3001"]]);
    const hash = "same-file-hash";
    const one = await createStatement(db, userId, { accountId: accounts[0], contentHash: hash + "-a" });
    const two = await createStatement(db, userId, { accountId: accounts[0], contentHash: hash + "-b" });
    // Both uploads carry the same bytes; only one may become 'processed'.
    await asAdmin(db);
    await db.query("UPDATE public.statement_imports SET content_hash = $2 WHERE id = $1", [one, hash]);
    await db.query("UPDATE public.statement_imports SET content_hash = $2 WHERE id = $1", [two, hash]);

    const results = await Promise.allSettled([
      importRows(db, userId, one, JAN_CAPITEC),
      importRows(db, userId, two, JAN_CAPITEC),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one concurrent import wins");
    assert.equal(rejected.length, 1);
    assert.match(String((rejected[0] as PromiseRejectedResult).reason), /statement_imports_user_content_hash_processed_key|unique/);

    await asAdmin(db);
    assert.equal(
      Number(await scalar(db, "SELECT count(*) FROM public.transactions WHERE user_id = $1", [userId])),
      3,
      "the losing import left no rows behind",
    );
    assert.equal(await canonicalCount(userId), 3);
  });

  test("two different statements with the same rows imported together never double count", async () => {
    const { userId, accounts } = await setup([["Capitec", "3002"]]);
    const one = await createStatement(db, userId, { accountId: accounts[0] });
    const two = await createStatement(db, userId, { accountId: accounts[0] });
    await Promise.all([
      importRows(db, userId, one, JAN_CAPITEC),
      importRows(db, userId, two, JAN_CAPITEC),
    ]);
    assert.equal(await canonicalCount(userId), 3);
    const totals = await overview(userId);
    assert.equal(totals.money_out, 739.5);
    assert.equal(totals.duplicate_count, 3);
  });
});

describe("user isolation and ownership", () => {
  test("another user cannot read, import into, or link someone else's data", async () => {
    const alice = await setup([["Capitec", "4001"], ["Standard Bank", "4002"]]);
    const bob = await setup([["Capitec", "4003"]]);
    const statement = await createStatement(db, alice.userId, { accountId: alice.accounts[0] });
    await importRows(db, alice.userId, statement, JAN_CAPITEC);

    assert.equal((await overview(bob.userId)).transaction_count, 0);
    assert.equal((await overview(bob.userId)).money_in, 0);
    await asUser(db, bob.userId);
    assert.equal(Number(await scalar(db, "SELECT count(*) FROM public.transactions")), 0);
    assert.equal(Number(await scalar(db, "SELECT count(*) FROM public.statement_imports")), 0);

    await assert.rejects(importRows(db, bob.userId, statement, JAN_CAPITEC), /statement not found/);

    await asAdmin(db);
    const aliceIds = (
      await db.query<{ id: string }>("SELECT id FROM public.transactions WHERE user_id = $1 LIMIT 2", [alice.userId])
    ).rows.map((row) => row.id);
    await asUser(db, bob.userId);
    await assert.rejects(
      db.query("SELECT public.apply_transfer_links($1::jsonb)", [
        JSON.stringify([{ debit_id: aliceIds[0], credit_id: aliceIds[1], confidence: 1 }]),
      ]),
      /not yours/,
    );
    const hijack = await db.query<{ r: { unlinked: number } }>(
      "SELECT public.apply_transfer_links('[]'::jsonb, '[]'::jsonb, $1::uuid[]) AS r",
      [aliceIds],
    );
    assert.equal(hijack.rows[0].r.unlinked, 0, "unlinking another user's rows changes nothing");
    const released = await db.query<{ n: number }>(
      "SELECT public.release_stale_statement_attempts($1::uuid, NULL, interval '0 seconds') AS n",
      [alice.accounts[0]],
    );
    assert.equal(Number(released.rows[0].n), 0, "another user's statements are untouched");
  });

  test("a transaction cannot point at another user's account or a mismatched statement account", async () => {
    const alice = await setup([["Capitec", "5001"]]);
    const bob = await setup([["Capitec", "5002"], ["Standard Bank", "5003"]]);
    const bobStatement = await createStatement(db, bob.userId, { accountId: bob.accounts[0] });

    await asUser(db, bob.userId);
    const insert = (accountId: string) =>
      db.query(
        `INSERT INTO public.transactions (user_id, account_id, statement_id, date, description, amount, type, source)
         VALUES ($1, $2, $3, '2026-01-01', 'X', -1, 'debit', 'statement')`,
        [bob.userId, accountId, bobStatement],
      );
    await assert.rejects(insert(alice.accounts[0]), /does not belong|row-level security/);
    await assert.rejects(insert(bob.accounts[1]), /does not match its statement account/);
    await insert(bob.accounts[0]);
  });

  test("a statement cannot be linked to another user's account", async () => {
    const alice = await setup([["Capitec", "6001"]]);
    const bob = await setup([["Capitec", "6002"]]);
    await asUser(db, bob.userId);
    await assert.rejects(
      db.query(
        `INSERT INTO public.statement_imports (user_id, account_id, file_path, file_name, file_size, status, bank_key)
         VALUES ($1, $2, 'p', 'f.pdf', 10, 'uploaded', 'capitec')`,
        [bob.userId, alice.accounts[0]],
      ),
      /row-level security/,
    );
  });

  test("a statement without an account cannot be imported", async () => {
    const bob = await setup([["Capitec", "6003"]]);
    const statement = await createStatement(db, bob.userId, { accountId: bob.accounts[0] });
    await asAdmin(db);
    await db.query("UPDATE public.statement_imports SET account_id = NULL WHERE id = $1", [statement]);
    await assert.rejects(importRows(db, bob.userId, statement, JAN_CAPITEC), /choose the account/);
  });
});

describe("coverage metadata and schema safety", () => {
  test("statement period, balances and reconciliation are stored on the statement", async () => {
    const { userId, accounts } = await setup([["Capitec", "7001"]]);
    const statement = await createStatement(db, userId, { accountId: accounts[0] });
    await importRows(db, userId, statement, JAN_CAPITEC, {
      statement_start_date: "2026-01-01",
      statement_end_date: "2026-01-31",
      period_source: "declared",
      opening_balance: 1000,
      closing_balance: 25260.5,
      opening_closing_reconciliation: "verified",
      reconciliation_difference: 0,
      rows_detected: 3,
      rows_rejected: 0,
      warnings: ["example warning"],
    });
    await asAdmin(db);
    const row = (
      await db.query(
        `SELECT status, transaction_count, statement_start_date::text AS s, statement_end_date::text AS e,
                period_source, opening_closing_reconciliation, extraction_warnings
         FROM public.statement_imports WHERE id = $1`,
        [statement],
      )
    ).rows[0] as Record<string, unknown>;
    assert.equal(row.status, "processed");
    assert.equal(row.transaction_count, 3);
    assert.equal(row.s, "2026-01-01");
    assert.equal(row.e, "2026-01-31");
    assert.equal(row.period_source, "declared");
    assert.deepEqual(row.extraction_warnings, ["example warning"]);
  });

  test("an end date before the start date is rejected", async () => {
    const { userId, accounts } = await setup([["Capitec", "7002"]]);
    const statement = await createStatement(db, userId, { accountId: accounts[0] });
    await assert.rejects(
      importRows(db, userId, statement, JAN_CAPITEC, {
        statement_start_date: "2026-02-01",
        statement_end_date: "2026-01-01",
      }),
      /period_order/,
    );
    await asAdmin(db);
    assert.equal(
      Number(await scalar(db, "SELECT count(*) FROM public.transactions WHERE statement_id = $1", [statement])),
      0,
      "the failed import left no rows",
    );
  });

  test("history created before this migration is preserved", async () => {
    const legacy = await createDatabase("202610200001_expand_finding_registry_leak_types.sql");
    await asAdmin(legacy);
    const userId = "00000000-0000-4000-8000-0000000fffff";
    await legacy.query("INSERT INTO auth.users (id) VALUES ($1)", [userId]);
    await legacy.query("INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
    const [a, b] = ["00000000-0000-4000-8000-0000000fff01", "00000000-0000-4000-8000-0000000fff02"];
    await legacy.query(
      "INSERT INTO public.accounts (id, user_id, name, institution) VALUES ($1,$3,'Capitec account','Capitec'),($2,$3,'Standard account','Standard Bank')",
      [a, b, userId],
    );
    const statementA = "00000000-0000-4000-8000-0000000fff11";
    const statementB = "00000000-0000-4000-8000-0000000fff12";
    for (const [id, account, bank] of [[statementA, a, "capitec"], [statementB, b, "standard bank"]]) {
      await legacy.query(
        `INSERT INTO public.statement_imports (id, user_id, account_id, file_path, file_name, file_size, status, bank_key)
         VALUES ($1,$2,$3,$4,'f.pdf',10,'processed',$5)`,
        [id, userId, account, `p/${id}`, bank],
      );
    }
    const pair = "00000000-0000-4000-8000-0000000fff99";
    await legacy.query(
      `INSERT INTO public.transactions (id, user_id, account_id, statement_id, date, description, amount, type, source, transaction_class, transfer_pair_id, dedupe_key, is_duplicate)
       VALUES
        ('00000000-0000-4000-8000-0000000fff21', $1, $2, $3, '2026-01-05', 'RENT PAYMENT', 5000, 'debit', 'pdf', 'internal_transfer', $5, 'k1', false),
        ('00000000-0000-4000-8000-0000000fff22', $1, $4, $6, '2026-01-06', 'PAYMENT RECEIVED', 5000, 'credit', 'pdf', 'internal_transfer', $5, 'k2', false),
        ('00000000-0000-4000-8000-0000000fff23', $1, $2, $3, '2026-01-07', 'OLD COPY', 10, 'debit', 'pdf', 'spending', NULL, 'k3', true)`,
      [userId, a, statementA, b, pair, statementB],
    );

    // Apply the new migration on top of the populated database.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const sql = readFileSync(
      path.resolve(here, "../../../supabase/migrations/202610250001_multi_statement_consolidation.sql"),
      "utf8",
    );
    await legacy.exec(sql);

    const rows = (
      await legacy.query(
        `SELECT description, original_description, amount::float AS amount, transfer_status, dedupe_status, bank_key
         FROM public.transactions ORDER BY id`,
      )
    ).rows as Array<Record<string, unknown>>;
    assert.equal(rows.length, 3, "no history row is lost");
    assert.equal(rows[0].original_description, "RENT PAYMENT");
    assert.equal(rows[0].amount, 5000);
    assert.equal(rows[0].bank_key, "capitec");
    assert.equal(rows[0].transfer_status, "candidate", "an unevidenced legacy pair must be re-decided, not trusted");
    assert.equal(rows[2].dedupe_status, "overlap_duplicate");

    // Until the matcher re-decides, the old class stays: nothing is silently reclassified.
    const before = (
      await legacy.query("SELECT transaction_class AS c FROM public.transactions WHERE description = 'RENT PAYMENT'")
    ).rows[0] as { c: string };
    assert.equal(before.c, "internal_transfer");
    // When the evidence-based matcher withdraws an unproven legacy pair, the class it created is undone.
    await asUser(legacy, userId);
    await legacy.query("SELECT public.apply_transfer_links('[]'::jsonb, '[]'::jsonb, $1::uuid[])", [
      ["00000000-0000-4000-8000-0000000fff21", "00000000-0000-4000-8000-0000000fff22"],
    ]);
    await asAdmin(legacy);
    const withdrawn = (
      await legacy.query("SELECT transaction_class AS c, transfer_status AS s, transfer_pair_id AS p FROM public.transactions WHERE description IN ('RENT PAYMENT', 'PAYMENT RECEIVED')")
    ).rows as Array<{ c: string; s: string; p: string | null }>;
    assert.ok(withdrawn.every((row) => row.c === "unknown" && row.s === "none" && row.p === null));

    const accountRows = (
      await legacy.query("SELECT bank_key, account_fingerprint FROM public.accounts ORDER BY id")
    ).rows as Array<Record<string, unknown>>;
    assert.equal(accountRows[0].bank_key, "capitec");
    assert.equal(accountRows[1].bank_key, "standard bank");
  });

  test("every public table involved still has row level security enabled", async () => {
    await asAdmin(db);
    const result = await db.query(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relnamespace = 'public'::regnamespace
         AND relname IN ('transactions', 'statement_imports', 'accounts')`,
    );
    for (const row of result.rows as Array<{ relname: string; relrowsecurity: boolean }>) {
      assert.equal(row.relrowsecurity, true, `${row.relname} must keep RLS`);
    }
  });

  test("anonymous callers cannot execute the import or transfer functions", async () => {
    await asAdmin(db);
    await db.exec("SET ROLE anon");
    await assert.rejects(
      db.query("SELECT public.import_statement_transactions(gen_random_uuid(), '[]'::jsonb)"),
      /permission denied/,
    );
    await assert.rejects(db.query("SELECT public.apply_transfer_links()"), /permission denied/);
    await asAdmin(db);
  });
});
