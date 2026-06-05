"""
Advanced Rate Limiting Middleware
Integrates advanced rate limiting into FastAPI application
"""

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from typing import Callable, Optional
import time

from app.utils.advanced_rate_limiting import (
    DistributedRateLimiter,
    AdaptiveRateLimiter,
    ReputationManager,
    CostBasedRateLimiter,
    RateLimitConfig
)
from app.utils.logging_config import StructuredLogger
from app.utils.api_responses import StandardResponse

logger = StructuredLogger(__name__)


class AdvancedRateLimitingMiddleware(BaseHTTPMiddleware):
    """
    Advanced rate limiting middleware for FastAPI
    Supports:
    - Distributed rate limiting (Redis-backed)
    - Adaptive limits based on system load
    - User reputation and tier-based limits
    - Cost-based operation pricing
    """
    
    def __init__(
        self,
        app,
        rate_limiter: DistributedRateLimiter,
        adaptive_limiter: AdaptiveRateLimiter,
        reputation_manager: ReputationManager,
        cost_limiter: CostBasedRateLimiter,
        config: RateLimitConfig = None,
        excluded_paths: list = None,
        enable_adaptation: bool = True,
        enable_reputation: bool = True,
        enable_cost_pricing: bool = True
    ):
        super().__init__(app)
        self.rate_limiter = rate_limiter
        self.adaptive_limiter = adaptive_limiter
        self.reputation_manager = reputation_manager
        self.cost_limiter = cost_limiter
        self.config = config or RateLimitConfig()
        self.excluded_paths = excluded_paths or [
            "/health",
            "/metrics",
            "/docs",
            "/openapi.json",
            "/redoc",
            "/socket.io",
            "/ws"
        ]
        self.enable_adaptation = enable_adaptation
        self.enable_reputation = enable_reputation
        self.enable_cost_pricing = enable_cost_pricing
    
    async def dispatch(self, request: Request, call_next: Callable):
        """Process request through rate limiting"""
        # Skip rate limiting for excluded paths
        if self._should_skip_rate_limit(request):
            return await call_next(request)
        
        # Get user ID and operation details
        user_id = self._extract_user_id(request)
        operation = self._classify_operation(request)
        
        # Generate rate limit key
        key = self._generate_rate_limit_key(request, user_id)
        
        # Get operation cost
        cost = 1.0
        if self.enable_cost_pricing:
            content_length = request.headers.get("content-length", 0)
            try:
                content_length = int(content_length)
            except ValueError:
                content_length = 0
            
            cost = self.cost_limiter.get_operation_cost(operation, content_length)
        
        # Check rate limit (with adaptation if enabled)
        if self.enable_adaptation:
            allowed, status = await self.adaptive_limiter.check_with_adaptation(
                key, cost, user_id
            )
        else:
            allowed, status = await self.rate_limiter.check_rate_limit(
                key, cost, user_id
            )
        
        # Increment request counter
        start_time = time.time()
        
        if allowed:
            # Process request
            response = await call_next(request)
            response_time = time.time() - start_time
            
            # Update reputation (if enabled)
            if self.enable_reputation and user_id:
                success = response.status_code < 400
                await self.reputation_manager.record_request(
                    user_id,
                    success=success,
                    violation=False,
                    response_time=response_time
                )
            
            # Add rate limit headers
            response.headers["X-RateLimit-Limit"] = str(status.limit)
            response.headers["X-RateLimit-Remaining"] = str(status.remaining_requests)
            response.headers["X-RateLimit-Reset"] = str(int(status.reset_at.timestamp()))
            response.headers["X-RateLimit-Tier"] = status.user_tier
            
            logger.log_endpoint_request(
                endpoint=request.url.path,
                status="success",
                metadata={
                    "user_id": user_id,
                    "user_tier": status.user_tier,
                    "operation": operation,
                    "cost": cost,
                    "response_time": response_time,
                    "remaining": status.remaining_requests
                }
            )
            
            return response
        else:
            # Request throttled
            response_time = time.time() - start_time
            
            # Record violation (if enabled)
            if self.enable_reputation and user_id:
                await self.reputation_manager.record_request(
                    user_id,
                    success=False,
                    violation=True,
                    response_time=response_time
                )
            
            logger.log_endpoint_request(
                endpoint=request.url.path,
                status="throttled",
                metadata={
                    "user_id": user_id,
                    "user_tier": status.user_tier,
                    "operation": operation,
                    "cost": cost,
                    "limit": status.limit,
                    "retry_after": status.retry_after
                }
            )
            
            # Return 429 Too Many Requests
            error_response = StandardResponse.rate_limited(
                message=f"Rate limit exceeded. Remaining: {status.remaining_requests}/{status.limit}",
                retry_after=status.retry_after
            )
            
            return JSONResponse(
                status_code=429,
                content=error_response,
                headers={
                    "X-RateLimit-Limit": str(status.limit),
                    "X-RateLimit-Remaining": str(status.remaining_requests),
                    "X-RateLimit-Reset": str(int(status.reset_at.timestamp())),
                    "X-RateLimit-Tier": status.user_tier,
                    "Retry-After": str(status.retry_after or 60)
                }
            )
    
    def _should_skip_rate_limit(self, request: Request) -> bool:
        """Check if request should skip rate limiting"""
        path = request.url.path
        
        # Check excluded paths
        for excluded in self.excluded_paths:
            if path.startswith(excluded):
                return True
        
        # Skip WebSocket upgrades
        if request.headers.get("upgrade", "").lower() == "websocket":
            return True
        
        return False
    
    def _extract_user_id(self, request: Request) -> Optional[str]:
        """Extract user ID from request (from JWT token or session)"""
        # Try to get from authorization header
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            # In production, decode JWT token here
            # For now, return a placeholder
            token = auth_header[7:]
            # TODO: Decode JWT and extract user_id
            return None
        
        # Try to get from cookies (session)
        session_id = request.cookies.get("session_id")
        if session_id:
            # TODO: Lookup session and get user_id
            return None
        
        return None
    
    def _classify_operation(self, request: Request) -> str:
        """Classify operation type for cost pricing"""
        path = request.url.path
        method = request.method
        
        # Map paths to operation types
        if "/search" in path or "/query" in path:
            return "search"
        elif "/export" in path:
            return "export"
        elif "/payments" in path or "/refund" in path:
            return "payment"
        elif method in ["POST", "PUT", "DELETE"]:
            return "compute"
        else:
            return "read"
    
    def _generate_rate_limit_key(
        self,
        request: Request,
        user_id: Optional[str] = None
    ) -> str:
        """Generate rate limit key for request"""
        if user_id:
            # Per-user rate limiting
            return f"user:{user_id}"
        else:
            # Per-IP rate limiting
            client_ip = (
                request.headers.get("x-forwarded-for", "").split(",")[0].strip() or
                request.client.host if request.client else "unknown"
            )
            return f"ip:{client_ip}"


# ============================================================================
# Initialization Helper
# ============================================================================

async def setup_advanced_rate_limiting(
    app,
    redis_url: str = "redis://localhost:6379/0",
    config: RateLimitConfig = None,
    excluded_paths: list = None,
    enable_adaptation: bool = True,
    enable_reputation: bool = True,
    enable_cost_pricing: bool = True
):
    """
    Setup advanced rate limiting for FastAPI app
    
    Usage in main.py:
        from app.middleware.advanced_rate_limiting import setup_advanced_rate_limiting
        
        app = FastAPI()
        
        @app.on_event("startup")
        async def startup():
            await setup_advanced_rate_limiting(app, redis_url="redis://localhost")
    """
    # Initialize rate limiters
    base_limiter = DistributedRateLimiter(redis_url, config or RateLimitConfig())
    await base_limiter.connect()
    
    adaptive_limiter = AdaptiveRateLimiter(base_limiter)
    reputation_manager = ReputationManager(base_limiter)
    cost_limiter = CostBasedRateLimiter(base_limiter)
    
    # Add middleware
    app.add_middleware(
        AdvancedRateLimitingMiddleware,
        rate_limiter=base_limiter,
        adaptive_limiter=adaptive_limiter,
        reputation_manager=reputation_manager,
        cost_limiter=cost_limiter,
        config=config or RateLimitConfig(),
        excluded_paths=excluded_paths,
        enable_adaptation=enable_adaptation,
        enable_reputation=enable_reputation,
        enable_cost_pricing=enable_cost_pricing
    )
    
    logger.log_endpoint_request(
        endpoint="rate_limiting_setup",
        status="success",
        metadata={
            "redis_url": redis_url,
            "adaptation_enabled": enable_adaptation,
            "reputation_enabled": enable_reputation,
            "cost_pricing_enabled": enable_cost_pricing
        }
    )
    
    return {
        "base_limiter": base_limiter,
        "adaptive_limiter": adaptive_limiter,
        "reputation_manager": reputation_manager,
        "cost_limiter": cost_limiter
    }
