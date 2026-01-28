# Money Autopsy – Forensic Engine (FastAPI)

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


