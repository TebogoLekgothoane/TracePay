# TracePay architecture

TracePay financial intelligence lives in `TRACEPAY/backend`. It reads transactions that already belong to the signed-in user and returns analysis. It does not persist leak, reasoning, or recommendation rows.

## Intelligence pipeline

```text
Transactions
→ Categorisation
→ Financial Feature Engine
→ Behaviour Analysis
→ Leak Detection
→ Financial Reasoning
→ Financial Recommendations
```

Each stage consumes the previous stage's structured output.

- **Transactions** are the user's stored statement rows.
- **Categorisation** assigns a category and transaction class.
- **Financial Feature Engine** builds completed-month totals, fee totals, merchant recurrence, and related features.
- **Behaviour Analysis** records observed patterns such as fee accumulation, price change, and payday concentration.
- **Leak Detection** turns supported patterns into leak findings.
- **Financial Reasoning** explains a finding from the evidence already attached to it.
- **Financial Recommendations** turn a supported explanation into a review action. They do not move money or contact a bank.

Intelligence is deterministic. The same transactions produce the same features, behaviours, leaks, explanations, and recommendations. AI is not making leak decisions.

`AI_PDF_EXTRACTION_ENABLED` and `AI_CATEGORISATION_ENABLED` default to off and are independent. PDF extraction AI, when enabled, can receive a statement PDF only after classical extraction fails. Categorisation AI receives sanitized descriptions only. Neither path selects a leak, an explanation, or a recommendation.

## Catalogue boundary

Deferred FI items stay deferred because the current data model lacks the evidence they require. They are listed in `TRACEPAY/backend/tests/fixtures/intelligence/coverage_gaps.json`.

FI-031 Impulse Spending Pattern is intentionally deferred. A shopping or spending increase does not prove impulse intent, and the data model has no reliable impulse-intent signal.

FI-054 Duplicate Charges is covered by FI-040. Same-day duplicate merchant payments use `duplicate_payment_leak`. There is no separate duplicate-charge detector.

The canonical FI-001 to FI-062 catalogue file is not in this repository. `web/tracepayvisiondev.md` is absent. These ids have no title or definition in the repo and are not reconstructed here: FI-001, FI-002, FI-006, FI-007, FI-008, FI-009, FI-010, FI-011, FI-012, FI-014, FI-019, FI-020, FI-021, FI-022, FI-024, FI-028.

## Processes

| Process | Location | Role |
|---|---|---|
| Auth | `TRACEPAY/backend` Node server | Signup, login, SMS OTP |
| Financial API | `TRACEPAY/backend` FastAPI | Extraction, categorisation, and the intelligence pipeline |
| Mobile | `TRACEPAY/mobile` | Stores normalized transactions and calls the financial API with the user token |
| Database | Supabase | User-scoped transaction storage. Row access follows the signed-in user |

An older hackathon API under `web/backend` is separate from this pipeline. It is not the Version 1 intelligence implementation.
