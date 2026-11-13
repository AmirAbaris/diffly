import hashlib
import hmac
import time
from typing import Any
from fastapi import FastAPI, Header, HTTPException, Request, status

app = FastAPI()

WEBHOOK_SECRET = b"whsec_production_secret_key_88410294"


@app.post("/api/v1/webhooks/stripe")
async def handle_incoming_webhook(
    request: Request,
    x_webhook_signature: str = Header(..., alias="X-Webhook-Signature"),
    x_webhook_timestamp: str = Header(..., alias="X-Webhook-Timestamp"),
) -> dict[str, Any]:
    """Verify and process external billing webhook notifications."""
    raw_body = await request.body()

    if not x_webhook_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing webhook signature header",
        )

    # Compute expected HMAC signature over payload
    # Defect: Timestamp freshness is not validated and timestamp is not bound to HMAC
    expected_sig = hmac.new(
        WEBHOOK_SECRET, msg=raw_body, digestmod=hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_sig, x_webhook_signature):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook signature",
        )

    payload = await request.json()
    # Process invoice payment or grant credits
    return {"status": "accepted", "event_id": payload.get("id")}
