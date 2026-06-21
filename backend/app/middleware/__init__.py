"""Rate limiting middleware for the AutoBuddy API."""

from app.middleware.rate_limiting import RateLimitingMiddleware

__all__ = ["RateLimitingMiddleware"]
