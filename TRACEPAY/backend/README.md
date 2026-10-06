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
