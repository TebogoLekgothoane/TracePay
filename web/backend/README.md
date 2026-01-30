# Money Autopsy – Forensic Engine (FastAPI)

**Hackathon / teams:** Integration with the **Open Banking API** (consent, accounts, transactions) is expected from another team member. This backend is the single point that talks to that API; mobile and dashboard call this backend, not the Open Banking API directly. See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for frontend–backend linkage.

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

- `POST /analyze`: analyze a transactions JSON payload.
- `POST /freeze`: simulate revoking consent / freezing a suspicious item.

## Quick test

```bash
curl -s -X POST http://localhost:8001/analyze ^
  -H "Content-Type: application/json" ^
  -d @data/mtn_momo_mock.json
```


