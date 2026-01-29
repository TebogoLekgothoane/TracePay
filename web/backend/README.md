# Money Autopsy – Forensic Engine (FastAPI)

**Hackathon / teams:** Integration with the **Open Banking API** (consent, accounts, transactions) is expected from another team member. This backend is the single point that talks to that API; mobile and dashboard call this backend, not the Open Banking API directly. See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for frontend–backend linkage.

## Run locally

```bash
cd web/backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Endpoints

- `POST /analyze`: analyze a transactions JSON payload.
- `POST /freeze`: simulate revoking consent / freezing a suspicious item.

## Quick test

```bash
curl -s -X POST http://localhost:8001/analyze ^
  -H "Content-Type: application/json" ^
  -d @data/mtn_momo_mock.json
```


