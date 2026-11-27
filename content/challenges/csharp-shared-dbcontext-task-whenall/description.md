# Concurrent EF Core DbContext Access Across Task.WhenAll

## Description

A customer portal service aggregates recent invoices and recent audit events into a single `CustomerDashboardDto`. To reduce latency, `GetDashboardAsync` launches both EF Core queries concurrently with `Task.WhenAll` against the injected scoped `AppDbContext`.

## Threat Model

Entity Framework Core's `DbContext` is not thread-safe and does not support multiple overlapping async operations on the same instance. Executing two queries concurrently via `Task.WhenAll` races on the underlying database connection and internal context state, throwing `InvalidOperationException` ("A second operation was started on this context instance before a previous operation completed") or corrupting internal state under production load (CWE-362).
