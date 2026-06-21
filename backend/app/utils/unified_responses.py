"""
Unified API Response Handler
Single source of truth for all API response formatting
Location: backend/app/utils/unified_responses.py
"""

from typing import Any, Dict, Optional, List, TypeVar, Generic
from datetime import datetime, timezone
from enum import Enum
from dataclasses import dataclass, asdict
import json

T = TypeVar('T')

class ResponseStatus(str, Enum):
    """Standard response status values"""
    SUCCESS = "success"
    ERROR = "error"
    PARTIAL = "partial"

class ErrorCode(str, Enum):
    """Standard error codes"""
    # 4xx Client Errors
    BAD_REQUEST = "bad_request"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    UNPROCESSABLE_ENTITY = "validation_error"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    REQUEST_TIMEOUT = "request_timeout"

    # 5xx Server Errors
    INTERNAL_SERVER_ERROR = "internal_server_error"
    NOT_IMPLEMENTED = "not_implemented"
    SERVICE_UNAVAILABLE = "service_unavailable"

    # Custom errors
    AUTHENTICATION_FAILED = "authentication_failed"
    PERMISSION_DENIED = "permission_denied"
    RESOURCE_NOT_FOUND = "resource_not_found"
    INVALID_REQUEST = "invalid_request"
    OPERATION_FAILED = "operation_failed"

@dataclass
class PaginationMeta:
    """Pagination metadata"""
    total: int
    limit: int
    offset: int
    page: int
    pages: int
    has_next: bool
    has_prev: bool

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

@dataclass
class ErrorDetail:
    """Error detail information"""
    field: Optional[str] = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}

@dataclass
class ApiResponse(Generic[T]):
    """Unified API response structure"""
    status: ResponseStatus
    message: str
    data: Optional[T] = None
    error: Optional[Dict[str, Any]] = None
    pagination: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    timestamp: str = None
    version: str = "1.0"
    request_id: Optional[str] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "status": self.status.value,
            "message": self.message,
            "timestamp": self.timestamp,
            "version": self.version,
        }

        if self.data is not None:
            result["data"] = self.data
        if self.error is not None:
            result["error"] = self.error
        if self.pagination is not None:
            result["pagination"] = self.pagination
        if self.metadata is not None:
            result["metadata"] = self.metadata
        if self.request_id is not None:
            result["request_id"] = self.request_id

        return result

class ResponseBuilder:
    """Builder for constructing API responses with validation"""

    @staticmethod
    def success(
        data: Optional[Any] = None,
        message: str = "Operation completed successfully",
        pagination: Optional[PaginationMeta] = None,
        metadata: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None
    ) -> ApiResponse:
        """Build a successful response"""
        return ApiResponse(
            status=ResponseStatus.SUCCESS,
            message=message,
            data=data,
            pagination=pagination.to_dict() if pagination else None,
            metadata=metadata,
            request_id=request_id
        )

    @staticmethod
    def error(
        code: ErrorCode,
        message: str,
        details: Optional[List[ErrorDetail]] = None,
        status_code: int = 400,
        request_id: Optional[str] = None
    ) -> tuple[ApiResponse, int]:
        """Build an error response with HTTP status code"""
        error_obj = {
            "code": code.value,
            "message": message,
        }

        if details:
            error_obj["details"] = [d.to_dict() for d in details]

        return (
            ApiResponse(
                status=ResponseStatus.ERROR,
                message=message,
                error=error_obj,
                request_id=request_id
            ),
            status_code
        )

    @staticmethod
    def created(
        data: Any,
        resource_id: str,
        message: str = "Resource created successfully",
        request_id: Optional[str] = None
    ) -> tuple[ApiResponse, int]:
        """Build a creation response (201)"""
        return (
            ApiResponse(
                status=ResponseStatus.SUCCESS,
                message=message,
                data=data,
                metadata={"resource_id": resource_id},
                request_id=request_id
            ),
            201
        )

    @staticmethod
    def updated(
        data: Any,
        message: str = "Resource updated successfully",
        request_id: Optional[str] = None
    ) -> tuple[ApiResponse, int]:
        """Build an update response"""
        return (
            ApiResponse(
                status=ResponseStatus.SUCCESS,
                message=message,
                data=data,
                request_id=request_id
            ),
            200
        )

    @staticmethod
    def deleted(
        resource_id: str,
        message: str = "Resource deleted successfully",
        request_id: Optional[str] = None
    ) -> tuple[ApiResponse, int]:
        """Build a deletion response"""
        return (
            ApiResponse(
                status=ResponseStatus.SUCCESS,
                message=message,
                metadata={"deleted_resource_id": resource_id},
                request_id=request_id
            ),
            200
        )

    @staticmethod
    def paginated(
        items: List[Any],
        total: int,
        limit: int = 20,
        offset: int = 0,
        message: str = "Items retrieved successfully",
        request_id: Optional[str] = None
    ) -> tuple[ApiResponse, int]:
        """Build a paginated response"""
        page = (offset // limit) + 1 if limit > 0 else 1
        pages = (total + limit - 1) // limit if limit > 0 else 1

        pagination = PaginationMeta(
            total=total,
            limit=limit,
            offset=offset,
            page=page,
            pages=pages,
            has_next=offset + limit < total,
            has_prev=offset > 0
        )

        return (
            ApiResponse(
                status=ResponseStatus.SUCCESS,
                message=message,
                data=items,
                pagination=pagination.to_dict(),
                request_id=request_id
            ),
            200
        )

    @staticmethod
    def partial(
        items: List[Any],
        total: int,
        processed: int,
        failures: Optional[List[Dict[str, Any]]] = None,
        message: str = "Partial success",
        request_id: Optional[str] = None
    ) -> tuple[ApiResponse, int]:
        """Build a partial success response (207)"""
        return (
            ApiResponse(
                status=ResponseStatus.PARTIAL,
                message=message,
                data=items,
                metadata={
                    "total_expected": total,
                    "processed": processed,
                    "failed": total - processed,
                    "success_rate": (processed / total * 100) if total > 0 else 0,
                    "failures": failures or []
                },
                request_id=request_id
            ),
            207
        )

    @staticmethod
    def unauthorized(message: str = "Unauthorized") -> tuple[ApiResponse, int]:
        """401 Unauthorized"""
        response, _ = ResponseBuilder.error(
            ErrorCode.UNAUTHORIZED,
            message,
            status_code=401
        )
        return response, 401

    @staticmethod
    def forbidden(message: str = "Forbidden") -> tuple[ApiResponse, int]:
        """403 Forbidden"""
        response, _ = ResponseBuilder.error(
            ErrorCode.FORBIDDEN,
            message,
            status_code=403
        )
        return response, 403

    @staticmethod
    def not_found(resource_type: str, resource_id: Optional[str] = None) -> tuple[ApiResponse, int]:
        """404 Not Found"""
        message = f"{resource_type} not found"
        if resource_id:
            message += f": {resource_id}"

        response, _ = ResponseBuilder.error(
            ErrorCode.NOT_FOUND,
            message,
            status_code=404
        )
        return response, 404

    @staticmethod
    def validation_error(
        details: List[ErrorDetail],
        message: str = "Validation failed"
    ) -> tuple[ApiResponse, int]:
        """422 Unprocessable Entity"""
        response, _ = ResponseBuilder.error(
            ErrorCode.UNPROCESSABLE_ENTITY,
            message,
            details=details,
            status_code=422
        )
        return response, 422

    @staticmethod
    def rate_limited(retry_after: int = 60) -> tuple[ApiResponse, int]:
        """429 Too Many Requests"""
        response, _ = ResponseBuilder.error(
            ErrorCode.RATE_LIMIT_EXCEEDED,
            f"Rate limit exceeded. Retry after {retry_after} seconds",
            status_code=429
        )
        return response, 429

    @staticmethod
    def server_error(message: str = "Internal server error") -> tuple[ApiResponse, int]:
        """500 Internal Server Error"""
        response, _ = ResponseBuilder.error(
            ErrorCode.INTERNAL_SERVER_ERROR,
            message,
            status_code=500
        )
        return response, 500

# Export helper functions for simpler usage
def success(data: Optional[Any] = None, message: str = "Success", **kwargs) -> dict:
    """Quick success response"""
    resp, _ = ResponseBuilder.success(data, message)
    return resp.to_dict()

def error(code: ErrorCode, message: str, details: Optional[List[ErrorDetail]] = None) -> dict:
    """Quick error response"""
    resp, _ = ResponseBuilder.error(code, message, details)
    return resp.to_dict()

def paginated(items: List[Any], total: int, limit: int = 20, offset: int = 0) -> dict:
    """Quick paginated response"""
    resp, _ = ResponseBuilder.paginated(items, total, limit, offset)
    return resp.to_dict()
