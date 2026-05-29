
"""
Rate Limit Configuration Management
Manages database-driven rate limit settings for all endpoints
"""
from typing import Dict, List, Optional, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field, ConfigDict
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.core.auth import get_current_user
from app.core.database import get_db
from app.utils.rbac import check_rbac_permission

router = APIRouter(prefix="/api/admin/rate-limit-config", tags=["Rate Limit Configuration"])


class RateLimitProfileCreate(BaseModel):
    """Create/Update rate limit profile"""
    model_config = ConfigDict(extra="forbid")
    limit_type: str = Field(..., min_length=1, max_length=50)  # api_global, strict, moderate, normal, authenticated, anonymous
    max_requests: int = Field(..., ge=1, le=100000)
    window_seconds: int = Field(..., ge=10, le=86400)
    description: Optional[str] = Field(default=None, max_length=500)
    enabled: bool = Field(default=True)


class RateLimitProfileResponse(BaseModel):
    """Rate limit profile response"""
    id: str
    limit_type: str
    max_requests: int
    window_seconds: int
    description: Optional[str]
    enabled: bool
    created_at: datetime
    updated_at: datetime
    created_by: str


class EndpointRateLimitCreate(BaseModel):
    """Create/Update endpoint-specific rate limit"""
    model_config = ConfigDict(extra="forbid")
    endpoint_path: str = Field(..., min_length=1, max_length=200)
    limit_type: str = Field(..., min_length=1, max_length=50)
    max_requests: Optional[int] = Field(default=None, ge=1, le=100000)
    window_seconds: Optional[int] = Field(default=None, ge=10, le=86400)
    description: Optional[str] = Field(default=None, max_length=500)
    enabled: bool = Field(default=True)


class EndpointRateLimitResponse(BaseModel):
    """Endpoint rate limit response"""
    id: str
    endpoint_path: str
    limit_type: str
    max_requests: Optional[int]
    window_seconds: Optional[int]
    description: Optional[str]
    enabled: bool
    created_at: datetime
    updated_at: datetime


# Default rate limit profiles (to be created in database on startup)
DEFAULT_RATE_LIMIT_PROFILES = {
    "api_global": {
        "max_requests": 320,
        "window_seconds": 60,
        "description": "Global per-IP API guardrail",
    },
    "strict": {
        "max_requests": 5,
        "window_seconds": 60,
        "description": "Strict limit for sensitive endpoints (auth, payments, admin)",
    },
    "moderate": {
        "max_requests": 30,
        "window_seconds": 60,
        "description": "Moderate limit for common endpoints (bookings, support)",
    },
    "normal": {
        "max_requests": 100,
        "window_seconds": 60,
        "description": "Normal limit for general API endpoints",
    },
    "authenticated": {
        "max_requests": 500,
        "window_seconds": 3600,
        "description": "Per-user limit for authenticated requests",
    },
    "anonymous": {
        "max_requests": 50,
        "window_seconds": 3600,
        "description": "Per-IP limit for anonymous requests",
    },
}

# Default endpoint-specific rate limits
DEFAULT_ENDPOINT_RATE_LIMITS = [
    {
        "endpoint_path": "/api/auth/login",
        "limit_type": "strict",
        "description": "Login endpoint",
    },
    {
        "endpoint_path": "/api/auth/register",
        "limit_type": "strict",
        "description": "Registration endpoint",
    },
    {
        "endpoint_path": "/api/payments/order",
        "limit_type": "strict",
        "description": "Payment order creation",
    },
    {
        "endpoint_path": "/api/payments/verify",
        "limit_type": "strict",
        "description": "Payment verification",
    },
    {
        "endpoint_path": "/api/admin/audit-log",
        "limit_type": "strict",
        "description": "Audit log access",
    },
    {
        "endpoint_path": "/api/bookings",
        "limit_type": "moderate",
        "description": "Booking endpoints",
    },
    {
        "endpoint_path": "/api/support/tickets",
        "limit_type": "moderate",
        "description": "Support ticket endpoints",
    },
]


@router.get("/profiles", response_model=List[RateLimitProfileResponse])
async def get_all_profiles(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user),
):
    """Get all rate limit profiles - Admin only"""
    await check_rbac_permission(current_user, "manage_rate_limits")
    
    profiles = await db.rate_limit_profiles.find().to_list(None)
    return [
        RateLimitProfileResponse(
            id=str(p["_id"]),
            limit_type=p["limit_type"],
            max_requests=p["max_requests"],
            window_seconds=p["window_seconds"],
            description=p.get("description"),
            enabled=p.get("enabled", True),
            created_at=p.get("created_at", datetime.utcnow()),
            updated_at=p.get("updated_at", datetime.utcnow()),
            created_by=p.get("created_by", "system"),
        )
        for p in profiles
    ]


@router.get("/profiles/{limit_type}", response_model=RateLimitProfileResponse)
async def get_profile(
    limit_type: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user),
):
    """Get specific rate limit profile - Admin only"""
    await check_rbac_permission(current_user, "manage_rate_limits")
    
    profile = await db.rate_limit_profiles.find_one({"limit_type": limit_type})
    if not profile:
        raise HTTPException(status_code=404, detail="Rate limit profile not found")
    
    return RateLimitProfileResponse(
        id=str(profile["_id"]),
        limit_type=profile["limit_type"],
        max_requests=profile["max_requests"],
        window_seconds=profile["window_seconds"],
        description=profile.get("description"),
        enabled=profile.get("enabled", True),
        created_at=profile.get("created_at", datetime.utcnow()),
        updated_at=profile.get("updated_at", datetime.utcnow()),
        created_by=profile.get("created_by", "system"),
    )


@router.post("/profiles/{limit_type}")
async def update_profile(
    limit_type: str,
    body: RateLimitProfileCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user),
):
    """Update rate limit profile - Admin only"""
    await check_rbac_permission(current_user, "manage_rate_limits")
    
    updated = await db.rate_limit_profiles.find_one_and_update(
        {"limit_type": limit_type},
        {
            "$set": {
                "max_requests": body.max_requests,
                "window_seconds": body.window_seconds,
                "description": body.description,
                "enabled": body.enabled,
                "updated_at": datetime.utcnow(),
                "updated_by": current_user.get("id"),
            }
        },
        return_document=True,
    )
    
    if not updated:
        raise HTTPException(status_code=404, detail="Rate limit profile not found")
    
    return {
        "status": "success",
        "message": f"Rate limit profile '{limit_type}' updated",
        "profile": {
            "limit_type": updated["limit_type"],
            "max_requests": updated["max_requests"],
            "window_seconds": updated["window_seconds"],
            "enabled": updated.get("enabled", True),
        }
    }


@router.get("/endpoints", response_model=List[EndpointRateLimitResponse])
async def get_all_endpoints(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user),
):
    """Get all endpoint-specific rate limit configurations - Admin only"""
    await check_rbac_permission(current_user, "manage_rate_limits")
    
    endpoints = await db.endpoint_rate_limits.find().to_list(None)
    return [
        EndpointRateLimitResponse(
            id=str(e["_id"]),
            endpoint_path=e["endpoint_path"],
            limit_type=e["limit_type"],
            max_requests=e.get("max_requests"),
            window_seconds=e.get("window_seconds"),
            description=e.get("description"),
            enabled=e.get("enabled", True),
            created_at=e.get("created_at", datetime.utcnow()),
            updated_at=e.get("updated_at", datetime.utcnow()),
        )
        for e in endpoints
    ]


@router.post("/endpoints")
async def create_endpoint_config(
    body: EndpointRateLimitCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user),
):
    """Create endpoint-specific rate limit configuration - Admin only"""
    await check_rbac_permission(current_user, "manage_rate_limits")
    
    # Verify limit_type exists
    profile = await db.rate_limit_profiles.find_one({"limit_type": body.limit_type})
    if not profile:
        raise HTTPException(
            status_code=400,
            detail=f"Rate limit profile '{body.limit_type}' does not exist"
        )
    
    # Check if endpoint already configured
    existing = await db.endpoint_rate_limits.find_one({"endpoint_path": body.endpoint_path})
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Endpoint '{body.endpoint_path}' already has a rate limit configuration"
        )
    
    config = {
        "endpoint_path": body.endpoint_path,
        "limit_type": body.limit_type,
        "max_requests": body.max_requests,
        "window_seconds": body.window_seconds,
        "description": body.description,
        "enabled": body.enabled,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "created_by": current_user.get("id"),
    }
    
    result = await db.endpoint_rate_limits.insert_one(config)
    
    return {
        "status": "success",
        "id": str(result.inserted_id),
        "message": f"Rate limit configuration created for endpoint '{body.endpoint_path}'"
    }


@router.put("/endpoints/{endpoint_id}")
async def update_endpoint_config(
    endpoint_id: str,
    body: EndpointRateLimitCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user),
):
    """Update endpoint-specific rate limit configuration - Admin only"""
    await check_rbac_permission(current_user, "manage_rate_limits")
    
    # Verify limit_type exists
    profile = await db.rate_limit_profiles.find_one({"limit_type": body.limit_type})
    if not profile:
        raise HTTPException(
            status_code=400,
            detail=f"Rate limit profile '{body.limit_type}' does not exist"
        )
    
    updated = await db.endpoint_rate_limits.find_one_and_update(
        {"_id": ObjectId(endpoint_id)},
        {
            "$set": {
                "endpoint_path": body.endpoint_path,
                "limit_type": body.limit_type,
                "max_requests": body.max_requests,
                "window_seconds": body.window_seconds,
                "description": body.description,
                "enabled": body.enabled,
                "updated_at": datetime.utcnow(),
                "updated_by": current_user.get("id"),
            }
        },
        return_document=True,
    )
    
    if not updated:
        raise HTTPException(status_code=404, detail="Endpoint configuration not found")
    
    return {
        "status": "success",
        "message": f"Rate limit configuration updated for endpoint '{body.endpoint_path}'"
    }


@router.delete("/endpoints/{endpoint_id}")
async def delete_endpoint_config(
    endpoint_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user),
):
    """Delete endpoint-specific rate limit configuration - Admin only"""
    await check_rbac_permission(current_user, "manage_rate_limits")
    
    result = await db.endpoint_rate_limits.delete_one({"_id": ObjectId(endpoint_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Endpoint configuration not found")
    
    return {"status": "success", "message": "Rate limit configuration deleted"}


async def init_default_rate_limit_configs(db: AsyncIOMotorDatabase) -> None:
    """Initialize default rate limit configurations in database on startup"""
    if db is None:
        return
    
    try:
        # Create indexes
        await db.rate_limit_profiles.create_index("limit_type", unique=True)
        await db.endpoint_rate_limits.create_index("endpoint_path", unique=True)
        
        # Initialize profiles if they don't exist
        for limit_type, config in DEFAULT_RATE_LIMIT_PROFILES.items():
            existing = await db.rate_limit_profiles.find_one({"limit_type": limit_type})
            if not existing:
                await db.rate_limit_profiles.insert_one({
                    "limit_type": limit_type,
                    "max_requests": config["max_requests"],
                    "window_seconds": config["window_seconds"],
                    "description": config["description"],
                    "enabled": True,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "created_by": "system_init",
                })
        
        # Initialize endpoint configs if they don't exist
        for endpoint_config in DEFAULT_ENDPOINT_RATE_LIMITS:
            existing = await db.endpoint_rate_limits.find_one(
                {"endpoint_path": endpoint_config["endpoint_path"]}
            )
            if not existing:
                await db.endpoint_rate_limits.insert_one({
                    "endpoint_path": endpoint_config["endpoint_path"],
                    "limit_type": endpoint_config["limit_type"],
                    "max_requests": None,  # Use profile defaults
                    "window_seconds": None,
                    "description": endpoint_config.get("description"),
                    "enabled": True,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "created_by": "system_init",
                })
    except Exception as e:
        print(f"Error initializing rate limit configs: {str(e)}")


async def get_effective_rate_limit(
    db: AsyncIOMotorDatabase,
    endpoint_path: str,
    limit_type: str = "normal"
) -> Dict[str, int]:
    """
    Get effective rate limit for an endpoint.
    Checks endpoint-specific config first, then profile defaults.
    """
    # Check endpoint-specific config
    endpoint_config = await db.endpoint_rate_limits.find_one(
        {"endpoint_path": endpoint_path, "enabled": True}
    )
    
    if endpoint_config and endpoint_config.get("max_requests") and endpoint_config.get("window_seconds"):
        return {
            "max_requests": endpoint_config["max_requests"],
            "window_seconds": endpoint_config["window_seconds"],
        }
    
    if endpoint_config:
        limit_type = endpoint_config.get("limit_type", limit_type)
    
    # Fall back to profile defaults
    profile = await db.rate_limit_profiles.find_one(
        {"limit_type": limit_type, "enabled": True}
    )
    
    if profile:
        return {
            "max_requests": profile["max_requests"],
            "window_seconds": profile["window_seconds"],
        }
    
    # Ultimate fallback to hardcoded defaults (should rarely reach here)
    defaults = DEFAULT_RATE_LIMIT_PROFILES.get(limit_type, DEFAULT_RATE_LIMIT_PROFILES["normal"])
    return {
        "max_requests": defaults["max_requests"],
        "window_seconds": defaults["window_seconds"],
    }
