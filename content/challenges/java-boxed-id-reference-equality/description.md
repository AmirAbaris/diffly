# Boxed Long Reference Equality Bug in Authorization Check

## Description

A document access guard verifies ownership before returning a `DocumentRecord` to a caller. After confirming the request parameters are non-null and checking whether the caller has the `PLATFORM_ADMIN` role, it compares `doc.ownerId()` against `actor.userId()` and throws `SecurityException` if they do not match.

## Threat Model

In Java, `==` and `!=` on boxed `Long` objects compare heap object references rather than numeric values (CWE-595). Because `Long.valueOf()` caches instances for values from `-128` through `127`, integration and unit tests seeded with small IDs (`1L`, `42L`) pass consistently. In production, once user IDs reach `128` or higher, `doc.ownerId()` and `actor.userId()` are distinct `Long` instances with equal numeric values, causing `docOwnerId != requesterId` to evaluate to `true` and breaking authorization for legitimate owners (or inversely failing equality-based blocklists).
