import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from scalar_fastapi import get_scalar_api_reference
from sqlmodel import Session, func, select

from api.routes.auth import router as auth_router
from api.routes.challenges import router as challenges_router
from api.routes.submissions import router as submissions_router
from api.routes.user import router as user_router
from backend.core.config import settings
from backend.core.db import get_session, init_db
from backend.models.challenge import Challenge
from backend.seed.seed_data import seed_challenges_if_empty


SERVER_START_TIME = time.time()


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
app.include_router(submissions_router)
app.include_router(user_router)
app.include_router(auth_router)


cors_kwargs: dict[str, Any] = {
    "allow_origins": settings.CORS_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.CORS_ORIGIN_REGEX:
    cors_kwargs["allow_origin_regex"] = settings.CORS_ORIGIN_REGEX

app.add_middleware(CORSMiddleware, **cors_kwargs)


@app.get("/scalar", include_in_schema=False)
def scalar_html():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Documentation",
    )


@app.get("/api/health")
def health_check(
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, Any]:
    uptime_seconds = max(0.0, time.time() - SERVER_START_TIME)
    try:
        challenge_count = session.exec(
            select(func.count(Challenge.id)).where(Challenge.is_public.is_(True))
        ).one()
        db_status = "connected"
    except Exception as exc:
        db_status = f"disconnected: {exc}"
        challenge_count = 0
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    is_healthy = db_status == "connected"
    return {
        "status": "healthy" if is_healthy else "unhealthy",
        "service": "diffly-fastapi",
        "database": db_status,
        "challenge_count": challenge_count,
        "uptime_seconds": round(uptime_seconds, 2),
    }
