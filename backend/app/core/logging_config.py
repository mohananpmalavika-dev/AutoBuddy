"""
Structured Logging Configuration
Provides JSON-formatted logging with request correlation IDs for production observability
"""

import logging
import json
import sys
import os
from datetime import datetime
from contextvars import ContextVar
from typing import Any, Dict, Optional
from pythonjsonlogger import jsonlogger

# Context variables for request tracking
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")
endpoint_var: ContextVar[str] = ContextVar("endpoint", default="")


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """
    Custom JSON formatter that includes request context
    """
    
    def add_fields(self, log_record: Dict[str, Any], record: logging.LogRecord, message_dict: Dict[str, Any]) -> None:
        """Add custom fields to log record"""
        super().add_fields(log_record, record, message_dict)
        
        # Add timestamp in ISO format
        log_record['timestamp'] = datetime.utcnow().isoformat() + 'Z'
        
        # Add log level
        log_record['level'] = record.levelname
        
        # Add request correlation ID
        request_id = request_id_var.get()
        if request_id:
            log_record['request_id'] = request_id
        
        # Add user ID if available
        user_id = user_id_var.get()
        if user_id:
            log_record['user_id'] = user_id
        
        # Add endpoint if available
        endpoint = endpoint_var.get()
        if endpoint:
            log_record['endpoint'] = endpoint
        
        # Add environment
        log_record['environment'] = os.getenv('ENVIRONMENT', 'development')
        
        # Add service name
        log_record['service'] = 'autobuddy-backend'
        
        # Add source information
        log_record['module'] = record.module
        log_record['function'] = record.funcName
        log_record['line'] = record.lineno
        
        # Handle exceptions
        if record.exc_info:
            log_record['exception'] = {
                'type': record.exc_info[0].__name__ if record.exc_info[0] else None,
                'message': str(record.exc_info[1]) if record.exc_info[1] else None,
                'traceback': self.formatException(record.exc_info) if record.exc_info else None
            }


class ContextualFilter(logging.Filter):
    """
    Filter that adds contextual information to log records
    """
    
    def filter(self, record: logging.LogRecord) -> bool:
        """Add context variables to record"""
        record.request_id = request_id_var.get()
        record.user_id = user_id_var.get()
        record.endpoint = endpoint_var.get()
        return True


def setup_logging(
    log_level: Optional[str] = None,
    json_logs: Optional[bool] = None,
    log_file: Optional[str] = None
) -> None:
    """
    Configure application logging
    
    Args:
        log_level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_logs: Whether to use JSON format (default: True in production)
        log_file: Path to log file (optional, defaults to stdout)
    """
    
    # Determine log level
    if log_level is None:
        log_level = os.getenv('LOG_LEVEL', 'INFO')
    
    # Determine if JSON logs should be used
    if json_logs is None:
        environment = os.getenv('ENVIRONMENT', 'development')
        json_logs = os.getenv('LOG_JSON', 'false').lower() == 'true' or environment == 'production'
    
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))
    
    # Clear existing handlers
    root_logger.handlers = []
    
    # Create handler
    if log_file:
        handler = logging.FileHandler(log_file)
    else:
        handler = logging.StreamHandler(sys.stdout)
    
    # Set formatter
    if json_logs:
        formatter = CustomJsonFormatter(
            '%(timestamp)s %(level)s %(name)s %(message)s',
            rename_fields={
                'levelname': 'level',
                'name': 'logger',
                'pathname': 'file',
            }
        )
    else:
        # Human-readable format for development
        formatter = logging.Formatter(
            '%(asctime)s [%(levelname)s] %(name)s - %(message)s '
            '(%(filename)s:%(lineno)d)',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    handler.setFormatter(formatter)
    
    # Add contextual filter
    handler.addFilter(ContextualFilter())
    
    # Add handler to root logger
    root_logger.addHandler(handler)
    
    # Configure third-party loggers
    _configure_third_party_loggers(log_level)
    
    # Log initial message
    logger = logging.getLogger(__name__)
    logger.info(
        "Logging configured",
        extra={
            'log_level': log_level,
            'json_format': json_logs,
            'log_file': log_file or 'stdout'
        }
    )


def _configure_third_party_loggers(log_level: str) -> None:
    """Configure log levels for third-party libraries"""
    
    # Reduce noise from verbose libraries
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('asyncio').setLevel(logging.WARNING)
    logging.getLogger('aiohttp').setLevel(logging.WARNING)
    
    # Set uvicorn loggers
    if os.getenv('ENVIRONMENT') == 'production':
        logging.getLogger('uvicorn').setLevel(logging.WARNING)
        logging.getLogger('uvicorn.access').setLevel(logging.WARNING)
    else:
        logging.getLogger('uvicorn').setLevel(logging.INFO)
        logging.getLogger('uvicorn.access').setLevel(logging.INFO)
    
    # SQL query logging (only in development)
    if os.getenv('LOG_SQL_QUERIES', 'false').lower() == 'true':
        logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
    else:
        logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance
    
    Args:
        name: Logger name (typically __name__)
    
    Returns:
        Configured logger instance
    """
    return logging.getLogger(name)


def set_request_context(
    request_id: Optional[str] = None,
    user_id: Optional[str] = None,
    endpoint: Optional[str] = None
) -> None:
    """
    Set request context for logging
    
    Args:
        request_id: Unique request identifier
        user_id: User ID making the request
        endpoint: API endpoint being accessed
    """
    if request_id:
        request_id_var.set(request_id)
    if user_id:
        user_id_var.set(user_id)
    if endpoint:
        endpoint_var.set(endpoint)


def clear_request_context() -> None:
    """Clear request context"""
    request_id_var.set("")
    user_id_var.set("")
    endpoint_var.set("")


def log_with_context(
    logger: logging.Logger,
    level: str,
    message: str,
    **kwargs: Any
) -> None:
    """
    Log a message with additional context
    
    Args:
        logger: Logger instance
        level: Log level (debug, info, warning, error, critical)
        message: Log message
        **kwargs: Additional context to include in log
    """
    log_func = getattr(logger, level.lower())
    log_func(message, extra=kwargs)


# Convenience functions for common log patterns

def log_api_request(
    logger: logging.Logger,
    method: str,
    path: str,
    status_code: int,
    duration_ms: float,
    user_id: Optional[str] = None
) -> None:
    """Log API request"""
    logger.info(
        f"{method} {path} {status_code}",
        extra={
            'event_type': 'api_request',
            'method': method,
            'path': path,
            'status_code': status_code,
            'duration_ms': duration_ms,
            'user_id': user_id
        }
    )


def log_database_query(
    logger: logging.Logger,
    query_type: str,
    collection: str,
    duration_ms: float,
    success: bool = True,
    error: Optional[str] = None
) -> None:
    """Log database query"""
    level = 'info' if success else 'error'
    getattr(logger, level)(
        f"Database {query_type} on {collection}",
        extra={
            'event_type': 'database_query',
            'query_type': query_type,
            'collection': collection,
            'duration_ms': duration_ms,
            'success': success,
            'error': error
        }
    )


def log_external_api_call(
    logger: logging.Logger,
    service: str,
    endpoint: str,
    duration_ms: float,
    status_code: Optional[int] = None,
    success: bool = True,
    error: Optional[str] = None
) -> None:
    """Log external API call"""
    level = 'info' if success else 'error'
    getattr(logger, level)(
        f"External API call to {service}",
        extra={
            'event_type': 'external_api_call',
            'service': service,
            'endpoint': endpoint,
            'duration_ms': duration_ms,
            'status_code': status_code,
            'success': success,
            'error': error
        }
    )


def log_business_event(
    logger: logging.Logger,
    event_name: str,
    user_id: Optional[str] = None,
    **metadata: Any
) -> None:
    """Log business event"""
    logger.info(
        f"Business event: {event_name}",
        extra={
            'event_type': 'business_event',
            'event_name': event_name,
            'user_id': user_id,
            **metadata
        }
    )


def log_security_event(
    logger: logging.Logger,
    event_type: str,
    severity: str,
    description: str,
    user_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    **metadata: Any
) -> None:
    """Log security event"""
    level = 'warning' if severity == 'medium' else 'error' if severity == 'high' else 'critical'
    getattr(logger, level)(
        f"Security event: {event_type}",
        extra={
            'event_type': 'security_event',
            'security_event_type': event_type,
            'severity': severity,
            'description': description,
            'user_id': user_id,
            'ip_address': ip_address,
            **metadata
        }
    )


# Example usage and testing
if __name__ == "__main__":
    # Test logging configuration
    setup_logging(log_level='DEBUG', json_logs=True)
    
    logger = get_logger(__name__)
    
    # Set request context
    set_request_context(
        request_id='req-12345',
        user_id='user-67890',
        endpoint='/api/v1/rides'
    )
    
    # Test different log levels
    logger.debug("This is a debug message")
    logger.info("This is an info message")
    logger.warning("This is a warning message")
    logger.error("This is an error message")
    
    # Test structured logging helpers
    log_api_request(logger, 'GET', '/api/v1/rides', 200, 45.2, 'user-67890')
    log_database_query(logger, 'find', 'rides', 12.5, success=True)
    log_external_api_call(logger, 'Google Maps', '/geocode', 234.5, 200, success=True)
    log_business_event(logger, 'ride_completed', user_id='user-67890', ride_id='ride-123')
    log_security_event(
        logger,
        'failed_login_attempt',
        'medium',
        'Multiple failed login attempts detected',
        user_id='user-67890',
        ip_address='192.168.1.100',
        attempt_count=5
    )
    
    # Test exception logging
    try:
        raise ValueError("Test exception")
    except Exception:
        logger.exception("An error occurred")
    
    # Clear context
    clear_request_context()
    
    logger.info("Context cleared")
