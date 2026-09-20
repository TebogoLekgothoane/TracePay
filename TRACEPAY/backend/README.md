# TRACEPAY Backend

The backend currently has two focused processes:

1. **Auth (Node.js + TypeScript)** in `src/auth` — signup, login, Twilio SMS OTP.
2. **Statement extraction API (Python)** in `pdf_processor/` — PDF inspection, table extraction, OCR fallback, normalization, and validation.

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

The Python API intentionally starts with extraction only. It does not write to Supabase or run ML yet.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/extraction/preview` | Extract and validate a PDF without importing it |

The extraction response uses one canonical transaction shape for both file types:

```text
transaction_date, description, amount, transaction_type, currency, balance
```

PDF processing tries pdfplumber first, then Camelot table extraction, then Tesseract OCR when the PDF has insufficient text. It returns raw extraction metadata, normalized transactions, and a validation result. The mobile app uploads the original PDF to the private `statements` bucket and stores only normalized `pdf` transactions in PostgreSQL.

Install the Python dependencies before starting the extraction API:

```bash
python -m pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Camelot may require the system PDF rendering dependencies documented by its installation guide. Tesseract must also be installed locally and available on `PATH` for scanned-PDF fallback. Apply `supabase/migrations/202609200001_pdf_statement_ingestion.sql` to the project before testing authenticated uploads.

Tests:

```bash
python -m pytest tests/test_pdf_processor.py
```

Known limitations: the first parser is generic, Camelot/OCR output still requires review, scanned PDFs need a working local Tesseract installation, and balance reconciliation is reserved for the next parser-validation pass.
