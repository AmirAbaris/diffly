# Returning Deferred IEnumerable After Using-Block Context Disposal

## Description

A billing export service opens a short-lived `BillingDbContext` from `IDbContextFactory<BillingDbContext>` using an `await using` declaration, builds a LINQ projection of pending invoices for a customer, and returns `IEnumerable<InvoiceExportRow>` to the calling CSV exporter.

## Threat Model

LINQ-to-Entities queries (`IQueryable<T>` / `IEnumerable<T>`) use deferred execution and do not run against the database until enumerated. When `GetPendingInvoicesAsync` returns `pendingRows`, the `await using` block immediately disposes `db`. As soon as the caller iterates the returned sequence, EF Core attempts to execute the query on a disposed `DbContext`, throwing `ObjectDisposedException` and failing billing exports in production (CWE-672).
