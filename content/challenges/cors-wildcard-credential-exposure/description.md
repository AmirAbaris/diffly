# CORS Wildcard Origin with Credential Exposure

## Description
A FastAPI microservice exposes internal user account management and billing endpoints. To permit requests from local developer machines and various staging web clients, the application configures Starlette/FastAPI `CORSMiddleware`.

## Threat Model
Configuring `allow_origins=["*"]` with `allow_credentials=True` allows cross-origin web browsers to execute authenticated requests (bearing cookies or HTTP auth credentials) against the API from any origin on the internet. An adversary hosting a malicious website can trigger victim browsers to make cross-origin requests to `/api/v1/profile` and read confidential account details and API tokens (CWE-942: Permissive Cross-Origin Resource Sharing Policy with Untrusted Site).
