"""
Logging Middleware for FastAPI
Adds request correlation IDs and structured logging to all requests
"""

import time
import uuid
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.logging_config import (
    get_logger,
    set_request_context,
    clear_request_context,
    log_api_request
)

logger = get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log all HTTP requests with correlation IDs
    """
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.exclude_paths = {
            '/health',
            '/api/health',
            '/api/health/ready',
            '/metrics',
            '/api/metrics',
            '/docs',
            '/redoc',
            '/openapi.json'
        }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and add logging"""
        
        # Skip logging for excluded paths
        if request.url.path in self.exclude_paths:
            return await call_next(request)
        
        # Generate request ID
        request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        
        # Extract user ID from request if authenticated
        user_id = None
        if hasattr(request.state, 'user') and request.state.user:
            user_id = str(request.state.user.get('id') or request.state.user.get('_id'))
        
        # Set request context for logging
        set_request_context(
            request_id=request_id,
            user_id=user_id,
            endpoint=f"{request.method} {request.url.path}"
        )
        
        # Start timer
        start_time = time.time()
        
        # Log incoming request
        logger.info(
            f"Incoming request: {request.method} {request.url.path}",
            extra={
                'event_type': 'request_start',
                'method': request.method,
                'path': request.url.path,
                'query_params': str(request.query_params),
                'client_host': request.client.host if request.client else None,
                'user_agent': request.headers.get('user-agent'),
            }
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Add request ID to response headers
            response.headers['X-Request-ID'] = request_id
            
            # Log successful request
            log_api_request(
                logger,
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
                user_id=user_id
            )
            
            return response
            
        except Exception as e:
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Log error
            logger.error(
                f"Request failed: {request.method} {request.url.path}",
                extra={
                    'event_type': 'request_error',
                    'method': request.method,
                    'path': request.url.path,
                    'duration_ms': duration_ms,
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                },
                exc_info=True
            )
            
            # Re-raise exception
            raise
            
        finally:
            # Clear request context
            clear_request_context()


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Simple middleware to add request IDs to all responses
    (Lightweight alternative to RequestLoggingMiddleware)
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Add request ID to response"""
        request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        response = await call_next(request)
        response.headers['X-Request-ID'] = request_id
        return response


def add_logging_middleware(app: ASGIApp) -> None:
    """
    Add logging middleware to FastAPI app
    
    Args:
        app: FastAPI application instance
    """
    # Add full logging middleware if enabled
    if os.getenv('ENABLE_REQUEST_LOGGING', 'true').lower() == 'true':
        app.add_middleware(RequestLoggingMiddleware)
        logger.info("Request logging middleware enabled")
    else:
        # Add lightweight request ID middleware only
        app.add_middleware(RequestIDMiddleware)
        logger.info("Request ID middleware enabled (logging disabled)")


# Import for FastAPI app
import os
