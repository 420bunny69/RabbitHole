from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ask, graph, health, items, topics, trails, workspaces

from dotenv import load_dotenv

load_dotenv()
def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            *settings.cors_origin_list,
            "https://rabbithole-eddqxgey7-420bunny69s-projects.vercel.app",
        ],
        allow_methods=["*"],
        allow_headers=["*"],  # includes our custom X-Owner-Id header
        allow_credentials=True,
    )

    # Every route lives under /api. New routers get added here.
    app.include_router(health.router, prefix="/api")
    app.include_router(items.router, prefix="/api")
    app.include_router(graph.router, prefix="/api")
    app.include_router(topics.router, prefix="/api")
    app.include_router(ask.router, prefix="/api")
    app.include_router(trails.router, prefix="/api")
    app.include_router(workspaces.router, prefix="/api")

    return app


app = create_app()