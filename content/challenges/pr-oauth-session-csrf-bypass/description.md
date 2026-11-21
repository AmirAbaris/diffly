# PR #418: OAuth Callback & Session Cookie Hardening

## Description
This pull request updates the OAuth login callback route and the session cookie helper during a refactor to support stateless mobile webviews alongside browser logins.

Review all changed files across the PR carefully:
- `api/routes/oauth.py`
- `backend/core/cookies.py`
- `backend/core/oauth_config.py`

## Threat Model
Authentication callbacks and session cookie attributes sit directly on the external trust boundary:
- An attacker who crafts an OAuth authorization callback URL with a victim's or attacker's code can force victim browsers to bind to an attacker-controlled account (Login CSRF) if `state` is not cryptographically bound and verified against the caller's cookie/session.
- Weakening session cookie flags (`httponly`, `secure`, `samesite`) exposes session tokens to client-side JavaScript exfiltration (XSS), plaintext network interception, and unintended cross-origin cookie transmission.
