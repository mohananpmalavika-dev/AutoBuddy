"""
API Response standardization utilities
Ensures consistent response formats across all endpoints
"""
from fastapi import Response
from fastapi.responses import JSONResponse
from typing import Any, Dict, Optional, List
from datetime import datetime, timezone
from enum import Enum


class ResponseStatus(str, Enum):
    """Standard response status values"""
    SUCCESS = "success"
    ERROR = "error"
    PARTIAL = "partial"


class StandardResponse:
    """Builder for standardized API responses"""
    
    @staticmethod
    def success(
        data: Any = None,
        message: str = "Success",
        status_code: int = 200,
        metadata: Optional[Dict[str, Any]] = None
    ) -> JSONResponse:
        """Create success response"""
        return JSONResponse(
            status_code=status_code,
            content={
                "status": ResponseStatus.SUCCESS.value,
                "message": message,
                "data": data,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata or {}
            }
        )
    
    @staticmethod
    def error(
        error_code: str,
        message: str,
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None,
        errors: Optional[List[Dict[str, Any]]] = None
    ) -> JSONResponse:
        """Create error response"""
        content = {
            "status": ResponseStatus.ERROR.value,
            "error": {
                "code": error_code,
                "message": message,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        if details:
            content["error"]["details"] = details
        
        if errors:
            content["errors"] = errors
        
        return JSONResponse(
            status_code=status_code,
            content=content
        )
    
    @staticmethod
    def paginated(
        data: List[Any],
        total: int,
        skip: int = 0,
        limit: int = 50,
        message: str = "Success",
        status_code: int = 200
    ) -> JSONResponse:
        """Create paginated response"""
        return JSONResponse(
            status_code=status_code,
            content={
                "status": ResponseStatus.SUCCESS.value,
                "message": message,
                "data": data,
                "pagination": {
                    "total": total,
                    "skip": skip,
                    "limit": limit,
                    "has_more": skip + limit < total,
                    "page": (skip // limit) + 1,
                    "pages": (total + limit - 1) // limit
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    
    @staticmethod
    def created(
        data: Any,
        resource_id: Optional[str] = None,
        message: str = "Resource created successfully"
    ) -> JSONResponse:
        """Create response for resource creation (201)"""
        return JSONResponse(
            status_code=201,
            content={
                "status": ResponseStatus.SUCCESS.value,
                "message": message,
                "data": data,
                "resource_id": resource_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    
    @staticmethod
    def updated(
        data: Any,
        message: str = "Resource updated successfully"
    ) -> JSONResponse:
        """Create response for resource update"""
        return JSONResponse(
            status_code=200,
            content={
                "status": ResponseStatus.SUCCESS.value,
                "message": message,
                "data": data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    
    @staticmethod
    def deleted(
        resource_id: str,
        message: str = "Resource deleted successfully"
    ) -> JSONResponse:
        """Create response for resource deletion"""
        return JSONResponse(
            status_code=200,
            content={
                "status": ResponseStatus.SUCCESS.value,
                "message": message,
                "deleted_resource_id": resource_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    
    @staticmethod
    def partial(
        data: Any,
        total_expected: int,
        processed: int,
        message: str = "Partial success",
        failures: Optional[List[Dict[str, Any]]] = None
    ) -> JSONResponse:
        """Create response for partial success"""
        return JSONResponse(
            status_code=207,
            content={
                "status": ResponseStatus.PARTIAL.value,
                "message": message,
                "data": data,
                "processing": {
                    "total_expected": total_expected,
                    "processed": processed,
                    "failed": total_expected - processed,
                    "success_rate": (processed / total_expected * 100) if total_expected > 0 else 0
                },
                "failures": failures or [],
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    
    @staticmethod
    def validation_error(
        field: Optional[str] = None,
        message: str = "Validation failed",
        errors: Optional[List[Dict[str, Any]]] = None
    ) -> JSONResponse:
        """Create response for validation errors"""
        return JSONResponse(
            status_code=422,
            content={
                "status": ResponseStatus.ERROR.value,
                "error": {
                    "code": "validation_error",
                    "message": message,
                    "field": field
                },
                "errors": errors or [],
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    
    @staticmethod
    def unauthorized(
        message: str = "Unauthorized",
        reason: Optional[str] = None
    ) -> JSONResponse:
        """Create response for 401 Unauthorized"""
        content = {
            "status": ResponseStatus.ERROR.value,
            "error": {
                "code": "unauthorized",
                "message": message,
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        if reason:
            content["error"]["reason"] = reason
        
        return JSONResponse(status_code=401, content=content)
    
    @staticmethod
    def forbidden(
        message: str = "Forbidden",
        reason: Optional[str] = None
    ) -> JSONResponse:
        """Create response for 403 Forbidden"""
        content = {
            "status": ResponseStatus.ERROR.value,
            "error": {
                "code": "forbidden",
                "message": message,
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        if reason:
            content["error"]["reason"] = reason
        
        return JSONResponse(status_code=403, content=content)
    
    @staticmethod
    def not_found(
        resource_type: str,
        resource_id: Optional[str] = None
    ) -> JSONResponse:
        """Create response for 404 Not Found"""
        message = f"{resource_type} not found"
        if resource_id:
            message += f": {resource_id}"
        
        return JSONResponse(
            status_code=404,
            content={
                "status": ResponseStatus.ERROR.value,
                "error": {
                    "code": "not_found",
                    "message": message,
                    "resource_type": resource_type,
                    "resource_id": resource_id
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    
    @staticmethod
    def rate_limited(
        retry_after: int = 60,
        limit: Optional[int] = None,
        window: Optional[int] = None
    ) -> JSONResponse:
        """Create response for 429 Rate Limited"""
        return JSONResponse(
            status_code=429,
            content={
                "status": ResponseStatus.ERROR.value,
                "error": {
                    "code": "rate_limit_exceeded",
                    "message": "Too many requests",
                    "retry_after_seconds": retry_after,
                    "limit": limit,
                    "window_seconds": window
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            headers={
                "Retry-After": str(retry_after)
            }
        )
    
    @staticmethod
    def server_error(
        message: str = "Internal server error",
        error_code: str = "server_error",
        request_id: Optional[str] = None
    ) -> JSONResponse:
        """Create response for 500 Server Error"""
        content = {
            "status": ResponseStatus.ERROR.value,
            "error": {
                "code": error_code,
                "message": message,
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        if request_id:
            content["request_id"] = request_id
        
        return JSONResponse(status_code=500, content=content)


class ListResponse(StandardResponse):
    """Helper for list responses"""
    
    @staticmethod
    def items(
        items: List[Any],
        total: int,
        skip: int = 0,
        limit: int = 50
    ) -> JSONResponse:
        """Return paginated list"""
        return StandardResponse.paginated(items, total, skip, limit)


class DetailResponse(StandardResponse):
    """Helper for detail/get responses"""
    
    @staticmethod
    def single(item: Any) -> JSONResponse:
        """Return single item"""
        return StandardResponse.success(item)


class CreateResponse(StandardResponse):
    """Helper for create responses"""
    
    @staticmethod
    def created(item: Any, resource_id: Optional[str] = None) -> JSONResponse:
        """Return created item"""
        return StandardResponse.created(item, resource_id)


class UpdateResponse(StandardResponse):
    """Helper for update responses"""
    
    @staticmethod
    def updated(item: Any) -> JSONResponse:
        """Return updated item"""
        return StandardResponse.updated(item)


class DeleteResponse(StandardResponse):
    """Helper for delete responses"""
    
    @staticmethod
    def deleted(resource_id: str) -> JSONResponse:
        """Return deletion confirmation"""
        return StandardResponse.deleted(resource_id)
