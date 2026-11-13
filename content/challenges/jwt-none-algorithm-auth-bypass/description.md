# JWT None Algorithm & Key Confusion Authentication Bypass

## Description
An Express API authentication middleware verifies JSON Web Tokens passed in `Authorization: Bearer <token>` headers. The middleware decodes the token header to check the signing algorithm before calling `jwt.verify(token, PUBLIC_KEY)`.

## Threat Model
If an attacker sends a token with header `{"alg": "none"}`, the middleware branches into the unverified code path and trusts the token payload directly without signature verification. Furthermore, even in the `else` branch, `jwt.verify` is called without an explicit `algorithms: ["RS256"]` constraint. An attacker can perform a classic algorithm confusion attack: change the header algorithm to `HS256` and sign the token using the server's public RSA key as the HMAC shared secret, completely bypassing authentication and escalating privileges to `admin`.
