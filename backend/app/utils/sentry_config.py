"""
Sentry integration for error tracking and performance monitoring
"""
import os
from typing import Optional, Dict, Any
import logging

try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.asgi import AsgiIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlAlchemyIntegration
    from sentry_sdk.integrations.asyncio import AsyncioIntegration
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False
    sentry_sdk = None


class SentryConfig:
    """Sentry configuration and setup"""
    
    @staticmethod
    def is_enabled() -> bool:
        """Check if Sentry is enabled and configured"""
        return SENTRY_AVAILABLE and bool(os.getenv("SENTRY_DSN"))
    
    @staticmethod
    def initialize(
        environment: str = "production",
        traces_sample_rate: float = 0.1,
        profiles_sample_rate: float = 0.1,
        attach_stacktrace: bool = True,
        debug: bool = False
    ) -> Optional[bool]:
        """Initialize Sentry with production configuration"""
        
        if not SentryConfig.is_enabled():
            return False
        
        try:
            sentry_sdk.init(
                dsn=os.getenv("SENTRY_DSN"),
                environment=environment,
                traces_sample_rate=traces_sample_rate,
                profiles_sample_rate=profiles_sample_rate,
                attach_stacktrace=attach_stacktrace,
                debug=debug,
                integrations=[
                    FastApiIntegration(),
                    AsgiIntegration(),
                    LoggingIntegration(
                        level=logging.INFO,
                        event_level=logging.ERROR
                    ),
                    SqlAlchemyIntegration(),
                    AsyncioIntegration(),
                ],
                # Ignore certain errors that are expected
                ignore_errors=[
                    KeyboardInterrupt,
                    SystemExit,
                ],
                # Set before-send hook to filter sensitive data
                before_send=SentryConfig._before_send,
            )
            
            logging.getLogger(__name__).info("Sentry initialized successfully")
            return True
        
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to initialize Sentry: {e}")
            return False
    
    @staticmethod
    def _before_send(event: Dict[str, Any], hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Filter sensitive data before sending to Sentry"""
        
        # Remove sensitive headers
        if "request" in event and "headers" in event["request"]:
            sensitive_headers = [
                "Authorization",
                "X-API-Key",
                "Cookie",
                "Set-Cookie",
                "X-CSRF-Token"
            ]
            headers = event["request"]["headers"]
            for header in sensitive_headers:
                if header in headers:
                    headers[header] = "[REDACTED]"
        
        # Remove sensitive POST data
        if "request" in event and "data" in event["request"]:
            try:
                import json
                data = event["request"]["data"]
                if isinstance(data, str):
                    data_dict = json.loads(data)
                    sensitive_fields = [
                        "password",
                        "credit_card",
                        "cvv",
                        "token",
                        "api_key",
                        "secret",
                        "ssn"
                    ]
                    
                    for field in sensitive_fields:
                        if field in data_dict:
                            data_dict[field] = "[REDACTED]"
                    
                    event["request"]["data"] = json.dumps(data_dict)
            except Exception:
                pass
        
        return event


def set_sentry_context(
    user_id: Optional[str] = None,
    email: Optional[str] = None,
    role: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
):
    """Set Sentry user context for error tracking"""
    
    if not SENTRY_AVAILABLE:
        return
    
    user_context = {}
    if user_id:
        user_context["id"] = user_id
    if email:
        user_context["email"] = email
    if role:
        user_context["role"] = role
    
    if user_context:
        sentry_sdk.set_user(user_context)
    
    if metadata:
        for key, value in metadata.items():
            sentry_sdk.set_context(key, value)


def clear_sentry_context():
    """Clear Sentry user context"""
    if not SENTRY_AVAILABLE:
        return
    
    sentry_sdk.set_user(None)


def capture_exception(exception: Exception, level: str = "error", **kwargs):
    """Capture exception with Sentry"""
    if not SENTRY_AVAILABLE:
        logging.getLogger(__name__).error(f"Exception: {exception}")
        return
    
    sentry_sdk.capture_exception(
        exception,
        level=level,
        **kwargs
    )


def capture_message(message: str, level: str = "info", **kwargs):
    """Capture message with Sentry"""
    if not SENTRY_AVAILABLE:
        logging.getLogger(__name__).log(
            getattr(logging, level.upper(), logging.INFO),
            message
        )
        return
    
    sentry_sdk.capture_message(
        message,
        level=level,
        **kwargs
    )


def capture_performance(
    operation: str,
    duration_ms: float,
    status: str = "ok",
    **kwargs
):
    """Capture performance metrics"""
    if not SENTRY_AVAILABLE:
        return
    
    # Create performance event
    with sentry_sdk.start_transaction(
        op=operation,
        name=operation,
        **kwargs
    ) as transaction:
        import time
        # Simulate operation duration
        start_time = time.time()
        
        # Record as event
        sentry_sdk.capture_message(
            f"Performance: {operation} - {duration_ms}ms",
            level="info"
        )


# Decorator for monitoring function performance with Sentry
def monitor_with_sentry(operation_name: str, include_args: bool = False):
    """Decorator to monitor function performance with Sentry"""
    def decorator(func):
        import functools
        import time
        
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                
                capture_performance(
                    operation=operation_name,
                    duration_ms=duration_ms,
                    status="ok"
                )
                
                return result
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                
                capture_performance(
                    operation=operation_name,
                    duration_ms=duration_ms,
                    status="error"
                )
                
                capture_exception(e)
                raise
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                
                capture_performance(
                    operation=operation_name,
                    duration_ms=duration_ms,
                    status="ok"
                )
                
                return result
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                
                capture_performance(
                    operation=operation_name,
                    duration_ms=duration_ms,
                    status="error"
                )
                
                capture_exception(e)
                raise
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator
