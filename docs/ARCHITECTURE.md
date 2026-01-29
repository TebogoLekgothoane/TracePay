# TracePay – Architecture (Hackathon)

## Overview

TracePay is a hackathon project built in teams. This document describes how the **deployed backend**, **frontend–backend linkage**, and **Open Banking API** fit together.

---

## 1. Deployed Backend (FastAPI or Node.js)

- **Current implementation:** Python **FastAPI** backend in `web/backend/`.
- **Alternative:** A **Node.js** backend could be used instead; the mobile app and dashboard talk to a single backend API, so the backend language is interchangeable as long as the API contract is the same.

**Backend responsibilities:**

- Auth (register, login, tokens).
- Open Banking flows: consent creation, account listing, transaction fetch (see §3).
- Forensic analysis: `/analyze` (transaction list → money leaks, health score).
- Mobile-specific: `/mobile/freeze`, `/mobile/frozen`, `/mobile/unfreeze`.
- MTN MoMo, voice, ML, admin, etc. as implemented.

**Deployment:** The backend is expected to be **deployed** (e.g. Railway, Render, Fly.io, or similar) so the mobile app and dashboard can call it via a public base URL (e.g. `https://tracepay-api.example.com`).

---

## 2. Frontend ↔ Backend (API linkage)

| Client        | Role                                      | How it talks to the backend                |
|---------------|-------------------------------------------|--------------------------------------------|
| **Mobile app** (Expo) | Primary user app (analysis, freeze, open banking) | `lib/backend-client.ts` – base URL from `EXPO_PUBLIC_BACKEND_URL` |
| **Dashboard** (Next.js) | Web dashboard (admin, accounts, auth)     | `lib/api.ts` – base URL from `NEXT_PUBLIC_API_URL` |

**Linkage in practice:**

- Both clients use the **same backend API** (same base URL once deployed).
- Mobile: set `EXPO_PUBLIC_BACKEND_URL` to the deployed backend URL; all backend/Open Banking calls go through `backend-client.ts`.
- Dashboard: set `NEXT_PUBLIC_API_URL` to the same URL; existing `ApiClient` in `web/dashboard/lib/api.ts` handles auth and API calls.
- **Supabase** (mobile `lib/api.ts`) is used for **app state** (settings, subscriptions, freeze toggles, category accounts, etc.). Backend is used for **auth, open banking, analysis, and mobile freeze/unfreeze** when wired.

---

## 3. Open Banking API (other team member)

- **Open Banking integration** (sandbox or live bank APIs – consent, accounts, transactions) is expected to be implemented and provided by **another team member** for the hackathon.
- The **backend** (`web/backend`) is the place that integrates with that Open Banking API:
  - Backend exposes routes such as `/open-banking/consent`, `/open-banking/accounts`, `/open-banking/fetch-transactions`.
  - Backend uses an **Open Banking client** (e.g. `open_banking_client.py` / sandbox config) that talks to the **external Open Banking API** (credentials, base URL, etc. configured via env).
- **Frontends (mobile + dashboard)** do **not** call the Open Banking API directly; they call **our backend**, which then calls the Open Banking API.

So:

- **Our backend** = single point of integration with the Open Banking API.
- **Other team member** = provides/owns the Open Banking API integration (client, credentials, endpoints) inside or alongside the backend.

---

## Summary

| Layer              | What it is / who owns it |
|--------------------|---------------------------|
| **Deployed backend** | FastAPI (or Node.js) in `web/backend`; deployed to a public URL. |
| **Frontend–backend linkage** | Mobile: `EXPO_PUBLIC_BACKEND_URL` + `lib/backend-client.ts`. Dashboard: `NEXT_PUBLIC_API_URL` + `lib/api.ts`. |
| **Open Banking API** | External API; integration implemented in the backend; expected from another team member. |

For details of backend routes and mobile client usage, see `web/backend/README.md` and `mobile/lib/backend-client.ts`.
