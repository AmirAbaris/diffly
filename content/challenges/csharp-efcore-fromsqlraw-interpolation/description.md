# SQL Injection via Interpolated String in EF Core FromSqlRaw

## Description

A multi-tenant billing repository queries `Invoices` by `tenantId` and an optional `statusFilter` using Entity Framework Core's `FromSqlRaw`. It clamps `pageSize` to a maximum of 100 rows and trims `statusFilter` before composing the SQL query string.

## Threat Model

Authenticated callers control `statusFilter` (and potentially `tenantId` in service-to-service calls). Because `FromSqlRaw` accepts a plain `string`, C# eagerly formats the interpolated `$""` query before EF Core ever inspects it—bypassing `FormattableString` parameterization. An attacker can inject SQL predicates such as `' OR '1'='1' --` into `statusFilter` to bypass tenant isolation and exfiltrate invoices belonging to other tenants (CWE-89).
