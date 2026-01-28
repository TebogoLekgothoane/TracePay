# Money Autopsy – Dashboard (Next.js)

## Run

```bash
cd web/dashboard
npm install
set NEXT_PUBLIC_BACKEND_URL=http://localhost:8001
npm run dev
```

Open `http://localhost:3000`.

## Notes

- The dashboard loads demo transactions from `public/mtn_momo_mock.json`
- It calls the FastAPI backend at `NEXT_PUBLIC_BACKEND_URL`:
  - `POST /analyze`
  - `POST /freeze`


