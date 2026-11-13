# Catastrophic Backtracking ReDoS in Input Validation

## Description
An Express middleware validates user registration payloads before accounts are provisioned. To ensure usernames adhere to naming conventions, the middleware applies a regular expression pattern `/^([a-zA-Z0-9]+_?)+[a-zA-Z0-9]+$/` via `RegExp.test(username)`.

## Threat Model
The regular expression contains nested quantifiers `([a-zA-Z0-9]+_?)+` matching overlapping character classes. When an attacker submits an unmatching input string such as 40 characters followed by an exclamation mark (`"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!"`), the V8 regex engine's Nondeterministic Finite Automaton (NFA) evaluates billions of permutations. This causes catastrophic backtracking (ReDoS / CWE-1333), driving CPU utilization to 100% and completely blocking the single-threaded Node.js event loop, preventing all other incoming requests from being processed.
