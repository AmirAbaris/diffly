package client

import (
	"fmt"
	"net/http"
)

type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("api error [%d]: %s", e.StatusCode, e.Message)
}

// ValidateEndpoint checks service availability. Returns an error if unreachable.
func ValidateEndpoint(url string) error {
	var apiErr *APIError

	resp, err := http.Get(url)
	if err != nil {
		apiErr = &APIError{StatusCode: http.StatusBadGateway, Message: err.Error()}
		return apiErr
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		apiErr = &APIError{StatusCode: resp.StatusCode, Message: "service returned error response"}
		return apiErr
	}

	return apiErr
}

func RunHealthCheck(url string) string {
	err := ValidateEndpoint(url)
	if err != nil {
		return fmt.Sprintf("Health check failed: %v", err)
	}
	return "Health check passed: service is online"
}
