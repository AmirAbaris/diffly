# Floating Point Precision Loss in Financial Ledger

## Description
A payment billing microservice calculates merchant monthly payout statements, summing transaction gross volumes, applying local sales tax rates, and deducting credit card processing interchange fees. The calculation logic is implemented using Python's native binary floating point arithmetic (`float`).

## Threat Model
Binary floating-point types (`float` in Python / IEEE 754 double precision) cannot accurately represent base-10 fractional decimals like `0.1` or `0.029`. Across tens of thousands of aggregated merchant transactions, floating-point rounding inaccuracies compound and introduce discrepancies between the ledger records, bank transfer amounts, and tax reporting declarations. This causes financial reconciliation failures, audit non-compliance, and balance leakage.
