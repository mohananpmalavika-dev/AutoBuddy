"""
Performance Optimization Suite
Query optimization, caching, and response compression
"""

import asyncio
import time
from typing import Optional, Dict, Any, Callable, List
from functools import wraps
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
import hashlib
import json

from app.utils.logging_config import StructuredLogger

logger = StructuredLogger(__name__)


class QueryCache:
    """In-memory query result cache with TTL"""
    
    def __init__(self, default_ttl: int = 300):
        self.cache: Dict[str, Dict] = {}
        self.default_ttl = default_ttl
    
    def _generate_key(self, query: str, params: Dict = None) -> str:
        """Generate cache key from query and parameters"""
        key_data = f"{query}:{json.dumps(params or {}, sort_keys=True)}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    def get(self, query: str, params: Dict = None) -> Optional[Any]:
        """Get cached result"""
        key = self._generate_key(query, params)
        
        if key not in self.cache:
            return None
        
        entry = self.cache[key]
        
        # Check if expired
        if get_ist_now() > entry['expires_at']:
            del self.cache[key]
            return None
        
        entry['hits'] += 1
        logger.log_endpoint_request(
            endpoint="cache_hit",
            status="success",
            metadata={"key": key, "hits": entry['hits']}
        )
        
        return entry['data']
    
    def set(self, query: str, result: Any, params: Dict = None, ttl: int = None):
        """Cache query result"""
        key = self._generate_key(query, params)
        ttl = ttl or self.default_ttl
        
        self.cache[key] = {
            'data': result,
            'expires_at': get_ist_now() + timedelta(seconds=ttl),
            'created_at': get_ist_now(),
            'hits': 0
        }
        
        logger.log_endpoint_request(
            endpoint="cache_set",
            status="success",
            metadata={"key": key, "ttl": ttl}
        )
    
    def invalidate(self, query_pattern: str = None):
        """Invalidate cache entries"""
        if query_pattern is None:
            self.cache.clear()
            logger.log_endpoint_request(
                endpoint="cache_cleared",
                status="success",
                metadata={"entries": 0}
            )
            return
        
        # Invalidate matching patterns
        keys_to_remove = [k for k in self.cache.keys() if query_pattern in k]
        for k in keys_to_remove:
            del self.cache[k]
        
        logger.log_endpoint_request(
            endpoint="cache_invalidated",
            status="success",
            metadata={"pattern": query_pattern, "entries": len(keys_to_remove)}
        )
    
    def get_stats(self) -> Dict:
        """Get cache statistics"""
        total_entries = len(self.cache)
        total_hits = sum(e['hits'] for e in self.cache.values())
        total_size = sum(
            len(json.dumps(e['data']).encode())
            for e in self.cache.values()
        )
        
        return {
            "entries": total_entries,
            "total_hits": total_hits,
            "size_bytes": total_size,
            "size_mb": total_size / (1024 * 1024)
        }


class LazyLoader:
    """Lazy load data to reduce initial load time"""
    
    @staticmethod
    async def load_paginated(
        query_func: Callable,
        page_size: int = 20,
        max_pages: int = 10
    ) -> List[Any]:
        """
        Load data with pagination lazily
        
        Usage:
            results = await LazyLoader.load_paginated(
                query_func=lambda page: db.query(...).offset((page-1)*20).limit(20),
                page_size=20
            )
        """
        all_results = []
        
        for page in range(1, max_pages + 1):
            try:
                results = await query_func(page)
                
                if not results:
                    break
                
                all_results.extend(results)
                
                if len(results) < page_size:
                    break
                
            except Exception as e:
                logger.log_endpoint_request(
                    endpoint="lazy_load",
                    status="error",
                    metadata={"error": str(e), "page": page}
                )
                break
        
        return all_results
    
    @staticmethod
    async def load_with_timeout(
        query_func: Callable,
        timeout: float = 5.0
    ) -> Optional[Any]:
        """Load data with timeout"""
        try:
            return await asyncio.wait_for(query_func(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.log_endpoint_request(
                endpoint="lazy_load_timeout",
                status="timeout",
                metadata={"timeout": timeout}
            )
            return None


class QueryOptimizer:
    """Optimize database queries"""
    
    @staticmethod
    def analyze_query_performance(query_time: float, threshold: float = 1.0) -> Dict:
        """Analyze query performance"""
        status = "slow" if query_time > threshold else "normal"
        
        return {
            "query_time_ms": query_time * 1000,
            "status": status,
            "threshold_ms": threshold * 1000,
            "optimization_needed": query_time > threshold
        }
    
    @staticmethod
    def get_optimization_hints(query_time: float) -> List[str]:
        """Get optimization hints for slow queries"""
        hints = []
        
        if query_time > 5.0:
            hints.append("Consider adding database indexes")
            hints.append("Check for missing WHERE clauses")
        
        if query_time > 2.0:
            hints.append("Consider pagination or limiting result set")
            hints.append("Check for N+1 queries")
        
        if query_time > 1.0:
            hints.append("Consider caching frequently accessed data")
            hints.append("Review query execution plan")
        
        return hints


class ResponseCompression:
    """Compress API responses"""
    
    @staticmethod
    def should_compress(data: Any, size_threshold: int = 1024) -> bool:
        """Determine if response should be compressed"""
        try:
            size = len(json.dumps(data).encode())
            return size > size_threshold
        except:
            return False
    
    @staticmethod
    def get_compression_ratio(original_size: int, compressed_size: int) -> float:
        """Calculate compression ratio"""
        if original_size == 0:
            return 0.0
        return (1 - compressed_size / original_size) * 100


class ConnectionPoolManager:
    """Manage database connection pooling"""
    
    def __init__(self, pool_size: int = 20, max_overflow: int = 10):
        self.pool_size = pool_size
        self.max_overflow = max_overflow
        self.active_connections = 0
        self.peak_connections = 0
    
    def get_connection(self):
        """Get connection from pool"""
        self.active_connections += 1
        if self.active_connections > self.peak_connections:
            self.peak_connections = self.active_connections
        
        logger.log_endpoint_request(
            endpoint="pool_get",
            status="success",
            metadata={
                "active": self.active_connections,
                "pool_size": self.pool_size
            }
        )
    
    def release_connection(self):
        """Release connection back to pool"""
        self.active_connections = max(0, self.active_connections - 1)
        
        logger.log_endpoint_request(
            endpoint="pool_release",
            status="success",
            metadata={"active": self.active_connections}
        )
    
    def get_stats(self) -> Dict:
        """Get connection pool statistics"""
        utilization = (self.active_connections / self.pool_size) * 100
        
        return {
            "pool_size": self.pool_size,
            "active_connections": self.active_connections,
            "peak_connections": self.peak_connections,
            "utilization_percent": utilization,
            "available": self.pool_size - self.active_connections
        }


class PerformanceMonitor:
    """Monitor and log performance metrics"""
    
    def __init__(self):
        self.operation_times: Dict[str, List[float]] = {}
    
    def record_operation(self, operation_name: str, duration: float):
        """Record operation duration"""
        if operation_name not in self.operation_times:
            self.operation_times[operation_name] = []
        
        self.operation_times[operation_name].append(duration)
        
        # Keep only last 1000 entries
        if len(self.operation_times[operation_name]) > 1000:
            self.operation_times[operation_name] = self.operation_times[operation_name][-1000:]
    
    def get_stats(self, operation_name: str) -> Dict:
        """Get statistics for operation"""
        if operation_name not in self.operation_times:
            return {}
        
        times = self.operation_times[operation_name]
        
        if not times:
            return {}
        
        sorted_times = sorted(times)
        
        return {
            "operation": operation_name,
            "count": len(times),
            "min_ms": min(times) * 1000,
            "max_ms": max(times) * 1000,
            "mean_ms": (sum(times) / len(times)) * 1000,
            "median_ms": sorted_times[len(sorted_times) // 2] * 1000,
            "p95_ms": sorted_times[int(len(sorted_times) * 0.95)] * 1000,
            "p99_ms": sorted_times[int(len(sorted_times) * 0.99)] * 1000
        }


def cache_result(ttl: int = 300, cache_instance: QueryCache = None):
    """Decorator to cache function results"""
    def decorator(func):
        cache = cache_instance or QueryCache(default_ttl=ttl)
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Generate cache key
            key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Check cache
            cached = cache.get(key)
            if cached is not None:
                return cached
            
            # Call function
            start = time.time()
            result = await func(*args, **kwargs)
            duration = time.time() - start
            
            # Log performance
            logger.log_endpoint_request(
                endpoint=func.__name__,
                status="success",
                metadata={"duration_ms": duration * 1000}
            )
            
            # Cache result
            cache.set(key, result, ttl=ttl)
            
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Generate cache key
            key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            # Check cache
            cached = cache.get(key)
            if cached is not None:
                return cached
            
            # Call function
            start = time.time()
            result = func(*args, **kwargs)
            duration = time.time() - start
            
            # Log performance
            logger.log_endpoint_request(
                endpoint=func.__name__,
                status="success",
                metadata={"duration_ms": duration * 1000}
            )
            
            # Cache result
            cache.set(key, result, ttl=ttl)
            
            return result
        
        # Return appropriate wrapper
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def track_performance(func):
    """Decorator to track function performance"""
    @wraps(func)
    async def async_wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = await func(*args, **kwargs)
            return result
        finally:
            duration = time.time() - start
            logger.log_endpoint_request(
                endpoint=func.__name__,
                status="success",
                metadata={"duration_ms": duration * 1000}
            )
    
    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = func(*args, **kwargs)
            return result
        finally:
            duration = time.time() - start
            logger.log_endpoint_request(
                endpoint=func.__name__,
                status="success",
                metadata={"duration_ms": duration * 1000}
            )
    
    if asyncio.iscoroutinefunction(func):
        return async_wrapper
    else:
        return sync_wrapper


# Singleton instances
_query_cache = None
_performance_monitor = None


def get_query_cache() -> QueryCache:
    """Get or create query cache"""
    global _query_cache
    if _query_cache is None:
        _query_cache = QueryCache()
    return _query_cache


def get_performance_monitor() -> PerformanceMonitor:
    """Get or create performance monitor"""
    global _performance_monitor
    if _performance_monitor is None:
        _performance_monitor = PerformanceMonitor()
    return _performance_monitor
