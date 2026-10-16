# RabbitHole

AI-powered personal knowledge discovery. Save articles, YouTube videos, blogs and GitHub repos,
get summaries and key concepts, and explore connections in an interactive knowledge graph.

**Status:** Day 1 in progress (backend: saving items, text extraction, AI summaries and concepts).

## Run the backend (Windows PowerShell)

```powershell
cd rabbithole\backend
py -3.14 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Then open http://127.0.0.1:8000/api/health and http://127.0.0.1:8000/docs.

`alembic upgrade head` creates the database tables (a file called `rabbithole.db` in `backend/`).
Run it again whenever a new migration is added.

## Set up the AI

Summaries and concepts come from an AI model. Edit `backend\.env` (copied from `.env.example`):

- **Groq (hosted, free tier):** create a key at https://console.groq.com, then set `GROQ_API_KEY=...`
- **Ollama (local):** install Ollama, run `ollama pull llama3.1`, then set `LLM_PROVIDER=ollama`

Restart `uvicorn` after editing `.env`. Never commit `.env` (it is in `.gitignore`).
The tests never call the AI, so they pass without a key.

## Try the API

Every request needs an `X-Owner-Id` header (any UUID; the frontend will generate one per browser).
In PowerShell:

```powershell
$h = @{ "X-Owner-Id" = "11111111-1111-4111-8111-111111111111" }
$body = '{"url": "https://en.wikipedia.org/wiki/Gradient_descent"}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/items -Headers $h -ContentType "application/json" -Body $body
Invoke-RestMethod http://127.0.0.1:8000/api/items -Headers $h
```

The first call returns `status: pending`; a few seconds later the list shows `ready` (or `failed` with
an `error_message`). You can also use the interactive page at http://127.0.0.1:8000/docs.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/items` | Save a `url` or pasted `text` |
| GET | `/api/items` | List your items (`?q=`, `?limit=`, `?offset=`) |
| GET | `/api/items/{id}` | One item, including its extracted text |
| DELETE | `/api/items/{id}` | Delete an item |
| POST | `/api/items/{id}/retry` | Re-run a failed item |

## Run the tests

```powershell
cd rabbithole\backend
.venv\Scripts\Activate.ps1
pytest
```

## Changing the database

1. Edit `backend/app/models.py`.
2. Create a migration: `alembic revision --autogenerate -m "describe the change"`
3. Check the new file in `backend/alembic/versions/`, then run `alembic upgrade head`.
