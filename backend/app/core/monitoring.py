"""
Monitoring and Metrics Collection
Provides Prometheus metrics and health check endpoints
"""

import time
import os
import psutil
from typing import Dict, Any, Optional
from datetime import datetime
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

# Metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint']
)

active_users = Gauge(
    'active_users_total',
    'Number of active users'
)

active_rides = Gauge(
    'active_rides_total',
    'Number of active rides'
)

available_drivers = Gauge(
    'available_drivers_total',
    'Number of available drivers'
)

database_operations_total = Counter(
    'database_operations_total',
    'Total database operations',
    ['operation', 'collection', 'status']
)

database_operation_duration_seconds = Histogram(
    'database_operation_duration_seconds',
    'Database operation duration in seconds',
    ['operation', 'collection']
)

external_api_calls_total = Counter(
    'external_api_calls_total',
    'Total external API calls',
    ['service', 'status']
)

external_api_duration_seconds = Histogram(
    'external_api_duration_seconds',
    'External API call duration in seconds',
    ['service']
)

payment_transactions_total = Counter(
    'payment_transactions_total',
    'Total payment transactions',
    ['method', 'status']
)

rides_by_status = Gauge(
    'rides_by_status',
    'Number of rides by status',
    ['status']
)

# System metrics
cpu_usage_percent = Gauge(
    'system_cpu_usage_percent',
    'CPU usage percentage'
)

memory_usage_percent = Gauge(
    'system_memory_usage_percent',
    'Memory usage percentage'
)

disk_usage_percent = Gauge(
    'system_disk_usage_percent',
    'Disk usage percentage'
)


class MetricsCollector:
    """Collect and expose application metrics"""
    
    @staticmethod
    def record_http_request(method: str, endpoint: str, status: int, duration: float) -> None:
        """Record HTTP request metrics"""
        http_requests_total.labels(method=method, endpoint=endpoint, status=status).inc()
        http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
    
    @staticmethod
    def record_database_operation(operation: str, collection: str, status: str, duration: float) -> None:
        """Record database operation metrics"""
        database_operations_total.labels(operation=operation, collection=collection, status=status).inc()
        database_operation_duration_seconds.labels(operation=operation, collection=collection).observe(duration)
    
    @staticmethod
    def record_external_api_call(service: str, status: str, duration: float) -> None:
        """Record external API call metrics"""
        external_api_calls_total.labels(service=service, status=status).inc()
        external_api_duration_seconds.labels(service=service).observe(duration)
    
    @staticmethod
    def record_payment_transaction(method: str, status: str) -> None:
        """Record payment transaction"""
        payment_transactions_total.labels(method=method, status=status).inc()
    
    @staticmethod
    def update_active_users(count: int) -> None:
        """Update active users gauge"""
        active_users.set(count)
    
    @staticmethod
    def update_active_rides(count: int) -> None:
        """Update active rides gauge"""
        active_rides.set(count)
    
    @staticmethod
    def update_available_drivers(count: int) -> None:
        """Update available drivers gauge"""
        available_drivers.set(count)
    
    @staticmethod
    def update_rides_by_status(status_counts: Dict[str, int]) -> None:
        """Update rides by status gauges"""
        for status, count in status_counts.items():
            rides_by_status.labels(status=status).set(count)
    
    @staticmethod
    def update_system_metrics() -> None:
        """Update system resource metrics"""
        cpu_usage_percent.set(psutil.cpu_percent(interval=1))
        memory_usage_percent.set(psutil.virtual_memory().percent)
        disk_usage_percent.set(psutil.disk_usage('/').percent)
    
    @staticmethod
    def get_metrics() -> Response:
        """Get Prometheus metrics"""
        return Response(
            content=generate_latest(),
            media_type=CONTENT_TYPE_LATEST
        )


class HealthChecker:
    """Health check utilities"""
    
    def __init__(self, mongo_client=None, postgres_engine=None, redis_client=None):
        self.mongo_client = mongo_client
        self.postgres_engine = postgres_engine
        self.redis_client = redis_client
        self.start_time = datetime.utcnow()
    
    async def check_mongodb(self) -> Dict[str, Any]:
        """Check MongoDB connection"""
        if not self.mongo_client:
            return {'status': 'unknown', 'message': 'MongoDB client not configured'}
        
        try:
            # Ping the database
            await self.mongo_client.admin.command('ping')
            return {'status': 'healthy', 'response_time_ms': 0}  # Add timing if needed
        except Exception as e:
            return {'status': 'unhealthy', 'error': str(e)}
    
    async def check_postgresql(self) -> Dict[str, Any]:
        """Check PostgreSQL connection"""
        if not self.postgres_engine:
            return {'status': 'unknown', 'message': 'PostgreSQL engine not configured'}
        
        try:
            # Test connection
            from sqlalchemy import text
            async with self.postgres_engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            return {'status': 'healthy', 'response_time_ms': 0}
        except Exception as e:
            return {'status': 'unhealthy', 'error': str(e)}
    
    async def check_redis(self) -> Dict[str, Any]:
        """Check Redis connection"""
        if not self.redis_client:
            return {'status': 'unknown', 'message': 'Redis client not configured'}
        
        try:
            # Ping Redis
            await self.redis_client.ping()
            return {'status': 'healthy', 'response_time_ms': 0}
        except Exception as e:
            return {'status': 'unhealthy', 'error': str(e)}
    
    async def check_disk_space(self) -> Dict[str, Any]:
        """Check disk space"""
        try:
            disk = psutil.disk_usage('/')
            percent_used = disk.percent
            
            if percent_used > 90:
                status = 'critical'
            elif percent_used > 80:
                status = 'warning'
            else:
                status = 'healthy'
            
            return {
                'status': status,
                'percent_used': percent_used,
                'free_gb': disk.free / (1024**3),
                'total_gb': disk.total / (1024**3)
            }
        except Exception as e:
            return {'status': 'unknown', 'error': str(e)}
    
    async def check_memory(self) -> Dict[str, Any]:
        """Check memory usage"""
        try:
            memory = psutil.virtual_memory()
            percent_used = memory.percent
            
            if percent_used > 90:
                status = 'critical'
            elif percent_used > 80:
                status = 'warning'
            else:
                status = 'healthy'
            
            return {
                'status': status,
                'percent_used': percent_used,
                'available_gb': memory.available / (1024**3),
                'total_gb': memory.total / (1024**3)
            }
        except Exception as e:
            return {'status': 'unknown', 'error': str(e)}
    
    def get_uptime(self) -> Dict[str, Any]:
        """Get application uptime"""
        uptime = datetime.utcnow() - self.start_time
        return {
            'uptime_seconds': int(uptime.total_seconds()),
            'uptime_human': str(uptime).split('.')[0],  # Remove microseconds
            'started_at': self.start_time.isoformat() + 'Z'
        }
    
    async def get_basic_health(self) -> Dict[str, Any]:
        """Get basic health check (fast, for load balancers)"""
        return {
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'service': 'autobuddy-backend',
            'version': os.getenv('APP_VERSION', '1.0.0')
        }
    
    async def get_detailed_health(self) -> Dict[str, Any]:
        """Get detailed health check (comprehensive)"""
        checks = {
            'mongodb': await self.check_mongodb(),
            'postgresql': await self.check_postgresql(),
            'redis': await self.check_redis(),
            'disk': await self.check_disk_space(),
            'memory': await self.check_memory(),
        }
        
        # Determine overall status
        statuses = [check['status'] for check in checks.values()]
        if 'critical' in statuses or 'unhealthy' in statuses:
            overall_status = 'unhealthy'
        elif 'warning' in statuses:
            overall_status = 'degraded'
        else:
            overall_status = 'healthy'
        
        return {
            'status': overall_status,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'service': 'autobuddy-backend',
            'version': os.getenv('APP_VERSION', '1.0.0'),
            'uptime': self.get_uptime(),
            'checks': checks
        }


# Singleton instance
metrics_collector = MetricsCollector()

# Health checker will be initialized with dependencies
health_checker: Optional[HealthChecker] = None


def initialize_health_checker(mongo_client=None, postgres_engine=None, redis_client=None) -> None:
    """Initialize health checker with dependencies"""
    global health_checker
    health_checker = HealthChecker(mongo_client, postgres_engine, redis_client)


# Utility functions for easy imports
def record_http_request(method: str, endpoint: str, status: int, duration: float) -> None:
    """Convenience function to record HTTP request"""
    metrics_collector.record_http_request(method, endpoint, status, duration)


def record_database_operation(operation: str, collection: str, status: str, duration: float) -> None:
    """Convenience function to record database operation"""
    metrics_collector.record_database_operation(operation, collection, status, duration)


def record_external_api_call(service: str, status: str, duration: float) -> None:
    """Convenience function to record external API call"""
    metrics_collector.record_external_api_call(service, status, duration)
