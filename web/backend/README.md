# Money Autopsy – Forensic Engine (FastAPI)

**Hackathon / teams:** Integration with the **Open Banking API** (consent, accounts, transactions) is expected from another team member. This backend is the single point that talks to that API; mobile and dashboard call this backend, not the Open Banking API directly. See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for frontend–backend linkage.

## Open Banking sandbox

Add to a `.env` file in `web/backend/`:

```env
OPEN_BANKING_CLIENT_ID=your_client_id_here
OPEN_BANKING_CLIENT_SECRET=your_client_secret_here
```

Get credentials from the sandbox provider. Full flow and testing: see [OPEN_BANKING.md](OPEN_BANKING.md).

## Admin bootstrap

Regular registration always creates a standard user. To create the initial admin explicitly, set an `ADMIN_BOOTSTRAP_TOKEN` in `web/backend/.env`, then call:

```bash
curl -X POST http://localhost:8001/auth/bootstrap-admin ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"password\":\"change-me\",\"bootstrap_token\":\"your-token\"}"
```

The bootstrap endpoint returns `409` after an admin already exists.

## Account recovery and verification

Password reset and email verification links are delivered through SMTP. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM_EMAIL`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, and `APP_PUBLIC_URL` before enabling these flows in production. Request endpoints never return reset or verification tokens in API responses.

- `POST /auth/password-reset/request` with `{ "email": "user@example.com" }`
- `POST /auth/password-reset/confirm` with `{ "token": "...", "new_password": "new-password" }`
- `POST /auth/email-verification/request` with `{ "email": "user@example.com" }` and the user's bearer token
- `POST /auth/email-verification/confirm` with `{ "token": "..." }`

Login attempts are protected with both request rate limiting and a persistent account cooldown. After 5 failed password attempts, the account is cooled down for 15 minutes and `/auth/login` returns `429` with `Retry-After`.

## Run locally

Use **Python 3.11 or 3.12** (pandas builds reliably; 3.14 may fail). Create a venv and run with it.

**Option A – use the venv’s Python (no activation needed):**
```bash
cd web/backend
# Git Bash / WSL / Linux / Mac (forward slashes):
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8001
# Windows CMD / PowerShell (backslashes):
# .venv\Scripts\python -m uvicorn app.main:app --reload --port 8001
```

**Option B – activate venv then run:**
```bash
cd web/backend
.venv\Scripts\activate
pip install -r requirements.txt   # first time only
python -m uvicorn app.main:app --reload --port 8001
```

## Endpoints

- Prefer versioned routes under `/v1`, for example `POST /v1/auth/login`.
- `POST /v1/analyze`: analyze `{ "transactions": [...], "context": {} }`.
- `POST /freeze`: simulate revoking consent / freezing a suspicious item.

Error responses use a consistent envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": []
  }
}
```

## Quick test

```bash
curl -s -X POST http://localhost:8001/v1/analyze ^
  -H "Content-Type: application/json" ^
  -d @data/mtn_momo_mock.json
```


