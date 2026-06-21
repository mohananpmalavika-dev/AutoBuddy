"""
Standardized Error Handling
Consistent error responses across all endpoints
Location: backend/app/utils/error_handler.py
"""

from typing import Any, Dict, List, Optional
from enum import Enum
from app.utils.unified_responses import ResponseBuilder, ErrorCode, ErrorDetail

class ValidationErrorDetail:
    """Helper for building validation error details"""

    @staticmethod
    def field_error(field: str, code: str, message: str) -> ErrorDetail:
        """Create field validation error"""
        return ErrorDetail(field=field, code=code, message=message)

    @staticmethod
    def batch_errors(errors: List[Dict[str, str]]) -> List[ErrorDetail]:
        """Convert error list to ErrorDetail objects"""
        return [
            ErrorDetail(
                field=error.get("field"),
                code=error.get("code", "validation_error"),
                message=error.get("message", "Invalid value")
            )
            for error in errors
        ]

class ErrorResponse:
    """Factory for standardized error responses"""

    @staticmethod
    def validation_failed(
        details: List[ErrorDetail],
        message: str = "Request validation failed"
    ) -> tuple:
        """422 Validation Error"""
        return ResponseBuilder.validation_error(details, message)

    @staticmethod
    def invalid_field(field: str, message: str) -> tuple:
        """Single field validation error"""
        error = ValidationErrorDetail.field_error(field, "invalid", message)
        return ResponseBuilder.validation_error([error], "Validation failed")

    @staticmethod
    def missing_field(field: str) -> tuple:
        """Missing required field"""
        error = ValidationErrorDetail.field_error(field, "required", f"{field} is required")
        return ResponseBuilder.validation_error([error], "Missing required field")

    @staticmethod
    def unauthorized(message: str = "Unauthorized") -> tuple:
        """401 Unauthorized"""
        return ResponseBuilder.unauthorized(message)

    @staticmethod
    def forbidden(message: str = "Forbidden") -> tuple:
        """403 Forbidden"""
        return ResponseBuilder.forbidden(message)

    @staticmethod
    def not_found(resource: str, resource_id: Optional[str] = None) -> tuple:
        """404 Not Found"""
        return ResponseBuilder.not_found(resource, resource_id)

    @staticmethod
    def conflict(code: str, message: str) -> tuple:
        """409 Conflict"""
        response, _ = ResponseBuilder.error(
            ErrorCode.CONFLICT,
            message,
            status_code=409
        )
        return response, 409

    @staticmethod
    def rate_limited(retry_after: int = 60) -> tuple:
        """429 Rate Limited"""
        return ResponseBuilder.rate_limited(retry_after)

    @staticmethod
    def server_error(message: str = "Internal server error") -> tuple:
        """500 Server Error"""
        return ResponseBuilder.server_error(message)

class ErrorLogger:
    """Consistent error logging"""

    @staticmethod
    def log_validation_error(field: str, message: str, context: Dict[str, Any] = None):
        """Log validation error"""
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Validation error: {field} - {message}", extra=context or {})

    @staticmethod
    def log_not_found(resource: str, resource_id: str, context: Dict[str, Any] = None):
        """Log not found error"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Resource not found: {resource} - {resource_id}", extra=context or {})

    @staticmethod
    def log_unauthorized(message: str, context: Dict[str, Any] = None):
        """Log authorization error"""
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Unauthorized: {message}", extra=context or {})

    @staticmethod
    def log_server_error(message: str, exception: Exception = None, context: Dict[str, Any] = None):
        """Log server error"""
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Server error: {message}", exc_info=exception, extra=context or {})
