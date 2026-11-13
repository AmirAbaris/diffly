# Unchecked Integer Multiplication Overflow in Billing

## Description
A cloud infrastructure metering service calculates line item invoices for API requests and compute credits. To avoid floating point inaccuracies, pricing is calculated in micro-cents (1/100,000,000 of a dollar) using integer arithmetic in Rust.

## Threat Model
In Rust, integer operations are checked in debug mode (causing panics on overflow), but wrap silently using two's complement in optimized release builds (`--release`). Multiplying `units_consumed: u32` by `unit_price_micro_cents: u32` into a `u32` can easily exceed `u32::MAX` (~4.29 billion, equivalent to only ~$42.95 at 100,000,000 micro-cents per dollar). For larger enterprise invoices, the product overflows and wraps back to a negligible dollar amount, causing massive financial underbilling.
