# Unclosed JDBC Connection and Statement Resource Leak

## Description

A Java billing repository queries recent posted ledger entries for an account using JDBC `DataSource`, `Connection`, `PreparedStatement`, and `ResultSet`. After iterating through the rows, the method calls `rs.close()`, `stmt.close()`, and `conn.close()` before returning the collected entries.

## Threat Model

Under normal execution, all three JDBC handles appear to be closed. However, if a query timeout, network drop, data conversion error, or `SQLException` occurs anywhere between acquiring the connection and closing it—or if `rs.close()` itself throws—execution unwinds past the manual `close()` calls. Each failed request leaks a pooled database `Connection`, `PreparedStatement`, and database cursor, allowing transient errors or repeated invalid queries to exhaust the connection pool and cause service-wide denial of service (CWE-404).
