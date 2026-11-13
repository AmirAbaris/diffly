# Insecure Direct Object Reference in Multi-Tenant API

## Description
A multi-tenant SaaS document collaboration service provides a REST endpoint `DELETE /api/documents/:documentId` to remove documents. The route verifies that the caller has an active session with a valid `tenantId`, then queries and deletes the document using Prisma ORM.

## Threat Model
Although the endpoint verifies that the user is logged in, it queries and deletes documents solely by the record primary key `documentId` without scoping the query to the user's `tenantId`. A malicious user in Tenant A can supply document IDs belonging to Tenant B and successfully delete competitor data across tenant boundaries (Insecure Direct Object Reference / IDOR / CWE-639 / Broken Object Level Authorization).
