# Broken Replay Attack Protection in Webhook HMAC Verifier

## Description
A payment service webhook endpoint processes real-time transaction updates from Stripe. Incoming webhooks contain an HMAC signature in `X-Webhook-Signature` and an event timestamp in `X-Webhook-Timestamp`. The handler hashes the request body and compares digests using `hmac.compare_digest`.

## Threat Model
Although the endpoint verifies cryptographic authenticity of the payload, it completely ignores the `X-Webhook-Timestamp` header. It performs no freshness check (e.g., verifying `current_time - timestamp < 300` seconds) and does not bind the timestamp into the signed HMAC message. An attacker who captures a legitimate payment success webhook (via man-in-the-middle or malicious proxy) can replay the exact same HTTP request repeatedly (CWE-294: Authentication Bypass by Capture-replay). This triggers duplicate credit grants and inventory disbursements without authorization.
