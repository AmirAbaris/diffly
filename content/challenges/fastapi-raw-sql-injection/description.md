# FastAPI Raw SQL Query String Interpolation

## Description
A FastAPI user lookup service provides an administrative search endpoint to filter user accounts by username or email. The developer implemented the filter using raw SQL wrapped in SQLAlchemy `text()`, but formatted the query string using an f-string instead of parameterized query arguments.

## Threat Model
User-supplied input via query parameter `q` is directly concatenated into the SQL statement. An attacker can supply SQL injection payloads such as `' OR '1'='1` or UNION-based select queries to bypass filtering, dump sensitive password hashes from the `users` table, or tamper with database records.
