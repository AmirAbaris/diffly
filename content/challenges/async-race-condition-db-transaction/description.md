# Async Race Condition in Non-Atomic Balance Transfer

## Description
A fintech payment service provides an internal endpoint to transfer funds between user wallets. The handler retrieves the sender's wallet to check that sufficient funds exist, issues an asynchronous audit log event, and subsequently performs two database update operations to debit the sender and credit the recipient.

## Threat Model
Because the balance check and balance updates occur in separate queries without an ACID database transaction (`prisma.$transaction`) or atomic row-level decrement locks (`balance: { decrement: amount }` with `balance >= amount`), an attacker can send concurrent HTTP requests simultaneously. Both requests read the initial balance before either update writes, allowing the user to transfer the same funds multiple times (Double Spending / Time-of-Check to Time-of-Use Race Condition / CWE-362).
