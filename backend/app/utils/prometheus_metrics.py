"""
Prometheus Metrics Collection
Centralized metrics collection for production monitoring and alerting
"""

from prometheus_client import Counter, Gauge, Histogram, Summary, CollectorRegistry
from prometheus_client.asgi import prometheus_app as prometheus_asgi_app
from functools import wraps
import time
from typing import Callable, Any
from app.utils.logging_config import StructuredLogger

# Global registry
REGISTRY = CollectorRegistry()
logger = StructuredLogger(__name__)

# ============================================================================
# Request Metrics
# ============================================================================

# HTTP request counter - tracks total requests by method, path, status
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status'],
    registry=REGISTRY
)

# HTTP request duration histogram - tracks response times
http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint'],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
    registry=REGISTRY
)

# Active HTTP requests gauge - current in-flight requests
http_requests_active = Gauge(
    'http_requests_active',
    'Active HTTP requests',
    ['method', 'endpoint'],
    registry=REGISTRY
)

# HTTP request size distribution
http_request_size_bytes = Histogram(
    'http_request_size_bytes',
    'HTTP request body size in bytes',
    ['method', 'endpoint'],
    buckets=(100, 1000, 10000, 100000, 1000000),
    registry=REGISTRY
)

# HTTP response size distribution
http_response_size_bytes = Histogram(
    'http_response_size_bytes',
    'HTTP response body size in bytes',
    ['method', 'endpoint'],
    buckets=(100, 1000, 10000, 100000, 1000000),
    registry=REGISTRY
)

# ============================================================================
# Error Metrics
# ============================================================================

# Error counter - tracks errors by type and endpoint
errors_total = Counter(
    'errors_total',
    'Total errors',
    ['error_type', 'endpoint', 'severity'],
    registry=REGISTRY
)

# Sentry error reports
sentry_events_total = Counter(
    'sentry_events_total',
    'Total Sentry error reports',
    ['error_type', 'severity'],
    registry=REGISTRY
)

# Rate limit violations
rate_limit_violations_total = Counter(
    'rate_limit_violations_total',
    'Total rate limit violations',
    ['endpoint', 'client_type'],
    registry=REGISTRY
)

# ============================================================================
# Database Metrics
# ============================================================================

# Database query duration
db_query_duration_seconds = Histogram(
    'db_query_duration_seconds',
    'Database query duration in seconds',
    ['operation', 'collection', 'status'],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=REGISTRY
)

# Database connection pool
db_connections_active = Gauge(
    'db_connections_active',
    'Active database connections',
    registry=REGISTRY
)

# Database query count
db_queries_total = Counter(
    'db_queries_total',
    'Total database queries',
    ['operation', 'collection', 'status'],
    registry=REGISTRY
)

# Slow query counter (> 500ms)
slow_queries_total = Counter(
    'slow_queries_total',
    'Total slow queries (>500ms)',
    ['operation', 'collection'],
    registry=REGISTRY
)

# ============================================================================
# WebSocket Metrics
# ============================================================================

# WebSocket connections
websocket_connections_total = Counter(
    'websocket_connections_total',
    'Total WebSocket connections',
    ['connection_type'],
    registry=REGISTRY
)

# Active WebSocket connections
websocket_connections_active = Gauge(
    'websocket_connections_active',
    'Active WebSocket connections',
    ['connection_type'],
    registry=REGISTRY
)

# WebSocket events
websocket_events_total = Counter(
    'websocket_events_total',
    'Total WebSocket events',
    ['event_type', 'status'],
    registry=REGISTRY
)

# WebSocket message duration
websocket_message_duration_seconds = Histogram(
    'websocket_message_duration_seconds',
    'WebSocket message processing duration',
    ['event_type'],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0),
    registry=REGISTRY
)

# ============================================================================
# Authentication Metrics
# ============================================================================

# Authentication attempts
auth_attempts_total = Counter(
    'auth_attempts_total',
    'Total authentication attempts',
    ['method', 'status'],
    registry=REGISTRY
)

# Active sessions
active_sessions = Gauge(
    'active_sessions',
    'Active user sessions',
    ['user_type'],
    registry=REGISTRY
)

# Session duration
session_duration_seconds = Summary(
    'session_duration_seconds',
    'User session duration in seconds',
    ['user_type'],
    registry=REGISTRY
)

# ============================================================================
# Business Metrics
# ============================================================================

# Bookings created
bookings_total = Counter(
    'bookings_total',
    'Total bookings',
    ['status'],
    registry=REGISTRY
)

# Booking duration
booking_duration_seconds = Summary(
    'booking_duration_seconds',
    'Booking completion time in seconds',
    ['status'],
    registry=REGISTRY
)

# Payments processed
payments_total = Counter(
    'payments_total',
    'Total payments processed',
    ['status', 'method'],
    registry=REGISTRY
)

# Payment amount
payment_amount_dollars = Summary(
    'payment_amount_dollars',
    'Payment amounts in dollars',
    ['method'],
    registry=REGISTRY
)

# Refunds processed
refunds_total = Counter(
    'refunds_total',
    'Total refunds',
    ['status'],
    registry=REGISTRY
)

# Active rides
active_rides = Gauge(
    'active_rides',
    'Active ride count',
    registry=REGISTRY
)

# Rating distribution
ratings_total = Counter(
    'ratings_total',
    'Total ratings given',
    ['rating_value'],
    registry=REGISTRY
)

# ============================================================================
# File Upload Metrics
# ============================================================================

# File uploads
file_uploads_total = Counter(
    'file_uploads_total',
    'Total file uploads',
    ['file_type', 'status'],
    registry=REGISTRY
)

# Upload size distribution
file_upload_size_bytes = Histogram(
    'file_upload_size_bytes',
    'File upload size in bytes',
    ['file_type'],
    buckets=(100000, 1000000, 5000000, 10000000, 50000000),
    registry=REGISTRY
)

# Upload duration
file_upload_duration_seconds = Histogram(
    'file_upload_duration_seconds',
    'File upload duration in seconds',
    ['file_type'],
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0),
    registry=REGISTRY
)

# ============================================================================
# System Metrics
# ============================================================================

# Background task queue size
background_task_queue_size = Gauge(
    'background_task_queue_size',
    'Background task queue size',
    registry=REGISTRY
)

# Background task duration
background_task_duration_seconds = Histogram(
    'background_task_duration_seconds',
    'Background task duration in seconds',
    ['task_name'],
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
    registry=REGISTRY
)

# ============================================================================
# Decorator for automatic HTTP request tracking
# ============================================================================

def track_http_request(func: Callable) -> Callable:
    """
    Decorator for FastAPI endpoints to automatically track HTTP metrics
    
    Usage:
        @app.get("/api/endpoint")
        @track_http_request
        async def endpoint():
            return {"message": "success"}
    """
    @wraps(func)
    async def async_wrapper(*args, **kwargs) -> Any:
        # Extract request details from context (assumes request in kwargs)
        request = kwargs.get('request')
        endpoint = request.url.path if request else "unknown"
        method = request.method if request else "unknown"
        
        # Increment active requests
        http_requests_active.labels(method=method, endpoint=endpoint).inc()
        
        # Track request processing
        start_time = time.time()
        try:
            result = await func(*args, **kwargs)
            duration = time.time() - start_time
            
            # Record metrics
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
            http_requests_total.labels(method=method, endpoint=endpoint, status="success").inc()
            
            return result
        except Exception as e:
            duration = time.time() - start_time
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
            http_requests_total.labels(method=method, endpoint=endpoint, status="error").inc()
            errors_total.labels(error_type=type(e).__name__, endpoint=endpoint, severity="high").inc()
            raise
        finally:
            http_requests_active.labels(method=method, endpoint=endpoint).dec()
    
    @wraps(func)
    def sync_wrapper(*args, **kwargs) -> Any:
        request = kwargs.get('request')
        endpoint = request.url.path if request else "unknown"
        method = request.method if request else "unknown"
        
        http_requests_active.labels(method=method, endpoint=endpoint).inc()
        start_time = time.time()
        
        try:
            result = func(*args, **kwargs)
            duration = time.time() - start_time
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
            http_requests_total.labels(method=method, endpoint=endpoint, status="success").inc()
            return result
        except Exception as e:
            duration = time.time() - start_time
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
            http_requests_total.labels(method=method, endpoint=endpoint, status="error").inc()
            errors_total.labels(error_type=type(e).__name__, endpoint=endpoint, severity="high").inc()
            raise
        finally:
            http_requests_active.labels(method=method, endpoint=endpoint).dec()
    
    # Return appropriate wrapper
    import inspect
    if inspect.iscoroutinefunction(func):
        return async_wrapper
    else:
        return sync_wrapper


# ============================================================================
# Decorator for database operation tracking
# ============================================================================

def track_db_operation(operation: str, collection: str = None):
    """
    Decorator for database operations to track query metrics
    
    Usage:
        @track_db_operation("find", "rides")
        async def find_ride(ride_id):
            return await collection.find_one({"_id": ride_id})
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                duration = time.time() - start_time
                
                # Track metrics
                db_query_duration_seconds.labels(operation=operation, collection=collection or "unknown", status="success").observe(duration)
                db_queries_total.labels(operation=operation, collection=collection or "unknown", status="success").inc()
                
                # Track slow queries
                if duration > 0.5:
                    slow_queries_total.labels(operation=operation, collection=collection or "unknown").inc()
                    logger.log_database_operation(
                        operation=operation,
                        collection=collection,
                        duration=duration,
                        status="slow",
                        rows_affected=None
                    )
                
                return result
            except Exception as e:
                duration = time.time() - start_time
                db_query_duration_seconds.labels(operation=operation, collection=collection or "unknown", status="error").observe(duration)
                db_queries_total.labels(operation=operation, collection=collection or "unknown", status="error").inc()
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                
                db_query_duration_seconds.labels(operation=operation, collection=collection or "unknown", status="success").observe(duration)
                db_queries_total.labels(operation=operation, collection=collection or "unknown", status="success").inc()
                
                if duration > 0.5:
                    slow_queries_total.labels(operation=operation, collection=collection or "unknown").inc()
                
                return result
            except Exception as e:
                duration = time.time() - start_time
                db_query_duration_seconds.labels(operation=operation, collection=collection or "unknown", status="error").observe(duration)
                db_queries_total.labels(operation=operation, collection=collection or "unknown", status="error").inc()
                raise
        
        import inspect
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


# ============================================================================
# Helper Functions
# ============================================================================

def record_websocket_connection(connection_type: str):
    """Record a new WebSocket connection"""
    websocket_connections_total.labels(connection_type=connection_type).inc()
    websocket_connections_active.labels(connection_type=connection_type).inc()


def record_websocket_disconnection(connection_type: str):
    """Record WebSocket disconnection"""
    websocket_connections_active.labels(connection_type=connection_type).dec()


def record_websocket_event(event_type: str, status: str = "success"):
    """Record WebSocket event"""
    websocket_events_total.labels(event_type=event_type, status=status).inc()


def record_authentication(method: str, status: str):
    """Record authentication attempt"""
    auth_attempts_total.labels(method=method, status=status).inc()


def record_booking(status: str, duration: float = None):
    """Record booking creation and completion"""
    bookings_total.labels(status=status).inc()
    if duration:
        booking_duration_seconds.labels(status=status).observe(duration)


def record_payment(status: str, amount: float, method: str = "card"):
    """Record payment processing"""
    payments_total.labels(status=status, method=method).inc()
    payment_amount_dollars.labels(method=method).observe(amount)


def record_file_upload(file_type: str, size_bytes: int, duration: float, status: str = "success"):
    """Record file upload"""
    file_uploads_total.labels(file_type=file_type, status=status).inc()
    file_upload_size_bytes.labels(file_type=file_type).observe(size_bytes)
    file_upload_duration_seconds.labels(file_type=file_type).observe(duration)


def record_error(error_type: str, endpoint: str, severity: str = "medium"):
    """Record application error"""
    errors_total.labels(error_type=error_type, endpoint=endpoint, severity=severity).inc()


# ============================================================================
# Prometheus ASGI Middleware
# ============================================================================

def create_prometheus_middleware(app):
    """
    Create ASGI middleware for Prometheus metrics collection
    
    Usage:
        from app.utils.prometheus_metrics import create_prometheus_middleware
        app = FastAPI()
        app = create_prometheus_middleware(app)
    """
    from fastapi import Request
    
    @app.middleware("http")
    async def prometheus_middleware(request: Request, call_next):
        start_time = time.time()
        method = request.method
        endpoint = request.url.path
        
        # Increment active requests
        http_requests_active.labels(method=method, endpoint=endpoint).inc()
        
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            # Record metrics
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
            http_requests_total.labels(method=method, endpoint=endpoint, status=response.status_code).inc()
            
            return response
        except Exception as e:
            duration = time.time() - start_time
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
            http_requests_total.labels(method=method, endpoint=endpoint, status="error").inc()
            errors_total.labels(error_type=type(e).__name__, endpoint=endpoint, severity="high").inc()
            raise
        finally:
            http_requests_active.labels(method=method, endpoint=endpoint).dec()
    
    return app
