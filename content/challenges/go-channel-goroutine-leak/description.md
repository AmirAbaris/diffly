# Goroutine Leak in Unbuffered Channel Consumer

## Description
A high-performance Go networking utility implements `FetchFastest` to query multiple geographical mirrors concurrently and return the response from whichever server responds first. Goroutines are spawned per mirror to send `Result` objects back through a channel.

## Threat Model
The channel is instantiated unbuffered (`ch := make(chan Result)`). Because `FetchFastest` exits immediately upon receiving the single first response or when `ctx.Done()` triggers, no goroutine will ever read from `ch` again. The remaining `N - 1` goroutines will block indefinitely attempting to send `ch <- Result{...}`, preventing garbage collection of the goroutines, TCP socket connections, and allocated buffers. Under sustained production load, this leaks thousands of goroutines, causing Out Of Memory (OOM) crashes.
