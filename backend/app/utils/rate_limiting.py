"""
Rate limiting utilities for production
"""
import time
import asyncio
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta
import hashlib
import logging

logger = logging.getLogger(__name__)


class SimpleInMemoryRateLimiter:
    """
    In-memory rate limiter for single-instance deployments
    For distributed deployments, use Redis-based rate limiter
    """
    
    def __init__(self):
        self.requests: Dict[str, list] = {}  # key -> list of timestamps
        self.cleanup_interval = 60  # seconds
    
    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """
        Check if request is allowed under rate limit
        
        Args:
            key: Rate limit key (e.g., user_id, IP address)
            max_requests: Maximum requests allowed
            window_seconds: Time window in seconds
        
        Returns:
            True if request is allowed, False if rate limited
        """
        now = time.time()
        
        if key not in self.requests:
            self.requests[key] = []
        
        # Remove old requests outside window
        cutoff = now - window_seconds
        self.requests[key] = [ts for ts in self.requests[key] if ts > cutoff]
        
        # Check if under limit
        if len(self.requests[key]) < max_requests:
            self.requests[key].append(now)
            return True
        
        return False
    
    def get_retry_after(self, key: str, window_seconds: int) -> int:
        """Get seconds until next request is allowed"""
        if key not in self.requests or not self.requests[key]:
            return 0
        
        oldest_request = min(self.requests[key])
        retry_after = int((oldest_request + window_seconds - time.time()) + 1)
        return max(0, retry_after)
    
    def cleanup(self):
        """Remove old entries to prevent memory leak"""
        now = time.time()
        keys_to_remove = []
        
        for key, timestamps in self.requests.items():
            # Keep only recent requests (last hour)
            self.requests[key] = [ts for ts in timestamps if now - ts < 3600]
            if not self.requests[key]:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self.requests[key]


class RedisRateLimiter:
    """
    Redis-based rate limiter for distributed deployments
    Requires redis.asyncio
    """
    
    def __init__(self, redis_client):
        self.redis = redis_client
        self.prefix = "ratelimit:"
    
    async def is_allowed(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> bool:
        """Check if request is allowed under rate limit"""
        try:
            redis_key = f"{self.prefix}{key}"
            
            # Increment counter
            current = await self.redis.incr(redis_key)
            
            # Set expiration on first request
            if current == 1:
                await self.redis.expire(redis_key, window_seconds)
            
            return current <= max_requests
        except Exception as e:
            logger.error(f"Rate limiter error: {str(e)}")
            # Allow request if rate limiter fails
            return True
    
    async def get_retry_after(self, key: str) -> int:
        """Get seconds until next request is allowed"""
        try:
            redis_key = f"{self.prefix}{key}"
            ttl = await self.redis.ttl(redis_key)
            return max(0, ttl)
        except Exception:
            return 0


class RateLimitConfig:
    """Rate limiting configuration"""
    
    # Endpoints that require strict rate limiting
    STRICT_LIMIT = 5  # requests per minute
    STRICT_ENDPOINTS = {
        "/api/auth/login",
        "/api/auth/register",
        "/api/payments/process",
        "/api/admin/audit-log",
    }
    
    # Endpoints with moderate rate limiting
    MODERATE_LIMIT = 30  # requests per minute
    MODERATE_ENDPOINTS = {
        "/api/bookings",
        "/api/support/tickets",
    }
    
    # Most endpoints
    NORMAL_LIMIT = 100  # requests per minute
    
    # Per-user limits
    AUTHENTICATED_LIMIT = 500  # requests per hour
    ANONYMOUS_LIMIT = 50  # requests per hour


def get_rate_limit_key(request) -> str:
    """
    Generate rate limit key based on request
    Prefers authenticated user ID, falls back to IP address
    """
    # Try to get user ID from JWT token
    if hasattr(request, "user") and hasattr(request.user, "id"):
        return f"user:{request.user.id}"
    
    # Fall back to IP address
    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"


def get_rate_limits(endpoint: str) -> Tuple[int, int]:
    """
    Get rate limit (max_requests, window_seconds) for endpoint
    
    Returns:
        (max_requests, window_seconds)
    """
    if endpoint in RateLimitConfig.STRICT_ENDPOINTS:
        return (RateLimitConfig.STRICT_LIMIT, 60)
    
    if endpoint in RateLimitConfig.MODERATE_ENDPOINTS:
        return (RateLimitConfig.MODERATE_LIMIT, 60)
    
    return (RateLimitConfig.NORMAL_LIMIT, 60)


# Global rate limiter instance
_rate_limiter: Optional[SimpleInMemoryRateLimiter] = None


def get_rate_limiter() -> SimpleInMemoryRateLimiter:
    """Get or create rate limiter instance"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = SimpleInMemoryRateLimiter()
    return _rate_limiter


async def apply_rate_limit(request, limiter) -> Tuple[bool, Optional[int]]:
    """
    Apply rate limiting to request
    
    Returns:
        (is_allowed: bool, retry_after_seconds: Optional[int])
    """
    key = get_rate_limit_key(request)
    max_requests, window_seconds = get_rate_limits(request.url.path)
    
    if limiter.is_allowed(key, max_requests, window_seconds):
        return (True, None)
    
    retry_after = limiter.get_retry_after(key, window_seconds)
    return (False, retry_after)
