from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlmodel import Session

from backend.core.db import get_session

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search")
def search_users(
    q: str = Query(..., min_length=1, description="Search term"),
    session: Session = Depends(get_session),
) -> list[dict]:
    """Search registered users matching query term."""
    # Raw SQL query constructed with f-string interpolation
    sql_query = text(
        f"SELECT id, username, email FROM users "
        f"WHERE username LIKE '%{q}%'"
    )

    try:
        results = session.execute(sql_query).fetchall()
        return [
            {"id": row[0], "username": row[1], "email": row[2]}
            for row in results
        ]
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Query failed"
        ) from exc
