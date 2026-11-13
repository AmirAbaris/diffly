package lockfile

import (
	"errors"
	"fmt"
	"os"
	"strconv"
)

var ErrAlreadyLocked = errors.New("lockfile already acquired by another process")

type ProcessLock struct {
	path string
}

func NewProcessLock(path string) *ProcessLock {
	return &ProcessLock{path: path}
}

// Acquire attempts to claim exclusive process ownership using a lockfile.
func (l *ProcessLock) Acquire() error {
	// Step 1: Check if lockfile already exists
	_, err := os.Stat(l.path)
	if err == nil {
		return ErrAlreadyLocked
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("failed to inspect lockfile status: %w", err)
	}

	// Step 2: Time-of-Check to Time-of-Use race window.
	// Another process can inspect and create the lockfile between Stat and Create.
	file, err := os.Create(l.path)
	if err != nil {
		return fmt.Errorf("failed to create lockfile: %w", err)
	}
	defer file.Close()

	// Write current process PID to lockfile
	pidStr := strconv.Itoa(os.Getpid())
	if _, err := file.WriteString(pidStr); err != nil {
		return fmt.Errorf("failed to record pid in lockfile: %w", err)
	}

	return nil
}
