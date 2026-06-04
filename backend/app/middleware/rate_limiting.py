"""
Rate limiting middleware for FastAPI
Integrates with the rate_limiting utilities
"""
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import time
import logging
from typing import Callable, Optional
from starlette.middleware.base import BaseHTTPMiddleware
from app.utils.rate_limiting import (
    get_rate_limiter,
    get_rate_limit_key,
    get_rate_limit_rule_for_path,
    is_login_rate_limit_exempt_path,
)

logger = logging.getLogger(__name__)


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """ASGI middleware for rate limiting"""
    
    def __init__(self, app, limiter=None):
        super().__init__(app)
        self.limiter = limiter or get_rate_limiter()
        # Endpoints to exclude from rate limiting
        self.excluded_paths = {
            "/health",
            "/api/health",
            "/api/ready",
            "/metrics",
            "/api/metrics",
            "/docs",
            "/openapi.json",
            "/redoc",
            "/socket.io",
            "/ws",
        }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip rate limiting for excluded paths
        path = request.url.path
        if any(path.startswith(excluded) for excluded in self.excluded_paths) or is_login_rate_limit_exempt_path(path):
            return await call_next(request)
        
        # Get DB-backed rate limit for this endpoint.
        db = getattr(request.app.state, "db", None)
        rule = await get_rate_limit_rule_for_path(path, db)
        if rule is None:
            return await call_next(request)
        max_requests = rule.max_requests
        window_seconds = rule.window_seconds
        
        # Get rate limit key (user ID or IP address)
        key = get_rate_limit_key(request)
        
        # Check rate limit
        if not self.limiter.is_allowed(key, max_requests, window_seconds):
            retry_after = self.limiter.get_retry_after(key, window_seconds)
            
            logger.warning(
                f"Rate limit exceeded for {key} on {path}",
                extra={
                    "key": key,
                    "path": path,
                    "limit_type": rule.limit_type,
                    "source": rule.source,
                    "max_requests": max_requests,
                    "window_seconds": window_seconds
                }
            )
            
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "rate_limit_exceeded",
                        "message": "Too many requests. Please try again later.",
                        "details": {
                            "retry_after_seconds": retry_after
                        }
                    },
                    "detail": "Rate limit exceeded",
                    "status": "error"
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Window": str(window_seconds),
                    "X-RateLimit-Key": key,
                    "X-RateLimit-Source": rule.source,
                }
            )
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers to response
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Window"] = str(window_seconds)
        response.headers["X-RateLimit-Key"] = key
        response.headers["X-RateLimit-Source"] = rule.source
        
        return response
