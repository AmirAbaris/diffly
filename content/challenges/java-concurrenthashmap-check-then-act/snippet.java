package com.acme.payments.idempotency;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class WebhookIdempotencyService {
    public record ProcessingResult(String eventId, String status, Instant processedAt) {}

    public interface DownstreamLedger {
        String settleTransfer(String eventId, long amountCents);
    }

    private final Map<String, ProcessingResult> processedEvents = new ConcurrentHashMap<>();
    private final DownstreamLedger ledger;

    public WebhookIdempotencyService(DownstreamLedger ledger) {
        this.ledger = ledger;
    }

    public ProcessingResult handleTransferWebhook(String idempotencyKey, long amountCents) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new IllegalArgumentException("idempotencyKey is required");
        }
        if (amountCents <= 0) {
            throw new IllegalArgumentException("amountCents must be positive");
        }

        if (processedEvents.containsKey(idempotencyKey)) {
            return processedEvents.get(idempotencyKey);
        }

        String settlementStatus = ledger.settleTransfer(idempotencyKey, amountCents);
        ProcessingResult result = new ProcessingResult(
                idempotencyKey,
                settlementStatus,
                Instant.now());
        processedEvents.put(idempotencyKey, result);
        return result;
    }
}
