from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import health


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],  # includes our custom X-Owner-Id header
    )

    # Every route lives under /api. New routers (items, graph, ...) get added here.
    app.include_router(health.router, prefix="/api")

    return app


app = create_app()
