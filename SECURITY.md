# Security Policy

## Supported versions

Diffly receives security fixes on the current development branch and active release line:

| Version or branch | Supported |
| :---------------- | :-------- |
| `main`            | Yes       |
| `0.1.x`           | Yes       |

## Reporting a vulnerability

Report suspected security vulnerabilities privately through GitHub Security Advisories at [https://github.com/AmirAbaris/diffly/security/advisories/new](https://github.com/AmirAbaris/diffly/security/advisories/new). Do not open public GitHub issues, pull requests, or discussions for unpatched vulnerabilities.

Include the following details in your report so maintainers can reproduce and fix the issue quickly:

- Affected endpoint, component, file path, or environment variable
- Reproduction steps, request payloads, or proof-of-concept details
- Expected impact (such as cross-user data exposure, authentication bypass, or arbitrary code execution)
- Suggested remediation if known

Maintainers aim to acknowledge private reports within 72 hours and coordinate disclosure once a fix is verified and merged.

## Security scope

We prioritize reports affecting the application runtime and user data boundaries:

- **Authentication and JWT cookies.** Token signing in `backend/core/security.py`, `HttpOnly` and `Secure` cookie attributes in `api/routes/auth.py`, startup secret validation in `backend/core/config.py`, and session claiming in `api/routes/user.py`.
- **Challenge evaluation.** Input validation, regular expression performance, and scoring logic in `backend/services/evaluation_service.py` and `api/routes/submissions.py`.
- **BYOK Gemini key handling.** Handling of user-supplied `X-Gemini-Key` headers in `api/routes/challenges.py` and `backend/services/gemini_generator.py` to ensure keys stay strictly in-memory for the outbound request and are never persisted or logged.
- **API authorization and isolation.** Ownership checks and guest session isolation across `backend/services/ownership.py`, `api/deps.py`, and `tests/test_authorization_matrix.py`.

## Intentionally vulnerable challenge snippets

Directories under `content/challenges/` contain intentionally vulnerable code snippets (`snippet.py`, `snippet.ts`, `snippet.go`, and `snippet.rs`) for educational code review training. Examples include `eval()`, raw SQL string interpolation, SSRF, and path traversal patterns.

Diffly stores these snippets as plain text, renders them in the browser syntax highlighter, and evaluates user review comments statically against `meta.yaml` metadata. Diffly never executes challenge snippets on the backend or frontend. Do not report intentional defects inside `content/challenges/` as application vulnerabilities unless the platform executes or unsafely renders them.
