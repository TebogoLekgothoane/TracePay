# Multi-statement, multi-account consolidation

TracePay merges every statement a user uploads (any bank, any account, any
period) into one chronological history, keeps each transaction's bank, account
and statement, and runs the Financial Intelligence rules over the merged data.
It can only analyse what the statements contain; nothing here detects activity
that was never uploaded.

## Data flow

```text
PDF → extraction (dates parsed with provenance) → categorisation (labels only)
    → import_statement_transactions()   one DB transaction: dedupe + insert + mark processed
    → POST /consolidation/reconcile      evidence-based transfers / reversals, persisted idempotently
    → GET  /leak-detections              consolidated rows → FI rules → per-finding analysis context
    → GET  /statement-coverage           what the uploads cover, gaps, overlaps, problems
```

## Database (`supabase/migrations/202610250001_multi_statement_consolidation.sql`)

Additive. History is preserved; new provenance columns are `NULL` ("unknown")
for rows imported earlier rather than being guessed.

* **Removed:** the one-statement-per-bank unique index. `release_stale_statement_bank_slots`
  and `link_internal_transfers` remain as no-ops so older app builds do not break.
* **Declared (drift):** columns the app already wrote but no earlier migration declared
  (`statement_start_date`, `closing_balance`, `merchant_name`, …), as `ADD COLUMN IF NOT EXISTS`.
* **Statement coverage:** `period_source` (`declared`/`inferred`), `opening_closing_reconciliation`,
  `reconciliation_difference`, `extraction_warnings`; a `start <= end` check (`NOT VALID`, so it
  guards new rows without failing on history).
* **Account identity:** `accounts.bank_key` and `accounts.account_fingerprint`
  (`md5(bank_key | last4)`; never more than four digits).
* **Canonical transaction:** `original_description`, `original_date_text`,
  `original_signed_amount`, `date_confidence`, `date_warnings`, `booking_date`, `value_date`,
  `source_row`, `extraction_warnings`, `bank_key`, `account_fingerprint`, `classification_source`,
  `dedupe_status` + `dedupe_evidence`, `transfer_status/confidence/evidence`, `transfer_fee_for`,
  `reversal_of`. The original columns (`description`, `date`, `amount`) are never rewritten.
* **Integrity:** `transactions_ownership_guard` trigger (the account must belong to the transaction's
  user and match the statement's account, for any role); `transactions_source_check` widened to the
  values the app writes; a confirmed transfer must carry a pair id.
* **RLS:** unchanged and re-verified by tests. New functions are `SECURITY INVOKER`, check
  `auth.uid()`, and are not executable by `anon`.
* **Indexes:** `(user, date)`, `(user, account, date)`, overlap lookup
  `(user, account, date, type, amount)`, transfer candidates, merchant, pair id, statement period.

### Deduplication (`import_statement_transactions`)

Runs as one transaction, serialised per `(user, account)` by an advisory lock, so two uploads
cannot both decide a row is new. If marking the statement processed fails (for example the same
file was imported concurrently and violates `(user, content_hash)`), the inserted rows roll back.

| Situation | Outcome |
| --- | --- |
| Same row again from an overlapping statement | Matches by key, one row at a time → stored with `is_duplicate`, excluded from totals |
| Same statement re-run / re-uploaded | Rows already present from that statement are skipped (no second copy). `p_replace` re-extracts and re-promotes dependants |
| Two genuine payments, same merchant, amount, day | Occurrence number (`#2`) keeps both; an overlapping statement matches them one-for-one |
| Same account, date, direction, amount **and running balance**, different text | Same ledger position → definite overlap duplicate |
| Same account/date/direction/amount and shared reference, or one description contains the other, but no balance | `possible_duplicate`: kept, counted, flagged — never deleted |
| Same amount and merchant on the same day, nothing else | Never merged |

The key is `account|date|type|abs(amount)|normalised description` plus `|#n`, byte-compatible with
keys the app stored before (tested, including Unicode descriptions).

### Transfers (`apply_transfer_links`, decided by `leak_intelligence/consolidation.py`)

Equal amounts alone never link. A pair needs: opposite directions, **different accounts**, identical
amount and currency, credit dated 1 day before to 3 days after the debit, neither row a duplicate.
Score: 0.35 base + 0.02–0.10 for closeness + 0.30 shared reference token + 0.15/0.25 per side for
naming the other bank/last four (capped) + 0.15 transfer wording − 0.25 purchase/salary/interest wording.
`≥ 0.75` and no rival within 0.10 → confirmed; `≥ 0.45` → candidate (kept, reported as unconfirmed);
otherwise nothing. A payment/transfer fee on the paying account the same or next day is linked to the
transfer but stays in spending. The database re-validates every pair and applies the same decision
twice without change.

## Dates

* Every parse returns the original text, the date, a confidence and warnings (`pdf_processor/dates.py`).
  Formats: ISO, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, `DD Mon YYYY`, `Mon DD, YYYY`, two-digit years
  (pivot 70), and year-less `DD Mon` / `DD/MM`.
* South African statements are read day-first. When both readings are valid the statement period
  decides if it can; otherwise day-first is kept at medium confidence with a warning.
* Year-less dates take their year **only** from a period printed on the statement, and only when exactly
  one year fits (year-end statements work). No period, a period over a year, or an ambiguous reading →
  the row is rejected, never dated by guesswork. AI extraction may only relay a date it read.
* Only the leading date of a row is the transaction date. Dates inside descriptions (debit-order dates,
  card authorisation dates) are never used.
* Transaction date, posting/booking date and value date are separate. A table with only a value or
  posting date flags that the transaction date is unknown.
* Times are stored only when the statement printed one.
* Order: by date, then timestamp when present, then account and statement row, then id. Same-day order is
  deterministic, not a claim about what happened first; a newest-first statement reverses row order.
* The statement period is marked `inferred` when taken from the first and last transaction, and then only
  vouches for those days.

## Coverage (`leak_intelligence/coverage.py`, `GET /statement-coverage`)

Per account: covered ranges, overlaps, gaps and statement problems. A gap is `confirmed_missing`
only when the earlier closing balance ≠ the later opening balance; `balances_continuous` when they
match; `not_uploaded` when balances cannot say. File names are never used. Problems flagged: failed,
opening+movements ≠ closing, running-balance mismatch, many rejected rows, low extraction confidence,
contradictory or implausible period, transactions outside the declared period, inferred period.

## Financial Intelligence

The rules already read the user's whole transaction set, so cross-account analysis needed no rewrite.
What changed, and what did not:

| Change | Effect |
| --- | --- |
| Rows are ordered chronologically (deterministic) before features are built | Same findings whatever the statement upload order |
| Confirmed internal transfers carry `internal_transfer` class | Excluded from spending/income rules that already skip that class |
| Overlap-copy guard is account-aware | Same-day, same-amount debit orders on two accounts are real duplicates (FI-024/FI-040/FI-054), not statement overlap |
| "Missing expected charge" judges absence only up to the coverage end of the account being charged | An account whose statements stop earlier is not reported as cancelled |
| `analysis` block on each finding | Accounts, date range, amount status, confidence level + notes, coverage limits, calculation, related findings |

Detection logic, confidence, fingerprints and ids are unchanged; `analysis` is additive.

| FI | Rule | View used |
| --- | --- | --- |
| 003, 005, 013, 015, 042 | bank fees | Cross-account totals (fees are additive); fee trends are labelled `consolidated_across_accounts` |
| 004, 034 | cash | Cross-account |
| 016, 023, 026 | subscriptions, recurring/zombie payments | Series by date; cross-account only for a sequential monthly hand-over, otherwise flagged `concurrent_charges` / `unrelated_accounts` and confidence lowered |
| 017 | duplicate streaming | Cross-account (services may be billed to different accounts) |
| 018, 025, 039 | price increases | Date-ordered amounts across the merchant's accounts |
| 024, 040, 054 | duplicate debit orders / payments | Cross-account, shown as `potentially_duplicated` |
| 028–030, 035–038 | habit / category | Cross-account monthly totals, transfers and refunds removed |
| 032, 033 | weekend / payday | Cross-account, from actual dates |
| 031, 041 and other deferred items | deferred | Unchanged — the data model still lacks the evidence |

The canonical FI catalogue file is not in the repository, so identifiers without a title are not reconstructed.

## Tests

```bash
cd TRACEPAY/backend
python -m pytest tests -q            # Python: dates, extraction, consolidation, coverage, FI
npm run test:db                      # real PostgreSQL (PGlite): migrations, RLS, dedupe, transfers
cd ../mobile && npm test && npx tsc --noEmit
```

`test:db` applies every repository migration to a WASM PostgreSQL with Supabase auth stubbed.
PGlite is single-connection, so concurrent imports are serialised: idempotence, constraints and
rollback are proven; real multi-connection lock contention is not.

## Known limitations

* Production data was not touched; the migration was verified on a replay of the repository migrations
  plus stubs for objects production had before the first migration. Apply it to a staging copy first.
* Statements loaded before this migration have no `period_source`; a period equal to the first and last
  transaction is treated as inferred.
* Same-day transactions cannot be ordered by time unless the statement printed one.
* Transfer matching needs both sides uploaded; one side alone stays an ordinary transaction.
  Multi-leg transfers (one debit funding two credits) and foreign-currency transfers are not matched.
* Refund linking requires the same account and a recognised merchant; unlinked refunds still count as
  refunds, not income.
* Analysis reads up to 10,000 transactions per request (HTTP 413 beyond that).
* CSV statements share the schema, but this repository has no CSV extractor to exercise it.
