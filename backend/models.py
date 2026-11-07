from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


class Challenge(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    title: str
    difficulty: str  # "Easy", "Medium", "Hard"
    category: str  # "Agent Antipaths", "Security", "Concurrency"
    description: str
    code_snippet: str
    language: str  # "python", "typescript"
    expected_issues: str  # JSON-encoded list of expected defects
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ReviewSubmission(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    challenge_id: int = Field(foreign_key="challenge.id")
    flagged_lines: str
    comments: str
    score: int
    feedback: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
