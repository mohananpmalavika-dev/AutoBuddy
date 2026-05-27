"""
Authentication utilities for passenger features
Wraps existing RBAC with passenger-specific authentication
"""

from fastapi import Depends, HTTPException
from app.utils.rbac import get_current_user_secure


async def get_current_passenger(
    current_user: dict = Depends(get_current_user_secure),
):
    """
    Get current authenticated passenger (user with passenger role)
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    role = str((current_user or {}).get("role") or "").strip().lower()
    if role not in {"passenger", "user"}:
        raise HTTPException(status_code=403, detail="Must be a passenger to access this resource")
    
    return current_user
