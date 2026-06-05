"""
API Response Format Standardization
Consistent response format across all API endpoints
"""

from typing import Any, Dict, Optional, List
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from enum import Enum
import json

from app.utils.logging_config import StructuredLogger

logger = StructuredLogger(__name__)


class ResponseStatus(Enum):
    """Response status codes"""
    SUCCESS = "success"
    ERROR = "error"
    VALIDATION_ERROR = "validation_error"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    RATE_LIMITED = "rate_limited"
    SERVER_ERROR = "server_error"


class ErrorSeverity(Enum):
    """Error severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class StandardResponse:
    """Standard API response builder"""
    
    @staticmethod
    def success(
        data: Any = None,
        message: str = "Operation successful",
        metadata: Optional[Dict] = None,
        pagination: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Build a success response
        
        Example:
            {
                "status": "success",
                "message": "Operation successful",
                "data": {...},
                "metadata": {...},
                "pagination": {...},
                "timestamp": "2026-05-29T15:30:00Z"
            }
        """
        response = {
            "status": ResponseStatus.SUCCESS.value,
            "message": message,
            "timestamp": get_ist_now().isoformat() + "Z"
        }
        
        if data is not None:
            response["data"] = data
        
        if metadata:
            response["metadata"] = metadata
        
        if pagination:
            response["pagination"] = pagination
        
        return response
    
    @staticmethod
    def error(
        error_code: str,
        message: str,
        details: Optional[Dict] = None,
        status: ResponseStatus = ResponseStatus.ERROR,
        severity: ErrorSeverity = ErrorSeverity.ERROR
    ) -> Dict[str, Any]:
        """
        Build an error response
        
        Example:
            {
                "status": "error",
                "error": {
                    "code": "USER_NOT_FOUND",
                    "message": "The specified user does not exist",
                    "severity": "error",
                    "details": {...}
                },
                "timestamp": "2026-05-29T15:30:00Z"
            }
        """
        response = {
            "status": status.value,
            "error": {
                "code": error_code,
                "message": message,
                "severity": severity.value
            },
            "timestamp": get_ist_now().isoformat() + "Z"
        }
        
        if details:
            response["error"]["details"] = details
        
        return response
    
    @staticmethod
    def validation_error(
        errors: Dict[str, List[str]],
        message: str = "Validation failed"
    ) -> Dict[str, Any]:
        """
        Build a validation error response
        
        Example:
            {
                "status": "validation_error",
                "message": "Validation failed",
                "errors": {
                    "email": ["Invalid email format"],
                    "password": ["Must be at least 8 characters"]
                },
                "timestamp": "2026-05-29T15:30:00Z"
            }
        """
        return {
            "status": ResponseStatus.VALIDATION_ERROR.value,
            "message": message,
            "errors": errors,
            "timestamp": get_ist_now().isoformat() + "Z"
        }
    
    @staticmethod
    def unauthorized(
        message: str = "Authentication required",
        details: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Build unauthorized response"""
        return StandardResponse.error(
            error_code="UNAUTHORIZED",
            message=message,
            details=details,
            status=ResponseStatus.UNAUTHORIZED,
            severity=ErrorSeverity.WARNING
        )
    
    @staticmethod
    def forbidden(
        message: str = "Access denied",
        details: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Build forbidden response"""
        return StandardResponse.error(
            error_code="FORBIDDEN",
            message=message,
            details=details,
            status=ResponseStatus.FORBIDDEN,
            severity=ErrorSeverity.WARNING
        )
    
    @staticmethod
    def not_found(
        resource_type: str = "Resource",
        resource_id: Optional[str] = None,
        details: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Build not found response"""
        message = f"{resource_type} not found"
        if resource_id:
            message += f": {resource_id}"
        
        return StandardResponse.error(
            error_code="NOT_FOUND",
            message=message,
            details=details,
            status=ResponseStatus.NOT_FOUND,
            severity=ErrorSeverity.INFO
        )
    
    @staticmethod
    def conflict(
        message: str = "Resource conflict",
        details: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Build conflict response"""
        return StandardResponse.error(
            error_code="CONFLICT",
            message=message,
            details=details,
            status=ResponseStatus.CONFLICT,
            severity=ErrorSeverity.WARNING
        )
    
    @staticmethod
    def rate_limited(
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
        limit_info: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Build rate limited response"""
        details = limit_info or {}
        if retry_after:
            details["retry_after_seconds"] = retry_after
        
        return StandardResponse.error(
            error_code="RATE_LIMITED",
            message=message,
            details=details,
            status=ResponseStatus.RATE_LIMITED,
            severity=ErrorSeverity.WARNING
        )
    
    @staticmethod
    def server_error(
        message: str = "Internal server error",
        error_id: Optional[str] = None,
        details: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Build server error response"""
        error_details = details or {}
        if error_id:
            error_details["error_id"] = error_id
        
        return StandardResponse.error(
            error_code="SERVER_ERROR",
            message=message,
            details=error_details,
            status=ResponseStatus.SERVER_ERROR,
            severity=ErrorSeverity.CRITICAL
        )


class PaginatedResponse:
    """Builder for paginated responses"""
    
    @staticmethod
    def create(
        items: List[Any],
        total_count: int,
        page: int = 1,
        page_size: int = 20,
        message: str = "Items retrieved successfully"
    ) -> Dict[str, Any]:
        """
        Create paginated response
        
        Example:
            {
                "status": "success",
                "message": "Items retrieved successfully",
                "data": [...],
                "pagination": {
                    "page": 1,
                    "page_size": 20,
                    "total_count": 100,
                    "total_pages": 5,
                    "has_next": true,
                    "has_prev": false
                },
                "timestamp": "2026-05-29T15:30:00Z"
            }
        """
        total_pages = (total_count + page_size - 1) // page_size
        
        pagination = {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
        
        return StandardResponse.success(
            data=items,
            message=message,
            pagination=pagination
        )


class ListResponse:
    """Builder for list responses"""
    
    @staticmethod
    def create(
        items: List[Any],
        count: int = None,
        message: str = "Items retrieved successfully",
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Create list response
        
        Example:
            {
                "status": "success",
                "message": "Items retrieved successfully",
                "data": [...],
                "metadata": {
                    "count": 42
                },
                "timestamp": "2026-05-29T15:30:00Z"
            }
        """
        if count is None:
            count = len(items)
        
        meta = metadata or {}
        meta["count"] = count
        
        return StandardResponse.success(
            data=items,
            message=message,
            metadata=meta
        )


class ResponseLogger:
    """Log API responses for monitoring"""
    
    @staticmethod
    def log_response(
        endpoint: str,
        response: Dict[str, Any],
        status_code: int = 200,
        response_time_ms: float = 0
    ):
        """Log API response"""
        status = response.get("status", "unknown")
        error_code = None
        error_msg = None
        
        if "error" in response:
            error_code = response["error"].get("code")
            error_msg = response["error"].get("message")
        
        logger.log_endpoint_request(
            endpoint=endpoint,
            status=status,
            metadata={
                "http_status": status_code,
                "response_time_ms": response_time_ms,
                "error_code": error_code,
                "error_message": error_msg
            }
        )
    
    @staticmethod
    def log_validation_error(
        endpoint: str,
        errors: Dict[str, List[str]],
        field_count: int = None
    ):
        """Log validation error"""
        if field_count is None:
            field_count = len(errors)
        
        logger.log_endpoint_request(
            endpoint=endpoint,
            status="validation_error",
            metadata={
                "error_fields": field_count,
                "field_errors": errors
            }
        )


# Response templates for common scenarios

class ResponseTemplates:
    """Pre-built response templates"""
    
    @staticmethod
    def user_created(user_data: Dict) -> Dict:
        """Template for user creation"""
        return StandardResponse.success(
            data=user_data,
            message="User created successfully"
        )
    
    @staticmethod
    def user_updated(user_data: Dict) -> Dict:
        """Template for user update"""
        return StandardResponse.success(
            data=user_data,
            message="User updated successfully"
        )
    
    @staticmethod
    def ride_accepted(ride_data: Dict) -> Dict:
        """Template for ride acceptance"""
        return StandardResponse.success(
            data=ride_data,
            message="Ride accepted successfully"
        )
    
    @staticmethod
    def payment_processed(payment_data: Dict) -> Dict:
        """Template for payment processing"""
        return StandardResponse.success(
            data=payment_data,
            message="Payment processed successfully"
        )
    
    @staticmethod
    def file_uploaded(file_data: Dict) -> Dict:
        """Template for file upload"""
        return StandardResponse.success(
            data=file_data,
            message="File uploaded successfully"
        )
    
    @staticmethod
    def operation_completed(operation_name: str, result: Dict = None) -> Dict:
        """Template for any operation completion"""
        return StandardResponse.success(
            data=result,
            message=f"{operation_name} completed successfully"
        )
