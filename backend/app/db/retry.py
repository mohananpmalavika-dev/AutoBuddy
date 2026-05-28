"""
Database operation retry utilities for handling transient failures.
"""
import asyncio
import functools
import logging
from typing import Callable, TypeVar, Any
from pymongo.errors import ServerSelectionTimeoutError, PyMongoError

logger = logging.getLogger(__name__)

T = TypeVar('T')


def retry_on_db_error(
    max_attempts: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 5.0,
):
    """
    Decorator to retry async database operations on transient failures.
    
    Uses exponential backoff: delay = min(base_delay * (2 ^ attempt), max_delay)
    
    Args:
        max_attempts: Maximum number of retry attempts (default: 3)
        base_delay: Initial delay in seconds (default: 0.5)
        max_delay: Maximum delay in seconds (default: 5.0)
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except (ServerSelectionTimeoutError, PyMongoError) as e:
                    last_exception = e
                    
                    if attempt < max_attempts - 1:
                        # Exponential backoff
                        delay = min(base_delay * (2 ** attempt), max_delay)
                        logger.warning(
                            f"Database operation failed (attempt {attempt + 1}/{max_attempts}). "
                            f"Retrying in {delay:.2f}s: {str(e)}"
                        )
                        await asyncio.sleep(delay)
                    else:
                        logger.error(
                            f"Database operation failed after {max_attempts} attempts: {str(e)}"
                        )
            
            # If we get here, all retries failed
            raise last_exception
        
        return wrapper
    
    return decorator
