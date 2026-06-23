"""
Enhanced Error Handling with Stack Trace Sanitization
Provides safe error handling for production environments
Location: backend/app/utils/error_sanitizer.py
"""

import logging
import traceback
import re
import os
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum
from dataclasses import dataclass
import json

logger = logging.getLogger(__name__)

class ErrorSensitivity(Enum):
    """Error sensitivity levels"""
    PUBLIC = "public"  # Safe for client
    INTERNAL = "internal"  # Only for logs
    CRITICAL = "critical"  # Requires special handling

class SensitivePatterns:
    """Patterns for sensitive information"""

    # Database connection strings
    DATABASE_URL = re.compile(
        r'(postgres|mysql|mongodb)://[^@]*:[^@]*@[^\s/]+'
    )

    # API keys and tokens
    API_KEY = re.compile(
        r'(?i)(api[_-]?key|token|secret|password)\s*[=:]\s*["\']?([a-zA-Z0-9_\-]+)["\']?'
    )

    # Email addresses
    EMAIL = re.compile(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    )

    # Phone numbers
    PHONE = re.compile(
        r'\b(?:\+?1[-.]?)?(?:\(?[0-9]{3}\)?[-.]?)?[0-9]{3}[-.]?[0-9]{4}\b'
    )

    # IP addresses
    IP_ADDRESS = re.compile(
        r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b'
    )

    # File paths
    FILE_PATH = re.compile(
        r'(?:[A-Za-z]:\\|/)[^\s]+'
    )

@dataclass
class SanitizedStackTrace:
    """Sanitized stack trace information"""
    function: str
    file: str
    line: int
    code: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "function": self.function,
            "file": self.file,
            "line": self.line,
            "code": self.code
        }

class StackTraceSanitizer:
    """Sanitizes stack traces for safe output"""

    @staticmethod
    def sanitize_string(text: str, mask_emails: bool = True, mask_paths: bool = False) -> str:
        """Sanitize string of sensitive information"""
        if not text:
            return text

        sanitized = text

        # Mask database URLs
        sanitized = SensitivePatterns.DATABASE_URL.sub(
            lambda m: f"{m.group(1)}://[DATABASE_URL_MASKED]",
            sanitized
        )

        # Mask API keys and tokens
        sanitized = SensitivePatterns.API_KEY.sub(
            lambda m: f"{m.group(1)}=[TOKEN_MASKED]",
            sanitized
        )

        # Mask emails if requested
        if mask_emails:
            sanitized = SensitivePatterns.EMAIL.sub(
                "[EMAIL_MASKED]",
                sanitized
            )

        # Mask phone numbers
        sanitized = SensitivePatterns.PHONE.sub(
            "[PHONE_MASKED]",
            sanitized
        )

        # Mask file paths if requested
        if mask_paths:
            # Keep only filename, remove full path
            sanitized = SensitivePatterns.FILE_PATH.sub(
                lambda m: "[PATH_MASKED]/" + os.path.basename(m.group(0)),
                sanitized
            )

        return sanitized

    @staticmethod
    def extract_stack_frames(exception: Exception) -> List[SanitizedStackTrace]:
        """Extract and sanitize stack frames from exception"""
        frames = []

        try:
            tb = traceback.extract_tb(exception.__traceback__)
            for frame in tb:
                # Mask sensitive paths
                sanitized_path = StackTraceSanitizer._sanitize_path(frame.filename)

                # Don't include internal framework code
                if StackTraceSanitizer._is_internal_code(frame.filename):
                    continue

                sanitized_frame = SanitizedStackTrace(
                    function=frame.name,
                    file=sanitized_path,
                    line=frame.lineno,
                    code=StackTraceSanitizer.sanitize_string(
                        frame.line, mask_emails=True, mask_paths=False
                    ) if frame.line else None
                )
                frames.append(sanitized_frame)
        except Exception as e:
            logger.warning(f"Failed to extract stack frames: {str(e)}")

        return frames

    @staticmethod
    def _sanitize_path(path: str) -> str:
        """Sanitize file path to remove sensitive directories"""
        # Keep only relative path after /app/
        if '/app/' in path:
            return path.split('/app/')[-1]
        if '\\app\\' in path:
            return path.split('\\app\\')[-1]
        # Keep only filename if path can't be relativized
        return os.path.basename(path)

    @staticmethod
    def _is_internal_code(filepath: str) -> bool:
        """Check if file is internal framework/library code"""
        internal_paths = [
            'site-packages',
            'venv',
            'virtualenv',
            'python3',
            'starlette',
            'fastapi',
            'asyncio'
        ]
        return any(internal in filepath for internal in internal_paths)

    @staticmethod
    def get_safe_traceback(exception: Exception) -> str:
        """Get safe traceback for logging"""
        frames = StackTraceSanitizer.extract_stack_frames(exception)

        lines = [f"Exception: {type(exception).__name__}: {str(exception)}"]
        lines.append("\nStack trace:")

        for i, frame in enumerate(frames, 1):
            lines.append(f"  {i}. {frame.function} ({frame.file}:{frame.line})")
            if frame.code:
                lines.append(f"     {frame.code}")

        return "\n".join(lines)

    @staticmethod
    def get_safe_dict(exception: Exception) -> Dict:
        """Get exception as safe dictionary"""
        frames = StackTraceSanitizer.extract_stack_frames(exception)

        return {
            "exception_type": type(exception).__name__,
            "message": StackTraceSanitizer.sanitize_string(str(exception)),
            "frames": [f.to_dict() for f in frames[:5]],  # Limit to 5 frames
            "frame_count": len(frames)
        }

class ErrorContextManager:
    """Manages error context for better debugging"""

    def __init__(self):
        self.context_stack: List[Dict[str, Any]] = []

    def push_context(self, context: Dict[str, Any]):
        """Push context onto stack"""
        self.context_stack.append(context)

    def pop_context(self) -> Optional[Dict[str, Any]]:
        """Pop context from stack"""
        if self.context_stack:
            return self.context_stack.pop()
        return None

    def get_current_context(self) -> Dict[str, Any]:
        """Get current context"""
        if self.context_stack:
            return self.context_stack[-1]
        return {}

    def get_full_context(self) -> List[Dict[str, Any]]:
        """Get full context stack"""
        return self.context_stack.copy()

    def clear_context(self):
        """Clear context stack"""
        self.context_stack.clear()

# Global error context manager
error_context = ErrorContextManager()

class ProductionErrorFormatter:
    """Formats errors for production output"""

    @staticmethod
    def format_for_client(
        error_type: str,
        message: str,
        error_code: str,
        status_code: int
    ) -> Dict:
        """Format error for client (no sensitive info)"""
        return {
            "status": "error",
            "error": {
                "code": error_code,
                "message": message,
                "type": error_type
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status_code": status_code
        }

    @staticmethod
    def format_for_logs(
        exception: Exception,
        user_id: Optional[str] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        extra_context: Optional[Dict] = None
    ) -> Dict:
        """Format error for internal logging (includes safe details)"""
        from datetime import datetime, timezone

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "exception_type": type(exception).__name__,
            "message": str(exception),
            "safe_traceback": StackTraceSanitizer.get_safe_traceback(exception),
            "traceback_data": StackTraceSanitizer.get_safe_dict(exception),
            "context": {
                "user_id": user_id,
                "request_id": request_id,
                "endpoint": endpoint,
                "error_context": error_context.get_full_context(),
            **(extra_context or {})
            }
        }

# Export context manager usage
def with_error_context(**context):
    """Decorator to add error context"""
    def decorator(func):
        async def async_wrapper(*args, **kwargs):
            error_context.push_context(context)
            try:
                return await func(*args, **kwargs)
            finally:
                error_context.pop_context()

        def sync_wrapper(*args, **kwargs):
            error_context.push_context(context)
            try:
                return func(*args, **kwargs)
            finally:
                error_context.pop_context()

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator

import asyncio
from datetime import datetime, timezone
