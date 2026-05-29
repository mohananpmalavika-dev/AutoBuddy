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
