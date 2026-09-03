# TRACEPAY Backend

Two processes:

1. **Auth (Node.js + TypeScript)** in `src/auth` — signup, login, Twilio SMS OTP.
2. **Financial API (Python)** in `app/` — leaks, transactions, ingestion.

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
uvicorn app.main:app --reload
```
