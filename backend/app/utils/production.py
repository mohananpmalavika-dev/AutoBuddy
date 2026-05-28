"""
Production utilities for error handling, logging, and monitoring
"""
import logging
import time
from typing import Any, Dict, Optional, Callable
from functools import wraps
from datetime import datetime, timezone
from enum import Enum
import json

logger = logging.getLogger(__name__)


class OperationType(str, Enum):
    """Types of operations for monitoring and logging"""
    FILE_UPLOAD = "file_upload"
    PAYMENT_PROCESSING = "payment"
    USER_AUTH = "auth"
    RIDE_BOOKING = "booking"
    ADMIN_ACTION = "admin"
    AUDIT_LOG = "audit"
    ANALYTICS = "analytics"


class ErrorResponse:
    """Standardized error response for production"""
    
    @staticmethod
    def create(
        error_code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        status_code: int = 400
    ) -> Dict[str, Any]:
        """Create standardized error response"""
        return {
            "error": {
                "code": error_code,
                "message": message,
                "details": details or {},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "status": "error"
        }


class ProductionLogger:
    """Production-grade logging with structured output"""
    
    @staticmethod
    def log_operation(
        operation_type: OperationType,
        status: str,  # "success", "failure", "partial"
        user_id: Optional[str] = None,
        resource_id: Optional[str] = None,
        duration_ms: Optional[float] = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log operation with structured format"""
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "operation": operation_type.value,
            "status": status,
            "user_id": user_id,
            "resource_id": resource_id,
            "duration_ms": duration_ms,
            "error": error,
            "metadata": metadata or {}
        }
        
        if status == "failure":
            logger.error(json.dumps(log_entry))
        elif status == "success":
            logger.info(json.dumps(log_entry))
        else:
            logger.warning(json.dumps(log_entry))


class FileUploadValidator:
    """Production-grade file upload validation and error handling"""
    
    # Configuration
    MAX_FILE_SIZE_MB = 50
    ALLOWED_EXTENSIONS = {
        "pdf": ["pdf"],
        "image": ["jpg", "jpeg", "png", "webp"],
        "document": ["pdf", "doc", "docx", "xls", "xlsx"],
        "all": ["jpg", "jpeg", "png", "pdf", "doc", "docx", "xls", "xlsx", "webp"]
    }
    
    MIME_TYPES = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "pdf": "application/pdf",
        "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls": "application/vnd.ms-excel",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
    
    @classmethod
    def validate_file(
        cls,
        file_content: bytes,
        filename: str,
        allowed_types: str = "all",
        max_size_mb: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Validate uploaded file with comprehensive checks
        
        Returns:
            {"valid": bool, "error": str or None, "file_size": int}
        """
        try:
            # Check filename
            if not filename or len(filename) > 255:
                return {
                    "valid": False,
                    "error": "Invalid filename",
                    "error_code": "INVALID_FILENAME"
                }
            
            # Check extension
            ext = filename.split(".")[-1].lower()
            allowed = cls.ALLOWED_EXTENSIONS.get(allowed_types, cls.ALLOWED_EXTENSIONS["all"])
            if ext not in allowed:
                return {
                    "valid": False,
                    "error": f"File type not allowed. Accepted: {', '.join(allowed)}",
                    "error_code": "INVALID_FILE_TYPE"
                }
            
            # Check file size
            file_size_mb = len(file_content) / (1024 * 1024)
            max_size = max_size_mb or cls.MAX_FILE_SIZE_MB
            if file_size_mb > max_size:
                return {
                    "valid": False,
                    "error": f"File too large ({file_size_mb:.2f}MB). Max: {max_size}MB",
                    "error_code": "FILE_TOO_LARGE",
                    "file_size": len(file_content)
                }
            
            # Check for suspicious content
            if cls._has_suspicious_content(file_content, ext):
                return {
                    "valid": False,
                    "error": "File contains suspicious content",
                    "error_code": "SUSPICIOUS_CONTENT"
                }
            
            return {
                "valid": True,
                "error": None,
                "file_size": len(file_content),
                "mime_type": cls.MIME_TYPES.get(ext, "application/octet-stream")
            }
            
        except Exception as e:
            logger.error(f"File validation error: {str(e)}")
            return {
                "valid": False,
                "error": "File validation failed",
                "error_code": "VALIDATION_ERROR"
            }
    
    @staticmethod
    def _has_suspicious_content(file_content: bytes, ext: str) -> bool:
        """Check for suspicious content patterns"""
        try:
            # Check for common malware signatures
            suspicious_patterns = [
                b"PK\x03\x04" if ext in ["docx", "xlsx"] else b"",  # ZIP for Office files
                b"%PDF" if ext == "pdf" else b"",
            ]
            
            for pattern in suspicious_patterns:
                if pattern and pattern in file_content[:4]:
                    return False  # Expected signature found
            
            # Basic checks
            if ext in ["jpg", "jpeg", "png"]:
                # Image files should start with expected magic bytes
                if not (file_content[:3] == b'\xFF\xD8\xFF' or  # JPEG
                        file_content[:4] == b'\x89PNG' or  # PNG
                        file_content[:4] == b'RIFF'):  # WEBP/other
                    return True
            
            return False
        except Exception:
            return True


class RetryConfig:
    """Configuration for retry logic"""
    
    def __init__(
        self,
        max_attempts: int = 3,
        initial_delay_ms: int = 100,
        max_delay_ms: int = 5000,
        exponential_base: float = 2.0,
        jitter: bool = True
    ):
        self.max_attempts = max_attempts
        self.initial_delay_ms = initial_delay_ms
        self.max_delay_ms = max_delay_ms
        self.exponential_base = exponential_base
        self.jitter = jitter
    
    def get_delay(self, attempt: int) -> float:
        """Calculate delay in seconds with exponential backoff"""
        import random
        
        delay_ms = min(
            self.max_delay_ms,
            self.initial_delay_ms * (self.exponential_base ** attempt)
        )
        
        if self.jitter:
            delay_ms *= random.uniform(0.5, 1.0)
        
        return delay_ms / 1000.0


def track_operation(operation_type: OperationType):
    """Decorator to track operation performance and errors"""
    def decorator(func: Callable):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            user_id = kwargs.get("user_id") or (args[0] if args else None)
            
            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                ProductionLogger.log_operation(
                    operation_type,
                    "success",
                    user_id=user_id,
                    duration_ms=duration_ms
                )
                return result
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                ProductionLogger.log_operation(
                    operation_type,
                    "failure",
                    user_id=user_id,
                    duration_ms=duration_ms,
                    error=str(e)
                )
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            user_id = kwargs.get("user_id") or (args[0] if args else None)
            
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                ProductionLogger.log_operation(
                    operation_type,
                    "success",
                    user_id=user_id,
                    duration_ms=duration_ms
                )
                return result
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                ProductionLogger.log_operation(
                    operation_type,
                    "failure",
                    user_id=user_id,
                    duration_ms=duration_ms,
                    error=str(e)
                )
                raise
        
        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


class HealthCheckStatus:
    """Health check status indicators"""
    
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    
    @staticmethod
    def get_status_dict(
        database: str = HEALTHY,
        cache: str = HEALTHY,
        api_response_time_ms: Optional[float] = None,
        error_rate_percent: float = 0.0
    ) -> Dict[str, Any]:
        """Create health check response"""
        overall = HealthCheckStatus.HEALTHY
        if database == HealthCheckStatus.UNHEALTHY or cache == HealthCheckStatus.UNHEALTHY:
            overall = HealthCheckStatus.UNHEALTHY
        elif error_rate_percent > 5.0:
            overall = HealthCheckStatus.DEGRADED
        
        return {
            "status": overall,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": {
                "database": database,
                "cache": cache,
                "api_response_time_ms": api_response_time_ms,
                "error_rate_percent": error_rate_percent
            }
        }
