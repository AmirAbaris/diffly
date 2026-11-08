from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from scalar_fastapi import get_scalar_api_reference

from api.routes.challenges import router as challenges_router
from backend.core.config import settings
from backend.core.db import init_db
from backend.seed.seed_data import seed_challenges_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    seed_challenges_if_empty()
    yield


app = FastAPI(
    title="Diffly API",
    description="API for Diffly developer code review platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(challenges_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/scalar", include_in_schema=False)
def scalar_html():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Documentation",
    )


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": "diffly-fastapi",
    }
