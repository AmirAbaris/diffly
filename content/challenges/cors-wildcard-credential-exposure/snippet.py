from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


app = FastAPI(title="Diffly Account Microservice")

# Configure Cross-Origin Resource Sharing for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
    max_age=3600,
)


class UserProfileResponse(BaseModel):
    user_id: str
    email: str
    billing_tier: str
    api_token: str


@app.get("/api/v1/profile", response_model=UserProfileResponse)
def get_user_profile(current_user: dict = Depends(lambda: {"id": "usr_1", "email": "dev@diffly.dev"})):
    """Fetch sensitive account profile and authentication token."""
    return UserProfileResponse(
        user_id=current_user["id"],
        email=current_user["email"],
        billing_tier="enterprise",
        api_token="diffly_live_sec_994827103859",
    )
