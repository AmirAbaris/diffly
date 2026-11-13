#[derive(Debug, PartialEq, Eq)]
pub struct InvoiceItem {
    pub item_name: String,
    pub units_consumed: u32,
    pub unit_price_micro_cents: u32, // $1.00 = 100,000,000 micro-cents
}

pub struct BillingEngine {
    platform_discount_bps: u32, // basis points (100 bps = 1%)
}

impl BillingEngine {
    pub fn new(discount_bps: u32) -> Self {
        Self { platform_discount_bps: discount_bps }
    }

    pub fn calculate_line_item_total(&self, item: &InvoiceItem) -> Result<u64, &'static str> {
        if item.units_consumed == 0 {
            return Ok(0);
        }

        // Bug: u32 * u32 arithmetic wraps in release mode without checked multiplication
        let gross_micro_cents: u32 = item.units_consumed * item.unit_price_micro_cents;

        // Apply discount basis points
        let discount_amount = (gross_micro_cents as u64 * self.platform_discount_bps as u64) / 10_000;
        let net_micro_cents = (gross_micro_cents as u64).saturating_sub(discount_amount);

        Ok(net_micro_cents)
    }
}
