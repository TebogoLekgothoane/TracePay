# TRACEPAY Backend

The backend currently has two focused processes:

1. **Auth (Node.js + TypeScript)** in `src/auth` — signup, login, Twilio SMS OTP.
2. **Financial API (Python)** in `app/` and `leak_intelligence/` — statement extraction, categorisation, and deterministic financial intelligence.

Do **not** put Twilio secrets or auth backend logic in the React Native app.

## Auth server

```bash
cd TRACEPAY/backend
cp .env.example .env
# Fill Twilio + Supabase keys in .env (Twilio is not stored in mobile/.env)
npm install
npm run dev
```

Listens on `AUTH_PORT` (default `4001`).

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account + send SMS OTP |
| POST | `/auth/login` | Phone + password |
| POST | `/auth/verify-otp` | Confirm SMS code |
| POST | `/auth/resend-otp` | Resend SMS |

Twilio env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_VERIFY_SERVICE_SID` (preferred) or `TWILIO_FROM`.

## Financial API

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The Python API reads the signed-in user's stored transactions and returns analysis. It does not persist leak, reasoning, or recommendation rows. Intelligence decisions are deterministic. AI does not decide leaks.

Stored transactions move through this pipeline:

```text
Transactions → Categorisation → Financial Feature Engine → Behaviour Analysis
→ Leak Detection → Financial Reasoning → Financial Recommendations
```

AI PDF extraction and AI categorisation are separate flags and default to off. When PDF AI is enabled it can receive the statement PDF. Categorisation AI runs only for transactions left unknown after deterministic rules, merchant memory, and statement-category mapping. It sends sanitized descriptions, amounts, and transaction types in batches of 50 to OpenRouter first, then uses configured direct OpenAI and xAI providers if needed. Responses are constrained to the live category schema and validated before use; provider failures leave the transaction on the normal unknown/`Other` fallback path. Gemini remains configured for PDF extraction only and is not a categorisation provider.

To enable categorisation, set `AI_CATEGORISATION_ENABLED=true`, `OPENROUTER_API_KEY`, and optionally `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`). `OPENROUTER_TIMEOUT_SECONDS` controls request timeout. The OpenRouter key is optional at runtime: if it is missing, unavailable, or returns unusable output, the configured OpenAI/xAI compatibility providers are tried; if none return a valid classification, deterministic fallback behavior is used. Remove any categorisation-specific reliance on `GEMINI_API_KEY`; keep that key only if optional AI PDF extraction still uses Gemini. No migration or production secret change is required by this code update.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/extraction/preview` | Extract and validate a PDF without importing it |
| POST | `/categorisation/reprocess` | Reclassify stored transactions |
| GET | `/financial-features` | Completed-period financial features |
| GET | `/behaviour-analysis` | Behaviour observations |
| GET | `/leak-detections` | Deterministic leak findings, with an `analysis` block per finding (accounts, date range, amount status, coverage limits) |
| GET | `/statement-coverage` | Which accounts and periods the uploaded statements cover; gaps, overlaps, problems |
| POST | `/consolidation/reconcile` | Link own-account transfers and refunds from evidence; idempotent |
| GET | `/financial-reasoning` | Evidence-backed explanations of those findings |
| GET | `/financial-recommendations` | Review actions derived from reasoning |

Statements from every bank and account are consolidated into one chronological history; see [docs/multi-account-consolidation.md](docs/multi-account-consolidation.md) for the data model, date handling, deduplication, transfer rules, coverage and limitations. Apply `supabase/migrations/202610250001_multi_statement_consolidation.sql` before deploying this version; run `npm run test:db` to exercise the migrations against a real PostgreSQL.

Deferred catalogue items stay deferred because the current data model lacks the evidence they need. FI-031 Impulse Spending Pattern is deferred: a shopping increase does not prove impulse intent. FI-054 Duplicate Charges is covered by FI-040 duplicate merchant payments. The canonical FI catalogue file is not in this repository, so untitled ids are not reconstructed. See `tests/fixtures/intelligence/coverage_gaps.json`.

The extraction response uses one canonical transaction shape for both file types:

```text
transaction_date, description, amount, transaction_type, currency, balance
```

PDF processing tries PyMuPDF first, then Camelot for structured tables in text-based PDFs. Scanned pages are preprocessed with OpenCV/Pillow and read with PaddleOCR 3.x; Tesseract is only used when PaddleOCR fails or returns low confidence. AI-assisted PDF extraction runs only when `AI_PDF_EXTRACTION_ENABLED=true` and classical extraction still cannot produce a usable result. It is disabled by default because the PDF may contain sensitive financial information. That flag is independent of `AI_CATEGORISATION_ENABLED`, which only classifies unknown transactions after extraction and never receives the statement PDF. The response includes `extraction_method` and `extraction_confidence` plus normalized transactions and a validation result. The mobile app uploads the original PDF to the private `statements` bucket and stores only normalized `pdf` transactions in PostgreSQL.

Install the Python dependencies before starting the extraction API:

```bash
python -m pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Camelot may require Ghostscript. PaddleOCR needs the PaddlePaddle CPU package from `requirements.txt`. Tesseract is optional and used only as an OCR fallback. Apply `supabase/migrations/202609200001_pdf_statement_ingestion.sql` to the project before testing authenticated uploads.

Tests:

```bash
python -m pytest tests/test_pdf_processor.py tests/test_pdf_ocr.py
```

Known limitations: the first parser is generic, Camelot/OCR output still requires review, and scanned PDFs are more reliable when PaddleOCR models can be downloaded on first use.
