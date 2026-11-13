# Next.js React Hook Async State Race Condition

## Description
A Next.js React component renders code review challenge metadata and dynamically fetches challenge details whenever the selected challenge ID changes. However, the `useEffect` hook triggers an asynchronous fetch without handling cancellation or ignoring responses from stale requests.

## Threat Model
When a user rapidly clicks between different challenges or toggles category filters, multiple asynchronous network requests are launched concurrently. If an earlier request resolves after a later request has completed, the stale response overwrites current UI state, displaying mismatched code snippets or throwing unmounted state update warnings.
