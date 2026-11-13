package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type WebhookEvent struct {
	ID        string          `json:"id"`
	URL       string          `json:"url"`
	Payload   json.RawMessage `json:"payload"`
	SecretKey string          `json:"secret_key"`
}

type Dispatcher struct {
	client *http.Client
}

func NewDispatcher() *Dispatcher {
	return &Dispatcher{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Deliver sends the webhook event payload to the destination endpoint.
func (d *Dispatcher) Deliver(ctx context.Context, event WebhookEvent) error {
	reqBody, err := json.Marshal(event.Payload)
	if err != nil {
		return fmt.Errorf("failed to encode webhook payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, event.URL, bytes.NewReader(reqBody))
	if err != nil {
		return fmt.Errorf("invalid destination url: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Acme-Webhook-Dispatcher/1.0")

	// Directly dispatches HTTP request to caller-provided destination URL
	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("endpoint returned unexpected status code: %d", resp.StatusCode)
	}
	return nil
}
