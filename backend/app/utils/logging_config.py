"""
Comprehensive structured logging configuration for AutoBuddy
Provides production-grade logging with request tracking, performance monitoring, and error reporting
"""
import logging
import json
import time
import traceback
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from functools import wraps
from enum import Enum
from contextlib import contextmanager
import contextvars
from pathlib import Path
import os

# Context variables for request tracking
request_id_var = contextvars.ContextVar('request_id', default=None)
user_id_var = contextvars.ContextVar('user_id', default=None)
endpoint_var = contextvars.ContextVar('endpoint', default=None)


class LogLevel(str, Enum):
    """Standard log levels"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class LogCategory(str, Enum):
    """Log categories for filtering and routing"""
    AUTH = "auth"
    BOOKING = "booking"
    PAYMENT = "payment"
    DRIVER = "driver"
    PASSENGER = "passenger"
    ADMIN = "admin"
    SYSTEM = "system"
    DATABASE = "database"
    WEBSOCKET = "websocket"
    API = "api"
    PERFORMANCE = "performance"
    SECURITY = "security"
    ERROR = "error"


class StructuredLogger:
    """Production-grade structured logger with JSON output"""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.name = name
    
    def _build_context(self) -> Dict[str, Any]:
        """Build context from context variables"""
        return {
            "request_id": request_id_var.get(),
            "user_id": user_id_var.get(),
            "endpoint": endpoint_var.get(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    
    def _log(
        self,
        level: LogLevel,
        category: LogCategory,
        message: str,
        **kwargs
    ):
        """Internal logging method with structured format"""
        context = self._build_context()
        log_entry = {
            "level": level.value,
            "category": category.value,
            "logger": self.name,
            "message": message,
            **context,
            **kwargs
        }
        
        log_json = json.dumps(log_entry, default=str)
        
        if level == LogLevel.DEBUG:
            self.logger.debug(log_json)
        elif level == LogLevel.INFO:
            self.logger.info(log_json)
        elif level == LogLevel.WARNING:
            self.logger.warning(log_json)
        elif level == LogLevel.ERROR:
            self.logger.error(log_json)
        elif level == LogLevel.CRITICAL:
            self.logger.critical(log_json)
    
    # Convenience methods
    def debug(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs):
        """Log debug message"""
        self._log(LogLevel.DEBUG, category, message, **kwargs)
    
    def info(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs):
        """Log info message"""
        self._log(LogLevel.INFO, category, message, **kwargs)
    
    def warning(self, message: str, category: LogCategory = LogCategory.SYSTEM, **kwargs):
        """Log warning message"""
        self._log(LogLevel.WARNING, category, message, **kwargs)
    
    def error(self, message: str, category: LogCategory = LogCategory.ERROR, exception: Optional[Exception] = None, **kwargs):
        """Log error message with optional exception details"""
        if exception:
            kwargs["exception"] = str(exception)
            kwargs["traceback"] = traceback.format_exc()
        self._log(LogLevel.ERROR, category, message, **kwargs)
    
    def critical(self, message: str, category: LogCategory = LogCategory.ERROR, exception: Optional[Exception] = None, **kwargs):
        """Log critical message with optional exception details"""
        if exception:
            kwargs["exception"] = str(exception)
            kwargs["traceback"] = traceback.format_exc()
        self._log(LogLevel.CRITICAL, category, message, **kwargs)
    
    def log_operation(
        self,
        operation: str,
        status: str,  # "success", "failure", "partial"
        category: LogCategory = LogCategory.SYSTEM,
        duration_ms: Optional[float] = None,
        resource_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        exception: Optional[Exception] = None
    ):
        """Log operation with performance tracking"""
        log_level = LogLevel.INFO if status == "success" else LogLevel.ERROR if status == "failure" else LogLevel.WARNING
        
        log_data = {
            "operation": operation,
            "status": status,
            "resource_id": resource_id,
            "duration_ms": duration_ms,
            "metadata": metadata or {},
            "error": error
        }
        
        if exception:
            log_data["exception"] = str(exception)
            log_data["traceback"] = traceback.format_exc()
        
        self._log(log_level, category, f"Operation: {operation}", **log_data)


class PerformanceMonitor:
    """Monitor and log operation performance"""
    
    def __init__(self, logger: StructuredLogger, operation_name: str, category: LogCategory = LogCategory.PERFORMANCE):
        self.logger = logger
        self.operation_name = operation_name
        self.category = category
        self.start_time = None
        self.metadata = {}
    
    def __enter__(self):
        self.start_time = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.time() - self.start_time) * 1000
        
        if exc_type is not None:
            self.logger.log_operation(
                self.operation_name,
                "failure",
                category=self.category,
                duration_ms=duration_ms,
                error=str(exc_val),
                exception=exc_val
            )
        else:
            self.logger.log_operation(
                self.operation_name,
                "success",
                category=self.category,
                duration_ms=duration_ms,
                metadata=self.metadata
            )
    
    def add_metadata(self, key: str, value: Any):
        """Add metadata to operation log"""
        self.metadata[key] = value


def log_endpoint_request(logger: StructuredLogger):
    """Decorator to log API endpoint requests and responses"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            operation_name = f"endpoint_{func.__name__}"
            
            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                
                logger.log_operation(
                    operation_name,
                    "success",
                    category=LogCategory.API,
                    duration_ms=duration_ms
                )
                return result
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                logger.log_operation(
                    operation_name,
                    "failure",
                    category=LogCategory.API,
                    duration_ms=duration_ms,
                    error=str(e),
                    exception=e
                )
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            operation_name = f"endpoint_{func.__name__}"
            
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                
                logger.log_operation(
                    operation_name,
                    "success",
                    category=LogCategory.API,
                    duration_ms=duration_ms
                )
                return result
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                logger.log_operation(
                    operation_name,
                    "failure",
                    category=LogCategory.API,
                    duration_ms=duration_ms,
                    error=str(e),
                    exception=e
                )
                raise
        
        # Check if it's async
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def set_request_context(request_id: str, user_id: Optional[str] = None, endpoint: Optional[str] = None):
    """Set request context for logging"""
    request_id_var.set(request_id)
    if user_id:
        user_id_var.set(user_id)
    if endpoint:
        endpoint_var.set(endpoint)


def clear_request_context():
    """Clear request context"""
    request_id_var.set(None)
    user_id_var.set(None)
    endpoint_var.set(None)


@contextmanager
def log_context(request_id: str, user_id: Optional[str] = None, endpoint: Optional[str] = None):
    """Context manager for setting request context"""
    set_request_context(request_id, user_id, endpoint)
    try:
        yield
    finally:
        clear_request_context()


def configure_logging(
    name: str = "autobuddy",
    level: str = "INFO",
    log_file: Optional[str] = None
) -> StructuredLogger:
    """Configure production logging"""
    
    # Get root logger
    root_logger = logging.getLogger(name)
    root_logger.setLevel(getattr(logging, level.upper()))
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter('%(message)s'))
    root_logger.addHandler(console_handler)
    
    # File handler (optional)
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(logging.Formatter('%(message)s'))
        root_logger.addHandler(file_handler)
    
    return StructuredLogger(name)


# Database operation logging
def log_database_operation(
    logger: StructuredLogger,
    operation: str,
    table: str,
    duration_ms: float,
    status: str = "success",
    rows_affected: Optional[int] = None,
    error: Optional[str] = None
):
    """Log database operation"""
    metadata = {
        "table": table,
        "rows_affected": rows_affected
    }
    
    logger.log_operation(
        f"db_{operation}",
        status,
        category=LogCategory.DATABASE,
        duration_ms=duration_ms,
        metadata=metadata,
        error=error
    )


# API response logging
def log_api_response(
    logger: StructuredLogger,
    endpoint: str,
    method: str,
    status_code: int,
    duration_ms: float,
    request_size: Optional[int] = None,
    response_size: Optional[int] = None,
    error: Optional[str] = None
):
    """Log API response"""
    category = LogCategory.ERROR if status_code >= 400 else LogCategory.API
    status = "failure" if status_code >= 400 else "success"
    
    metadata = {
        "endpoint": endpoint,
        "method": method,
        "status_code": status_code,
        "request_size": request_size,
        "response_size": response_size
    }
    
    logger.log_operation(
        f"api_{method}",
        status,
        category=category,
        duration_ms=duration_ms,
        metadata=metadata,
        error=error
    )


# Payment operation logging
def log_payment_operation(
    logger: StructuredLogger,
    operation: str,
    amount: float,
    currency: str,
    user_id: str,
    status: str,
    transaction_id: Optional[str] = None,
    error: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
):
    """Log payment operation"""
    log_metadata = {
        "amount": amount,
        "currency": currency,
        "transaction_id": transaction_id,
        **(metadata or {})
    }
    
    logger.log_operation(
        f"payment_{operation}",
        status,
        category=LogCategory.PAYMENT,
        metadata=log_metadata,
        error=error,
        resource_id=user_id
    )


# Authentication logging
def log_authentication(
    logger: StructuredLogger,
    method: str,
    user_id: Optional[str],
    status: str,
    error: Optional[str] = None,
    ip_address: Optional[str] = None
):
    """Log authentication attempt"""
    metadata = {"ip_address": ip_address} if ip_address else {}
    
    logger.log_operation(
        f"auth_{method}",
        status,
        category=LogCategory.AUTH,
        resource_id=user_id,
        metadata=metadata,
        error=error
    )


# Audit logging
class AuditLogger:
    """Audit logging for compliance and forensics"""
    
    def __init__(self, logger: StructuredLogger):
        self.logger = logger
    
    def log_action(
        self,
        action: str,
        user_id: str,
        resource_type: str,
        resource_id: str,
        changes: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        status: str = "success"
    ):
        """Log audit action"""
        metadata = {
            "resource_type": resource_type,
            "action": action,
            "changes": changes or {},
            "ip_address": ip_address
        }
        
        self.logger.log_operation(
            f"audit_{action}",
            status,
            category=LogCategory.ADMIN,
            resource_id=resource_id,
            metadata=metadata
        )
    
    def log_sensitive_access(
        self,
        user_id: str,
        resource: str,
        ip_address: Optional[str] = None,
        granted: bool = True
    ):
        """Log access to sensitive resources"""
        status = "success" if granted else "failure"
        error = None if granted else "access_denied"
        
        metadata = {
            "resource": resource,
            "granted": granted,
            "ip_address": ip_address
        }
        
        self.logger.log_operation(
            f"sensitive_access_{resource}",
            status,
            category=LogCategory.SECURITY,
            resource_id=user_id,
            metadata=metadata,
            error=error
        )
