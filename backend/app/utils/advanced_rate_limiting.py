"""
Advanced Rate Limiting System
Distributed, adaptive, and reputation-based rate limiting
"""

import json
import time
from typing import Dict, Optional, Tuple, List
from enum import Enum
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import asyncio
import redis.asyncio as redis
from functools import wraps
import logging
from fastapi import HTTPException

from app.utils.logging_config import StructuredLogger

logger = StructuredLogger(__name__)


# ============================================================================
# Enums & Constants
# ============================================================================

class UserTier(Enum):
    """User reputation tiers"""
    BLACKLIST = "blacklist"      # Banned from using API
    RESTRICTED = "restricted"    # 50% of normal limits
    STANDARD = "standard"        # Normal limits
    PREMIUM = "premium"          # 2x limits
    VIP = "vip"                  # 5x limits
    WHITELISTED = "whitelisted"  # Unlimited


class RateLimitStrategy(Enum):
    """Rate limiting algorithms"""
    SLIDING_WINDOW = "sliding_window"
    TOKEN_BUCKET = "token_bucket"
    LEAKY_BUCKET = "leaky_bucket"
    FIXED_WINDOW = "fixed_window"


# ============================================================================
# Data Models
# ============================================================================

@dataclass
class RateLimitConfig:
    """Configuration for rate limiting"""
    # Basic limits (requests per window)
    requests_per_minute: int = 100
    requests_per_hour: int = 5000
    requests_per_day: int = 50000
    
    # Window sizes (seconds)
    minute_window: int = 60
    hour_window: int = 3600
    day_window: int = 86400
    
    # Strategy
    strategy: str = RateLimitStrategy.SLIDING_WINDOW.value
    
    # Cost mapping (for expensive operations)
    cost_multiplier: Dict[str, float] = None
    
    # Burst allowance (temporary overage)
    burst_multiplier: float = 1.5
    
    def __post_init__(self):
        if self.cost_multiplier is None:
            self.cost_multiplier = {
                "search": 2.0,
                "export": 3.0,
                "compute": 5.0,
                "payment": 10.0
            }


@dataclass
class RateLimitStatus:
    """Current rate limit status"""
    remaining_requests: int
    limit: int
    reset_at: datetime
    retry_after: Optional[int] = None
    is_throttled: bool = False
    user_tier: str = UserTier.STANDARD.value


@dataclass
class UserReputation:
    """User reputation data"""
    user_id: str
    tier: str = UserTier.STANDARD.value
    score: float = 100.0  # 0-100
    violations: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    last_updated: float = 0.0
    
    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RateLimitMetrics:
    """Metrics for rate limiting"""
    total_requests: int = 0
    throttled_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    avg_response_time: float = 0.0
    cpu_usage: float = 0.0
    memory_usage: float = 0.0


# ============================================================================
# Redis-backed Distributed Rate Limiter
# ============================================================================

class DistributedRateLimiter:
    """
    Distributed rate limiter using Redis for multi-instance deployments
    Supports sliding window algorithm with cost-based limiting
    """
    
    def __init__(self, redis_url: str = "redis://localhost:6379/0", 
                 config: RateLimitConfig = None):
        self.redis_url = redis_url
        self.config = config or RateLimitConfig()
        self.redis_client: Optional[redis.Redis] = None
        self.logger = logger
        
    async def connect(self):
        """Connect to Redis"""
        self.redis_client = await redis.from_url(self.redis_url, decode_responses=True)
        self.logger.log_database_operation(
            operation="connect",
            collection="redis_rate_limiter",
            duration=0,
            status="success",
            rows_affected=None
        )
    
    async def disconnect(self):
        """Disconnect from Redis"""
        if self.redis_client:
            await self.redis_client.close()
    
    async def check_rate_limit(
        self,
        key: str,
        cost: float = 1.0,
        user_id: Optional[str] = None
    ) -> Tuple[bool, RateLimitStatus]:
        """
        Check if request should be allowed
        
        Args:
            key: Rate limit key (e.g., "endpoint:/api/users")
            cost: Cost of operation (1.0 = normal, 2.0 = double, etc.)
            user_id: Optional user ID for reputation-based adjustment
            
        Returns:
            Tuple of (allowed: bool, status: RateLimitStatus)
        """
        if not self.redis_client:
            await self.connect()
        
        # Get user tier for limit adjustment
        user_tier = UserTier.STANDARD
        if user_id:
            reputation = await self._get_user_reputation(user_id)
            user_tier = UserTier(reputation.tier)
        
        # Adjust limits based on user tier
        adjusted_limit = self._adjust_limit_by_tier(
            self.config.requests_per_minute, 
            user_tier
        )
        
        # Check sliding window
        current_time = time.time()
        window_start = current_time - self.config.minute_window
        
        # Key structure: "rate_limit:{key}:requests"
        requests_key = f"rate_limit:{key}:requests"
        
        # Get current requests in window (Redis sorted set with timestamps)
        current_requests = await self.redis_client.zcount(
            requests_key,
            window_start,
            current_time
        )
        
        # Calculate remaining quota (accounting for cost)
        remaining = adjusted_limit - (current_requests * cost)
        
        # Determine if request is allowed
        allowed = remaining >= 1.0
        
        if allowed:
            # Add current request to sliding window
            await self.redis_client.zadd(
                requests_key,
                {str(current_time): current_time}
            )
            
            # Set expiration for old entries
            await self.redis_client.expire(
                requests_key,
                self.config.minute_window + 1
            )
        
        # Calculate retry-after
        retry_after = None
        if not allowed:
            # Find oldest request in window
            oldest = await self.redis_client.zrange(
                requests_key, 
                0, 
                0, 
                withscores=True
            )
            if oldest:
                retry_after = int((oldest[0][1] + self.config.minute_window) - current_time)
        
        # Build status response
        status = RateLimitStatus(
            remaining_requests=max(0, int(remaining)),
            limit=int(adjusted_limit),
            reset_at=datetime.fromtimestamp(current_time + self.config.minute_window),
            retry_after=retry_after,
            is_throttled=not allowed,
            user_tier=user_tier.value
        )
        
        return allowed, status
    
    async def _get_user_reputation(self, user_id: str) -> UserReputation:
        """Fetch user reputation from Redis"""
        reputation_key = f"user_reputation:{user_id}"
        reputation_data = await self.redis_client.get(reputation_key)
        
        if reputation_data:
            data = json.loads(reputation_data)
            return UserReputation(**data)
        
        return UserReputation(user_id=user_id)
    
    async def _set_user_reputation(self, reputation: UserReputation):
        """Store user reputation in Redis"""
        reputation_key = f"user_reputation:{reputation.user_id}"
        reputation.last_updated = time.time()
        
        await self.redis_client.set(
            reputation_key,
            json.dumps(reputation.to_dict()),
            ex=86400 * 30  # 30 days expiration
        )
    
    def _adjust_limit_by_tier(self, base_limit: int, tier: UserTier) -> int:
        """Adjust rate limit based on user tier"""
        multipliers = {
            UserTier.BLACKLIST: 0,
            UserTier.RESTRICTED: 0.5,
            UserTier.STANDARD: 1.0,
            UserTier.PREMIUM: 2.0,
            UserTier.VIP: 5.0,
            UserTier.WHITELISTED: float('inf')
        }
        return int(base_limit * multipliers.get(tier, 1.0))


# ============================================================================
# Adaptive Rate Limiter (based on system load)
# ============================================================================

class AdaptiveRateLimiter:
    """
    Adjusts rate limits dynamically based on system load
    Increases limits when CPU/memory are low
    Decreases limits when system is under stress
    """
    
    def __init__(self, base_limiter: DistributedRateLimiter):
        self.base_limiter = base_limiter
        self.logger = logger
        self.metrics = RateLimitMetrics()
        
    async def check_with_adaptation(
        self,
        key: str,
        cost: float = 1.0,
        user_id: Optional[str] = None,
        cpu_threshold: float = 0.8,
        memory_threshold: float = 0.85
    ) -> Tuple[bool, RateLimitStatus]:
        """
        Check rate limit with system load adaptation
        
        Args:
            key: Rate limit key
            cost: Operation cost
            user_id: User ID for reputation
            cpu_threshold: CPU threshold for scaling (0-1)
            memory_threshold: Memory threshold for scaling (0-1)
            
        Returns:
            Tuple of (allowed: bool, status: RateLimitStatus)
        """
        # Get current system metrics
        system_load = await self._get_system_metrics()
        
        # Adjust base config based on load
        adjusted_config = self._calculate_adaptive_limits(
            system_load,
            cpu_threshold,
            memory_threshold
        )
        
        # Temporarily update config
        original_config = self.base_limiter.config
        self.base_limiter.config = adjusted_config
        
        try:
            # Check with adjusted limits
            allowed, status = await self.base_limiter.check_rate_limit(
                key, cost, user_id
            )
            
            # Log adaptation
            if system_load.cpu_usage > cpu_threshold:
                self.logger.log_endpoint_request(
                    endpoint=key,
                    status="adapted",
                    metadata={
                        "reason": "high_cpu",
                        "cpu_usage": system_load.cpu_usage,
                        "adjusted_limit": status.limit
                    }
                )
            
            return allowed, status
        finally:
            # Restore original config
            self.base_limiter.config = original_config
    
    async def _get_system_metrics(self) -> RateLimitMetrics:
        """Get current system metrics (CPU, memory, etc.)"""
        try:
            import psutil
            
            cpu_usage = psutil.cpu_percent(interval=0.1) / 100.0
            memory = psutil.virtual_memory()
            memory_usage = memory.percent / 100.0
            
            self.metrics.cpu_usage = cpu_usage
            self.metrics.memory_usage = memory_usage
            
            return self.metrics
        except ImportError:
            self.logger.log_endpoint_request(
                endpoint="get_system_metrics",
                status="warning",
                metadata={"message": "psutil not installed"}
            )
            # Return default metrics
            return RateLimitMetrics(cpu_usage=0.5, memory_usage=0.5)
    
    def _calculate_adaptive_limits(
        self,
        metrics: RateLimitMetrics,
        cpu_threshold: float,
        memory_threshold: float
    ) -> RateLimitConfig:
        """Calculate adaptive limits based on system metrics"""
        config = RateLimitConfig(**asdict(self.base_limiter.config))
        
        # Calculate stress factor (0.5 = stressed, 1.5 = idle)
        cpu_factor = 1.0 if metrics.cpu_usage < cpu_threshold else 0.5
        memory_factor = 1.0 if metrics.memory_usage < memory_threshold else 0.5
        
        # Average stress factor
        stress_factor = (cpu_factor + memory_factor) / 2
        
        # Adjust limits
        config.requests_per_minute = int(config.requests_per_minute * stress_factor)
        config.requests_per_hour = int(config.requests_per_hour * stress_factor)
        config.requests_per_day = int(config.requests_per_day * stress_factor)
        
        return config


# ============================================================================
# User Reputation Manager
# ============================================================================

class ReputationManager:
    """
    Manages user reputation scores and tier assignments
    Updates reputation based on request success/failure patterns
    """
    
    def __init__(self, rate_limiter: DistributedRateLimiter):
        self.rate_limiter = rate_limiter
        self.logger = logger
        
        # Tier transition thresholds
        self.thresholds = {
            UserTier.BLACKLIST: (0, 10),
            UserTier.RESTRICTED: (10, 40),
            UserTier.STANDARD: (40, 70),
            UserTier.PREMIUM: (70, 90),
            UserTier.VIP: (90, 100)
        }
    
    async def record_request(
        self,
        user_id: str,
        success: bool,
        violation: bool = False,
        response_time: float = 0.0
    ):
        """Record request outcome for reputation tracking"""
        reputation = await self.rate_limiter._get_user_reputation(user_id)
        
        # Update counters
        if success:
            reputation.successful_requests += 1
        else:
            reputation.failed_requests += 1
        
        if violation:
            reputation.violations += 1
        
        # Calculate reputation score
        success_rate = (
            reputation.successful_requests / 
            (reputation.successful_requests + reputation.failed_requests + 1)
        )
        
        # Score formula: base 100 - (violations * 10) + (success_rate * 50)
        base_score = 100 - (reputation.violations * 10)
        reputation.score = max(0, min(100, base_score + (success_rate * 20)))
        
        # Update tier
        reputation.tier = self._get_tier_for_score(reputation.score).value
        
        # Store updated reputation
        await self.rate_limiter._set_user_reputation(reputation)
        
        self.logger.log_endpoint_request(
            endpoint="reputation_update",
            status="success",
            metadata={
                "user_id": user_id,
                "score": reputation.score,
                "tier": reputation.tier
            }
        )
    
    def _get_tier_for_score(self, score: float) -> UserTier:
        """Get user tier based on reputation score"""
        for tier, (min_score, max_score) in self.thresholds.items():
            if min_score <= score < max_score:
                return tier
        return UserTier.STANDARD
    
    async def promote_user(self, user_id: str, tier: UserTier):
        """Manually promote user to higher tier"""
        reputation = await self.rate_limiter._get_user_reputation(user_id)
        reputation.tier = tier.value
        await self.rate_limiter._set_user_reputation(reputation)
    
    async def penalize_user(self, user_id: str, reason: str, duration: int = 3600):
        """Temporarily penalize user (reduce limits for a duration)"""
        reputation = await self.rate_limiter._get_user_reputation(user_id)
        reputation.violations += 1
        reputation.tier = UserTier.RESTRICTED.value
        await self.rate_limiter._set_user_reputation(reputation)
        
        # Schedule tier restoration
        # In production, this would be handled by a scheduled task
        self.logger.log_endpoint_request(
            endpoint="user_penalized",
            status="success",
            metadata={
                "user_id": user_id,
                "reason": reason,
                "duration": duration
            }
        )


# ============================================================================
# Cost-based Rate Limiting
# ============================================================================

class CostBasedRateLimiter:
    """
    Implements cost-based rate limiting where expensive operations
    consume more quota than cheap operations
    """
    
    def __init__(self, base_limiter: DistributedRateLimiter):
        self.base_limiter = base_limiter
        self.logger = logger
    
    def get_operation_cost(
        self,
        operation: str,
        data_volume: int = 0
    ) -> float:
        """
        Calculate cost for operation
        
        Args:
            operation: Operation type (search, export, payment, etc.)
            data_volume: Amount of data involved (for scaling cost)
            
        Returns:
            Cost multiplier (1.0 = normal, 2.0 = double, etc.)
        """
        # Base costs from config
        base_costs = self.base_limiter.config.cost_multiplier
        base_cost = base_costs.get(operation, 1.0)
        
        # Scale by data volume
        volume_multiplier = 1.0
        if data_volume > 0:
            volume_multiplier = 1.0 + (data_volume / 10000)  # Scale by 10KB increments
        
        return base_cost * volume_multiplier
    
    async def check_cost_based_limit(
        self,
        key: str,
        operation: str,
        user_id: Optional[str] = None,
        data_volume: int = 0
    ) -> Tuple[bool, RateLimitStatus]:
        """Check rate limit with cost adjustment"""
        cost = self.get_operation_cost(operation, data_volume)
        return await self.base_limiter.check_rate_limit(key, cost, user_id)


# ============================================================================
# Decorator for FastAPI endpoints
# ============================================================================

def rate_limit(
    key_func = None,
    cost: float = 1.0,
    strategy: str = "standard"
):
    """
    Decorator for rate limiting FastAPI endpoints
    
    Usage:
        @app.get("/api/search")
        @rate_limit(key_func=lambda r: f"endpoint:{r.path}:{r.client.host}")
        async def search(request: Request):
            return {"results": []}
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request from kwargs
            request = kwargs.get("request")
            if not request:
                # Find request in args
                for arg in args:
                    if hasattr(arg, "client"):
                        request = arg
                        break
            
            if not request:
                # Skip rate limiting if request not available
                return await func(*args, **kwargs)
            
            # Generate rate limit key
            if key_func:
                key = key_func(request)
            else:
                key = f"endpoint:{request.url.path}:{request.client.host}"

            state = getattr(getattr(request, "app", None), "state", None)
            limiter_bundle = getattr(state, "advanced_rate_limiters", None) if state else None
            limiter = None
            if isinstance(limiter_bundle, dict):
                limiter = limiter_bundle.get("base") or limiter_bundle.get("base_limiter")
            if limiter is None and state is not None:
                limiter = getattr(state, "advanced_rate_limiter", None)

            if limiter is not None:
                user_id = str(getattr(getattr(request, "state", None), "user_id", "") or "").strip() or None
                try:
                    allowed, limit_status = await limiter.check_rate_limit(key, cost, user_id)
                except Exception as exc:
                    logger.warning("Rate limit decorator failed open", metadata={"error": str(exc), "key": key})
                else:
                    if not allowed:
                        raise HTTPException(
                            status_code=429,
                            detail="Rate limit exceeded",
                            headers={
                                "X-RateLimit-Limit": str(limit_status.limit),
                                "X-RateLimit-Remaining": str(limit_status.remaining_requests),
                                "X-RateLimit-Reset": str(int(limit_status.reset_at.timestamp())),
                                "Retry-After": str(limit_status.retry_after or 60),
                            },
                        )

            return await func(*args, **kwargs)
        
        return wrapper
    return decorator


# ============================================================================
# Initialization Helper
# ============================================================================

async def init_advanced_rate_limiting(
    redis_url: str = "redis://localhost:6379/0"
) -> Dict:
    """Initialize advanced rate limiting system"""
    base_limiter = DistributedRateLimiter(redis_url)
    await base_limiter.connect()
    
    adaptive_limiter = AdaptiveRateLimiter(base_limiter)
    reputation_manager = ReputationManager(base_limiter)
    cost_limiter = CostBasedRateLimiter(base_limiter)

    return {
        "base": base_limiter,
        "adaptive": adaptive_limiter,
        "reputation": reputation_manager,
        "cost": cost_limiter
    }
