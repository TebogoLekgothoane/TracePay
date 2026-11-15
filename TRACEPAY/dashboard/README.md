# TracePay superadmin dashboard

Next.js (App Router, TypeScript) dashboard for the beta: registrations, funnel, statements, sales,
AI usage by feature and waitlist. It has no database access of its own. It reads
`GET /superadmin/api/metrics` from the FastAPI backend (`TRACEPAY/backend`).

## Run locally

Start the backend first (from `TRACEPAY/backend`):

```bash
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then, from this folder:

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in with the superadmin phone number and password. The session
is kept in that browser tab's session storage only.

## How it talks to the backend

The browser only calls this app. `next.config.mjs` rewrites `/api/session` and `/api/metrics` to
the backend, so the backend needs no CORS settings and its address never reaches the browser.
Copy `.env.example` to `.env.local` to change `BACKEND_URL`.

`BACKEND_URL` is read when Next builds or starts the dev server, not per request. Change it, then
rebuild.

## Deploy

- Backend: deploy `TRACEPAY/backend` as a container (it needs Ghostscript and Tesseract, so not
  Vercel). The account that signs in must have `app_metadata.role` set to `superadmin`.
- Dashboard: any Next.js host, including Vercel. Set the project root to `TRACEPAY/dashboard` and
  `BACKEND_URL` to the backend's public HTTPS address as a build-time environment variable.
- Serve both over HTTPS. The page is public; the data needs a superadmin session, and the backend
  rate-limits failed sign-in attempts.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript check |
