# Server-Side Request Forgery in Webhook Dispatcher

## Description
A Go-based microservice is responsible for delivering customer webhook notifications for payment and billing events. Customers configure their destination webhook URL in their account settings, and the `Dispatcher` dispatches outbound HTTP POST requests with the JSON payload.

## Threat Model
Because the destination URL is accepted directly from user configuration without URL schema validation, DNS resolution controls, or IP address filtering, an adversary can configure internal endpoints (e.g., `http://169.254.169.254/latest/meta-data/` for AWS/GCP instance metadata, `http://localhost:6379/` for internal Redis, or `http://10.0.0.5:8080/internal/admin`). The webhook worker will issue requests to these private services, enabling Server-Side Request Forgery (SSRF / CWE-918), internal network reconnaissance, and cloud credential exfiltration.
