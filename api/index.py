import json
from collections.abc import Generator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.db import get_session, init_db
from backend.models import Challenge, ReviewSubmission
from backend.seed import seed_database


SessionDep = Annotated[Session, Depends(get_session)]


@asynccontextmanager
async def lifespan(app: FastAPI) -> Generator[None, None, None]:
    init_db()
    seed_database()
    yield


app = FastAPI(
    title="Diffly API",
    description="LeetCode for Code Review on Agent Codes and PRs",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReviewRequest(BaseModel):
    flagged_lines: list[int]
    comments: str


class ReviewResponse(BaseModel):
    submission_id: int
    score: int
    feedback: str
    detected_issues: list[str]


@app.get("/api/health")
def health_check(session: SessionDep) -> dict[str, object]:
    challenge_count = len(session.exec(select(Challenge)).all())
    return {
        "status": "healthy",
        "service": "diffly-fastapi",
        "database": "connected",
        "challenges_available": challenge_count,
    }


@app.get("/api/challenges")
def list_challenges(session: SessionDep) -> list[dict[str, object]]:
    challenges = session.exec(select(Challenge)).all()
    return [
        {
            "id": c.id,
            "slug": c.slug,
            "title": c.title,
            "difficulty": c.difficulty,
            "category": c.category,
            "description": c.description,
            "language": c.language,
        }
        for c in challenges
    ]


@app.get("/api/challenges/{challenge_id}")
def get_challenge(challenge_id: int, session: SessionDep) -> Challenge:
    challenge = session.get(Challenge, challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return challenge


@app.post("/api/challenges/{challenge_id}/review", response_model=ReviewResponse)
def submit_review(
    challenge_id: int,
    payload: ReviewRequest,
    session: SessionDep,
) -> ReviewResponse:
    challenge = session.get(Challenge, challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    expected_issues = json.loads(challenge.expected_issues)
    user_comment_lower = payload.comments.lower()

    detected_issues: list[str] = []
    points = 0
    max_points = len(expected_issues) * 100

    for issue in expected_issues:
        matched_line = issue.get("line") in payload.flagged_lines
        matched_keyword = any(
            kw.lower() in user_comment_lower for kw in issue.get("keywords", [])
        )

        if matched_line and matched_keyword:
            points += 100
            detected_issues.append(f"Accurately identified: {issue['description']}")
        elif matched_line:
            points += 50
            detected_issues.append(
                f"Flagged line {issue['line']}, but lacked specific pattern detail."
            )
        elif matched_keyword:
            detected_issues.append(
                f"Noticed pattern ({issue['description']}), "
                f"but missed line {issue['line']}."
            )

    score = int((points / max_points) * 100) if max_points > 0 else 0
    if score >= 80:
        feedback = "Outstanding review! You caught the critical defects."
    elif score >= 40:
        feedback = "Partially correct review. Check your line targets and explanations."
    else:
        feedback = "Review missed the core defect. Inspect the code snippet closely."

    submission = ReviewSubmission(
        challenge_id=challenge_id,
        flagged_lines=json.dumps(payload.flagged_lines),
        comments=payload.comments,
        score=score,
        feedback=feedback,
    )
    session.add(submission)
    session.commit()
    session.refresh(submission)

    return ReviewResponse(
        submission_id=submission.id or 0,
        score=score,
        feedback=feedback,
        detected_issues=detected_issues,
    )
