# RabbitHole

AI-powered personal knowledge discovery. Save articles, YouTube videos, blogs and GitHub repos,
get summaries and key concepts, and explore connections in an interactive knowledge graph.

**Status:** Day 1 in progress (backend foundations).

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
