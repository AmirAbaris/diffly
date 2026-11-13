# Non-Nil Error Interface Wrapping Concrete Nil Pointer

## Description
A microservice client checks upstream endpoint health with `ValidateEndpoint(url) error`. When the endpoint responds with HTTP 200, no error occurs. The function declares a concrete pointer `var apiErr *APIError` initialized to `nil` and returns it as an `error` interface.

## Threat Model
In Go, an interface value is represented internally as a two-word tuple: `(type, value)`. An interface is strictly `nil` if and only if both its dynamic type and its dynamic value are nil. When `ValidateEndpoint` returns `var apiErr *APIError = nil` into an `error` interface return type, the interface holds `(*APIError, nil)`. Consequently, the caller's check `if err != nil` evaluates to `true` even on a successful HTTP 200 response, reporting a false outage, tripping monitoring alarms, or causing unexpected panics when dereferencing struct fields.
