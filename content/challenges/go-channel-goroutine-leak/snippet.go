package worker

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"
)

type Result struct {
	Source string
	Data   string
	Err    error
}

// FetchFastest queries multiple mirror endpoints and returns the first successful result.
func FetchFastest(ctx context.Context, mirrors []string) (*Result, error) {
	if len(mirrors) == 0 {
		return nil, errors.New("no mirrors provided")
	}

	// Unbuffered channel for receiving mirror query responses
	ch := make(chan Result)

	for _, mirror := range mirrors {
		go func(url string) {
			client := http.Client{Timeout: 5 * time.Second}
			resp, err := client.Get(url)
			if err != nil {
				ch <- Result{Source: url, Err: err}
				return
			}
			defer resp.Body.Close()

			ch <- Result{Source: url, Data: resp.Status, Err: nil}
		}(mirror)
	}

	// Return the very first result that arrives
	select {
	case res := <-ch:
		if res.Err != nil {
			return nil, fmt.Errorf("mirror %s failed: %w", res.Source, res.Err)
		}
		return &res, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
