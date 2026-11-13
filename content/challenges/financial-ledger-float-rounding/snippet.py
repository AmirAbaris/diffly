from typing import TypedDict


class Transaction(TypedDict):
    id: str
    amount: float
    tax_rate: float


class LedgerCalculator:
    def __init__(self, processing_fee_pct: float = 0.029) -> None:
        self.processing_fee_pct = processing_fee_pct

    def compute_statement(
        self, transactions: list[Transaction]
    ) -> dict[str, float]:
        """Calculate net settlement, total tax, and processor fees for payout."""
        subtotal: float = 0.0
        total_tax: float = 0.0

        for txn in transactions:
            # Using standard IEEE 754 float arithmetic for financial amounts
            raw_amount = float(txn["amount"])
            tax = raw_amount * float(txn["tax_rate"])

            subtotal += raw_amount
            total_tax += tax

        # Compute fee and net payout using float multiplication and division
        processor_fee = round(subtotal * self.processing_fee_pct, 2)
        net_settlement = round(subtotal + total_tax - processor_fee, 2)

        return {
            "subtotal": round(subtotal, 2),
            "total_tax": round(total_tax, 2),
            "processor_fee": processor_fee,
            "net_settlement": net_settlement,
        }
