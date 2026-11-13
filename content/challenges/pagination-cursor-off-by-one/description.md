# Off-by-One Boundary Record Skip in Pagination Cursor

## Description
A social activity feed API endpoint implements cursor-based keyset pagination for high-volume activity streams. The endpoint decodes a base64 cursor representing the last seen record, queries the database, and slices the records to return the requested page size along with the next cursor.

## Threat Model
In `getFeedItems`, the database query already filters using `where: cursorFilter` (exclusive comparison), meaning the database result set starts *after* the previous page boundary. However, line 38 performs an erroneous slice `records.slice(1, limit + 1)` whenever `params.afterCursor` is supplied, discarding the very first valid item of the new page. Consequently, every page transition permanently skips an activity item, resulting in silent data omissions in client feeds and broken feed ordering.
