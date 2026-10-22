# TRACEPAY

This directory is the **active TracePay product**.

The current path is:

`PDF statement → authenticated extraction API → categorisation → Supabase → mobile review`

SMS ingestion remains Android-only future work. Do not confuse this tree with the older hackathon stack at the repo root (`mobile/`, `web/backend`, `web/dashboard`).

## Architecture

| Piece | Location | Role |
|---|---|---|
| Mobile app | `TRACEPAY/mobile` | Expo 57, React Native. UI, PIN lock, statement import, Supabase session. |
| Node auth API | `TRACEPAY/backend` (`npm run dev`) | Port **4001**. Phone OTP (Twilio), session tokens. Never put Twilio or service-role keys in the mobile app. |
| Python extraction API | `TRACEPAY/backend` (`uvicorn app.main:app`) | Port **8000**. PDF parsing and categorisation. Validates the user JWT. Does not write transactions itself. |
| Database | `TRACEPAY/supabase/migrations` | Postgres / RLS for accounts, statement imports, and transactions. |

Mobile environment (`TRACEPAY/mobile/env.example`):

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_URL` (auth server, default `http://localhost:4001`)
- `EXPO_PUBLIC_PDF_PROCESSOR_URL` (extraction API, default `http://localhost:8000`)

Backend environment: copy `TRACEPAY/backend/.env.example`. Optional transaction categorisation uses `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`) when `AI_CATEGORISATION_ENABLED=true`. Gemini settings remain for optional PDF extraction only.

## Milestone notes

Categorisation runs on the extraction API (deterministic rules first, then optional OpenRouter for eligible unknown transactions, with configured OpenAI/xAI compatibility fallbacks). Gemini remains available only for optional PDF extraction. Leak detection against live transactions is **not** wired yet; leak screens still use static product copy. `leak_intelligence` is a feature-engineering library for a later leak pipeline, not a third runtime.
