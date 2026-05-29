"""
Admin System Configuration Router
Features: Feature flags, templates, system settings, configuration management
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api/admin/config", tags=["admin-config"])


class FeatureFlag(BaseModel):
    flag_name: str
    enabled: bool
    applicable_to: str = Field(..., description="all, drivers, passengers")
    description: Optional[str] = None


class SystemSetting(BaseModel):
    setting_key: str
    setting_value: Any
    setting_type: str = Field(..., description="string, number, boolean, json")
    description: Optional[str] = None


class EmailTemplate(BaseModel):
    template_name: str
    subject: str
    body: str
    template_type: str = Field(..., description="confirmation, notification, reminder")


class RateLimitConfig(BaseModel):
    """Rate limit configuration for endpoints"""
    limit_type: str = Field(..., description="strict, moderate, normal, authenticated, anonymous")
    max_requests: int = Field(..., ge=1, le=10000, description="Maximum requests allowed")
    window_seconds: int = Field(..., ge=1, le=3600, description="Time window in seconds")
    description: Optional[str] = None
    enabled: bool = True


class RateLimitEndpointConfig(BaseModel):
    """Rate limit configuration for specific endpoints"""
    endpoint: str = Field(..., description="API endpoint path")
    limit_type: str = Field(..., description="strict, moderate, normal")
    max_requests: int = Field(..., ge=1, le=10000)
    window_seconds: int = Field(..., ge=1, le=3600)
    description: Optional[str] = None
    enabled: bool = True


# ==================== GET Endpoints ====================

@router.get("/feature-flags")
async def get_feature_flags(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get all feature flags"""
    try:
        flags = await db.feature_flags.find({}).to_list(None)
        
        return {
            "total": len(flags),
            "flags": [
                {
                    "flag_id": str(f.get("_id")),
                    "name": f.get("flag_name"),
                    "enabled": f.get("enabled"),
                    "applicable_to": f.get("applicable_to"),
                    "description": f.get("description"),
                }
                for f in flags
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching flags: {str(e)}")


@router.get("/settings")
async def get_system_settings(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get system settings"""
    try:
        settings = await db.system_settings.find({}).to_list(None)
        
        return {
            "total": len(settings),
            "settings": [
                {
                    "setting_id": str(s.get("_id")),
                    "key": s.get("setting_key"),
                    "value": s.get("setting_value"),
                    "type": s.get("setting_type"),
                    "description": s.get("description"),
                }
                for s in settings
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching settings: {str(e)}")


@router.get("/email-templates")
async def get_email_templates(
    template_type: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get email templates"""
    try:
        filters = {}
        if template_type:
            filters["template_type"] = template_type
        
        templates = await db.email_templates.find(filters).to_list(None)
        
        return {
            "total": len(templates),
            "templates": [
                {
                    "template_id": str(t.get("_id")),
                    "name": t.get("template_name"),
                    "subject": t.get("subject"),
                    "type": t.get("template_type"),
                }
                for t in templates
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching templates: {str(e)}")


@router.get("/email-templates/{template_name}")
async def get_email_template(
    template_name: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get specific email template"""
    try:
        template = await db.email_templates.find_one({"template_name": template_name})
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        return {
            "template_id": str(template.get("_id")),
            "name": template.get("template_name"),
            "subject": template.get("subject"),
            "body": template.get("body"),
            "type": template.get("template_type"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching template: {str(e)}")


# ==================== RATE LIMIT ENDPOINTS ====================

@router.get("/rate-limits")
async def get_rate_limits(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get all rate limit configurations"""
    try:
        # Get all rate limit configs from DB
        configs = await db.rate_limit_configs.find({}).to_list(None)
        
        # If no configs exist, return defaults
        if not configs:
            default_limits = {
                "strict": {"max_requests": 5, "window_seconds": 60, "description": "Strict limit for sensitive endpoints"},
                "moderate": {"max_requests": 30, "window_seconds": 60, "description": "Moderate limit for common endpoints"},
                "normal": {"max_requests": 100, "window_seconds": 60, "description": "Normal limit for general endpoints"},
                "authenticated": {"max_requests": 500, "window_seconds": 3600, "description": "Per-user limit for authenticated requests"},
                "anonymous": {"max_requests": 50, "window_seconds": 3600, "description": "Per-IP limit for anonymous requests"},
            }
            return {
                "total": len(default_limits),
                "limits": [
                    {
                        "limit_id": limit_type,
                        "limit_type": limit_type,
                        "max_requests": data.get("max_requests"),
                        "window_seconds": data.get("window_seconds"),
                        "description": data.get("description"),
                        "enabled": True,
                        "is_default": True,
                    }
                    for limit_type, data in default_limits.items()
                ]
            }
        
        return {
            "total": len(configs),
            "limits": [
                {
                    "limit_id": str(c.get("_id")),
                    "limit_type": c.get("limit_type"),
                    "max_requests": c.get("max_requests"),
                    "window_seconds": c.get("window_seconds"),
                    "description": c.get("description"),
                    "enabled": c.get("enabled", True),
                    "is_default": False,
                }
                for c in configs
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching rate limits: {str(e)}")


@router.get("/rate-limits/endpoints")
async def get_endpoint_rate_limits(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get rate limit configurations for specific endpoints"""
    try:
        endpoint_configs = await db.endpoint_rate_limits.find({}).to_list(None)
        
        return {
            "total": len(endpoint_configs),
            "endpoints": [
                {
                    "config_id": str(e.get("_id")),
                    "endpoint": e.get("endpoint"),
                    "limit_type": e.get("limit_type"),
                    "max_requests": e.get("max_requests"),
                    "window_seconds": e.get("window_seconds"),
                    "description": e.get("description"),
                    "enabled": e.get("enabled", True),
                }
                for e in endpoint_configs
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching endpoint rate limits: {str(e)}")


@router.put("/rate-limits/{limit_type}")
async def update_rate_limit(
    limit_type: str,
    update: RateLimitConfig,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update rate limit configuration"""
    try:
        # Validate limit type
        valid_types = ["strict", "moderate", "normal", "authenticated", "anonymous"]
        if limit_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid limit type. Must be one of: {', '.join(valid_types)}")
        
        await db.rate_limit_configs.update_one(
            {"limit_type": limit_type},
            {
                "$set": {
                    "limit_type": update.limit_type,
                    "max_requests": update.max_requests,
                    "window_seconds": update.window_seconds,
                    "description": update.description,
                    "enabled": update.enabled,
                    "updated_by": admin_user.get("user_id"),
                    "updated_at": datetime.utcnow(),
                }
            },
            upsert=True
        )
        
        return {
            "status": "success",
            "message": f"Rate limit '{limit_type}' updated successfully",
            "limit_type": limit_type,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating rate limit: {str(e)}")


@router.post("/rate-limits/endpoints/add")
async def add_endpoint_rate_limit(
    config: RateLimitEndpointConfig,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Add rate limit configuration for a specific endpoint"""
    try:
        result = await db.endpoint_rate_limits.insert_one({
            "endpoint": config.endpoint,
            "limit_type": config.limit_type,
            "max_requests": config.max_requests,
            "window_seconds": config.window_seconds,
            "description": config.description,
            "enabled": config.enabled,
            "created_by": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "message": f"Endpoint rate limit created for {config.endpoint}",
            "config_id": str(result.inserted_id),
            "endpoint": config.endpoint,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating endpoint rate limit: {str(e)}")


@router.put("/rate-limits/endpoints/{config_id}")
async def update_endpoint_rate_limit(
    config_id: str,
    config: RateLimitEndpointConfig,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update rate limit configuration for a specific endpoint"""
    try:
        from bson import ObjectId
        
        if not ObjectId.is_valid(config_id):
            raise HTTPException(status_code=400, detail="Invalid config ID")
        
        result = await db.endpoint_rate_limits.update_one(
            {"_id": ObjectId(config_id)},
            {
                "$set": {
                    "endpoint": config.endpoint,
                    "limit_type": config.limit_type,
                    "max_requests": config.max_requests,
                    "window_seconds": config.window_seconds,
                    "description": config.description,
                    "enabled": config.enabled,
                    "updated_by": admin_user.get("user_id"),
                    "updated_at": datetime.utcnow(),
                }
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Configuration not found")
        
        return {
            "status": "success",
            "message": f"Endpoint rate limit updated",
            "config_id": config_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating endpoint rate limit: {str(e)}")


@router.delete("/rate-limits/endpoints/{config_id}")
async def delete_endpoint_rate_limit(
    config_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Delete endpoint rate limit configuration"""
    try:
        from bson import ObjectId
        
        if not ObjectId.is_valid(config_id):
            raise HTTPException(status_code=400, detail="Invalid config ID")
        
        result = await db.endpoint_rate_limits.delete_one({"_id": ObjectId(config_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Configuration not found")
        
        return {
            "status": "success",
            "message": "Endpoint rate limit deleted successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting endpoint rate limit: {str(e)}")


# ==================== PUT Endpoints ====================

@router.put("/feature-flags/{flag_name}")
async def update_feature_flag(
    flag_name: str,
    update: FeatureFlag,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update feature flag"""
    try:
        await db.feature_flags.update_one(
            {"flag_name": flag_name},
            {
                "$set": {
                    "enabled": update.enabled,
                    "applicable_to": update.applicable_to,
                    "description": update.description,
                    "updated_by": admin_user.get("user_id"),
                    "updated_at": datetime.utcnow(),
                }
            },
            upsert=True
        )
        
        return {"status": "success", "flag": flag_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating flag: {str(e)}")


@router.put("/settings/{setting_key}")
async def update_system_setting(
    setting_key: str,
    update: SystemSetting,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update system setting"""
    try:
        await db.system_settings.update_one(
            {"setting_key": setting_key},
            {
                "$set": {
                    "setting_value": update.setting_value,
                    "setting_type": update.setting_type,
                    "description": update.description,
                    "updated_by": admin_user.get("user_id"),
                    "updated_at": datetime.utcnow(),
                }
            },
            upsert=True
        )
        
        return {"status": "success", "setting": setting_key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating setting: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/email-templates/create")
async def create_email_template(
    template: EmailTemplate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Create email template"""
    try:
        await db.email_templates.insert_one({
            "template_name": template.template_name,
            "subject": template.subject,
            "body": template.body,
            "template_type": template.template_type,
            "created_by": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {"status": "success", "template": template.template_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating template: {str(e)}")


@router.put("/email-templates/{template_name}")
async def update_email_template(
    template_name: str,
    template: EmailTemplate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update email template"""
    try:
        await db.email_templates.update_one(
            {"template_name": template_name},
            {
                "$set": {
                    "subject": template.subject,
                    "body": template.body,
                    "template_type": template.template_type,
                    "updated_by": admin_user.get("user_id"),
                    "updated_at": datetime.utcnow(),
                }
            }
        )
        
        return {"status": "success", "template": template_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating template: {str(e)}")
