# Deadlock via Mutex Lock Reentrancy

## Description
A concurrent in-memory LRU cache in Go uses a `sync.Mutex` to coordinate thread-safe access to its internal map of cached items. The `Set()` method acquires the mutex lock and checks if the cache has exceeded capacity. If capacity is exceeded, it delegates eviction to `evictOldest()`.

## Threat Model
In Go, standard `sync.Mutex` locks are non-reentrant. Unlike reentrant locks in Java or Python (`threading.RLock`), a goroutine in Go cannot acquire a lock it already holds. When `Set()` holds `c.mu.Lock()` and invokes `evictOldest()`, `evictOldest()` attempts to call `c.mu.Lock()`. The calling goroutine blocks waiting for itself to release the lock, causing an immediate, fatal self-deadlock that hangs the calling thread and freezes all subsequent cache access across the application.
