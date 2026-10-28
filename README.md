# RabbitHole

RabbitHole is a personal knowledge workspace that turns saved online content into a searchable collection of notes, summaries, concepts, and connected ideas.

Instead of leaving useful information scattered across browser tabs, RabbitHole lets you save resources, revisit them in a library, and explore relationships between the ideas they contain.

## Features

- **Save resources** from supported URLs and text content.
- **YouTube transcript extraction** using Supadata, so supported videos can be processed as source material.
- **Summaries and concept extraction** to make saved material easier to review.
- **Connected knowledge graph** to explore relationships between concepts from saved resources.
- **Library** for browsing saved resources.
- **Resource detail pages** for revisiting the content and its extracted information.
- **Search and resource management** for finding, retrying, and deleting saved items.
- **AI provider flexibility** through the configured LLM provider(s), depending on your local environment.

Supported source types and extraction quality depend on the source URL, its availability, and the provider's access to the content. YouTube transcript extraction requires a valid Supadata API key.

## Tech stack

### Frontend
- React
- TypeScript
- Vite

### Backend
- Python
- FastAPI
- SQLAlchemy
- SQLite

### AI and content extraction
- Configured LLM provider(s), such as Groq or Ollama
- Supadata for YouTube transcript retrieval

## Project structure

```text
RabbitHole/
├── backend/       # FastAPI application, database models, routes, and tests
└── frontend/      # React + TypeScript + Vite application
```

## Prerequisites

Install the following before running the project:

- Python
- Node.js and npm
- Git

You will also need the API keys required by the providers you have enabled. Keep secrets in local environment files and never commit them to Git.

## Configuration

1. Open the `backend` directory.
2. Create or update the environment file expected by the backend.
3. Add the API keys and provider settings required by your current configuration, including the Supadata key for YouTube transcripts.
4. Confirm that the backend loads the environment variables before making provider requests.

**Important:** Use the variable names already expected by the codebase. Do not rename environment variables just to match this README. Never commit real API keys or `.env` files.

## Run locally on Windows

Open two separate PowerShell terminals from the project directory.

### 1. Start the backend

```powershell
cd D:\RabbitHole\backend
..\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

The API should be available at:

- API: http://127.0.0.1:8000
- Interactive API docs: http://127.0.0.1:8000/docs

If your virtual environment is located inside `backend` instead of the project root, activate it with:

```powershell
.\.venv\Scripts\Activate.ps1
```

Use the activation path that matches your actual environment.

### 2. Start the frontend

In a second terminal:

```powershell
cd D:\RabbitHole\frontend
npm install
npm run dev
```

Vite prints the local frontend URL in the terminal, usually http://localhost:5173.

## Testing

### Backend

From the `backend` directory, with the project's virtual environment activated:

```powershell
python -m pytest
```

### Frontend

From the `frontend` directory:

```powershell
npm test
```

To create a production build:

```powershell
npm run build
```

Run the tests and build again after making changes. A passing test suite does not replace a manual end-to-end check of saving a source, opening it, and verifying its extracted content and graph connections.

## Typical workflow

1. Start the backend and frontend.
2. Add a supported URL or text resource.
3. Let RabbitHole retrieve the source content and process it.
4. Open the saved item to review its summary and extracted concepts.
5. Browse the library and explore the connected knowledge graph.

For YouTube, transcript retrieval must succeed before the video can be processed reliably. If it fails, check that the Supadata key is present in the backend environment, that the key is valid, and that the video has an accessible transcript.

## Current scope

RabbitHole is currently documented as a **single-user workspace**. Account registration, login, and multi-user data isolation are not included in this README's feature set.

## Security notes

- Do not commit API keys, access tokens, or local `.env` files.
- Keep provider credentials on the backend; do not expose secret keys in frontend code.
- Treat extracted summaries and concepts as AI-generated interpretations and verify important details against the original source.

## Contributing / development

1. Create a branch for your change.
2. Make the smallest focused change possible.
3. Run the relevant backend and frontend tests.
4. Run the frontend production build.
5. Manually verify the affected workflow before merging.

---

Built to help turn browsing into connected understanding.
