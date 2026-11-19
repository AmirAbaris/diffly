"""In-memory sliding-window IP rate limiter and FastAPI dependency factory."""

import ipaddress
import math
import threading
import time
from collections import OrderedDict, deque
from collections.abc import Awaitable, Callable
from functools import lru_cache
from ipaddress import IPv4Address, IPv4Network, IPv6Address, IPv6Network

from fastapi import HTTPException, Request, status

from backend.core.config import settings


_DEFAULT_MAX_BUCKETS = 10_000
_MAX_IP_LITERAL_LEN = 64
_MAX_XFF_HEADER_LEN = 4096

_IPAddress = IPv4Address | IPv6Address
_IPNetwork = IPv4Network | IPv6Network


class _SlidingWindowRateLimiter:
    """Thread-safe bounded LRU sliding-window counter keyed by (scope, client_ip)."""

    def __init__(self, max_buckets: int = _DEFAULT_MAX_BUCKETS) -> None:
        if max_buckets <= 0:
            raise ValueError("max_buckets must be positive")
        self._max_buckets = max_buckets
        self._lock = threading.Lock()
        self._buckets: OrderedDict[tuple[str, str], deque[float]] = OrderedDict()

    def check_and_record(
        self,
        *,
        scope: str,
        client_ip: str,
        max_requests: int,
        window_seconds: int,
    ) -> int | None:
        """Record a request or return Retry-After seconds when limit is exceeded."""
        now = time.monotonic()
        cutoff = now - window_seconds
        key = (scope, client_ip)
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is not None:
                while bucket and bucket[0] <= cutoff:
                    bucket.popleft()
                if not bucket:
                    del self._buckets[key]
                    bucket = None

            if bucket is not None and len(bucket) >= max_requests:
                self._buckets.move_to_end(key)
                return max(1, math.ceil(bucket[0] + window_seconds - now))

            if bucket is None:
                while len(self._buckets) >= self._max_buckets:
                    self._buckets.popitem(last=False)
                bucket = deque()
                self._buckets[key] = bucket
            else:
                self._buckets.move_to_end(key)

            bucket.append(now)
            return None

    def reset(self) -> None:
        """Clear all recorded request timestamps."""
        with self._lock:
            self._buckets.clear()


_limiter = _SlidingWindowRateLimiter()


def _parse_ip(raw: str) -> _IPAddress | None:
    candidate = raw.strip()
    if not candidate or len(candidate) > _MAX_IP_LITERAL_LEN:
        return None
    try:
        ip = ipaddress.ip_address(candidate)
    except ValueError:
        return None
    if isinstance(ip, IPv6Address) and ip.ipv4_mapped is not None:
        return ip.ipv4_mapped
    return ip


@lru_cache(maxsize=32)
def _compile_trusted_networks(cidrs: tuple[str, ...]) -> tuple[_IPNetwork, ...]:
    networks: list[_IPNetwork] = []
    for cidr in cidrs:
        try:
            networks.append(ipaddress.ip_network(cidr, strict=False))
        except ValueError:
            continue
    return tuple(networks)


def _is_trusted_proxy(
    ip: _IPAddress,
    trusted_networks: tuple[_IPNetwork, ...],
) -> bool:
    return any(ip.version == net.version and ip in net for net in trusted_networks)


def extract_client_ip(request: Request) -> str:
    """Resolve client IP from trusted-proxy X-Forwarded-For or validated peer host."""
    peer_host = request.client.host if request.client and request.client.host else ""
    peer_ip = _parse_ip(peer_host)
    if peer_ip is None:
        return "unknown"

    trusted_networks = _compile_trusted_networks(tuple(settings.TRUSTED_PROXY_CIDRS))
    if not trusted_networks or not _is_trusted_proxy(peer_ip, trusted_networks):
        return str(peer_ip)

    xff_values = request.headers.getlist("X-Forwarded-For")
    forwarded_for = ",".join(xff_values) if xff_values else ""
    if forwarded_for and len(forwarded_for) <= _MAX_XFF_HEADER_LEN:
        for raw_hop in reversed(forwarded_for.split(",")):
            hop_ip = _parse_ip(raw_hop)
            if hop_ip is None:
                break
            if not _is_trusted_proxy(hop_ip, trusted_networks):
                return str(hop_ip)

    return str(peer_ip)


def rate_limit(
    scope: str,
    max_requests: int,
    window_seconds: int,
) -> Callable[[Request], Awaitable[None]]:
    """Create a FastAPI dependency enforcing a sliding-window IP rate limit."""
    if max_requests <= 0 or window_seconds <= 0:
        raise ValueError("max_requests and window_seconds must be positive")

    async def _rate_limit_dependency(request: Request) -> None:
        client_ip = extract_client_ip(request)
        retry_after = _limiter.check_and_record(
            scope=scope,
            client_ip=client_ip,
            max_requests=max_requests,
            window_seconds=window_seconds,
        )
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests",
                headers={"Retry-After": str(retry_after)},
            )

    return _rate_limit_dependency


def reset_rate_limiter() -> None:
    """Reset in-memory rate-limit counters for test isolation."""
    _limiter.reset()
