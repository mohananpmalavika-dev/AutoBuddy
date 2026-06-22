"""
User Mode API Routes - 3-Mode Feature Segmentation System
Location: backend/app/routers/user_mode.py

Endpoints:
- GET /api/v1/user-mode/{user_id} - Get user's mode profile and accessible features
- PUT /api/v1/user-mode/{user_id}/mode - Update user's mode
- POST /api/v1/user-mode/{user_id}/trial - Start Pro trial
- POST /api/v1/user-mode/{user_id}/upgrade - Upgrade to Pro subscription
- PUT /api/v1/user-mode/{user_id}/feature/{feature_name} - Toggle feature
- GET /api/v1/modes/summary - Get all modes with features
- POST /api/v1/modes/features/register - Register a new feature (admin only)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime

from app.database import get_db
from app.services.feature_service import (
    FeatureService,
    bootstrap_features,
)
from app.models.user_mode import UserModeEnum, FeatureAccessMode
from app.schemas.auth import UserRole  # For authorization

router = APIRouter(prefix="/api/v1", tags=["user-mode"])


# ============================================================================
# Pydantic Models for API Requests/Responses
# ============================================================================

class ModeUpdateRequest(BaseModel):
    """Request to update user's mode"""
    mode: Literal["simple", "smart", "pro"]


class ProTrialRequest(BaseModel):
    """Request to start Pro trial"""
    trial_days: int = Field(default=7, ge=1, le=30)


class SubscriptionUpgradeRequest(BaseModel):
    """Request to upgrade to Pro subscription"""
    subscription_days: int = Field(default=30, ge=1, le=365)


class FeatureToggleRequest(BaseModel):
    """Request to enable/disable a feature"""
    enabled: bool


class FeatureRegisterRequest(BaseModel):
    """Request to register a new feature (admin only)"""
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    access_mode: Literal["simple", "smart", "pro", "all"] = "simple"
    component_path: Optional[str] = None
    router_name: Optional[str] = None
    version: str = "1.0.0"


class FeatureResponse(BaseModel):
    """Feature information response"""
    id: str
    name: str
    description: Optional[str]
    access_mode: str
    component_path: Optional[str]
    router_name: Optional[str]
    is_experimental: bool
    is_deprecated: bool


class UserModeResponse(BaseModel):
    """User mode profile response"""
    user_id: str
    current_mode: str
    previous_mode: Optional[str]
    mode_upgraded_at: Optional[datetime]
    ai_suggestions_enabled: bool
    voice_commands_enabled: bool
    family_assistant_enabled: bool
    fleet_management_enabled: bool
    analytics_dashboard_enabled: bool
    corporate_billing_enabled: bool
    is_pro_trial: bool
    pro_trial_expires_at: Optional[datetime]
    is_pro_subscriber: bool
    pro_subscription_expires_at: Optional[datetime]


class ModeSummaryResponse(BaseModel):
    """User mode summary response with accessible features"""
    user_id: str
    current_mode: str
    total_features_accessible: int
    features: List[FeatureResponse]
    is_pro_trial: bool
    pro_trial_expires_at: Optional[datetime]
    is_pro_subscriber: bool
    pro_subscription_expires_at: Optional[datetime]
    mode_profile: UserModeResponse


class ModeDescriptionResponse(BaseModel):
    """Mode description with features"""
    name: str
    badge: str
    color: str
    description: str
    features: List[str]
    price: str


class AllModesResponse(BaseModel):
    """All modes comparison response"""
    simple: ModeDescriptionResponse
    smart: ModeDescriptionResponse
    pro: ModeDescriptionResponse


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/user-mode/{user_id}", response_model=ModeSummaryResponse)
async def get_user_mode(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Get user's current mode profile and all accessible features
    """
    try:
        # Check trial expiry
        FeatureService.check_trial_expiry(db, user_id)
        
        # Get mode summary
        summary = FeatureService.get_mode_summary(db, user_id)
        
        return ModeSummaryResponse(**summary)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user mode: {str(e)}"
        )


@router.put("/user-mode/{user_id}/mode", response_model=ModeSummaryResponse)
async def update_user_mode(
    user_id: str,
    request: ModeUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Update user's current mode (Simple, Smart, or Pro)
    """
    try:
        # Validate and convert mode
        mode = UserModeEnum(request.mode)
        
        # For Pro mode, check subscription
        if mode == UserModeEnum.PRO:
            profile = FeatureService.get_or_create_user_mode(db, user_id)
            if not (profile.is_pro_trial or profile.is_pro_subscriber):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User must start trial or subscribe to access Pro mode"
                )
        
        # Update mode
        FeatureService.set_user_mode(db, user_id, mode)
        
        # Return updated summary
        summary = FeatureService.get_mode_summary(db, user_id)
        return ModeSummaryResponse(**summary)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid mode. Must be: simple, smart, or pro"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user mode: {str(e)}"
        )


@router.post("/user-mode/{user_id}/trial", response_model=ModeSummaryResponse)
async def start_pro_trial(
    user_id: str,
    request: ProTrialRequest,
    db: Session = Depends(get_db)
):
    """
    Start a Pro mode trial for the user
    """
    try:
        profile = FeatureService.start_pro_trial(db, user_id, request.trial_days)
        
        # Automatically switch to Pro mode
        FeatureService.set_user_mode(db, user_id, UserModeEnum.PRO)
        
        summary = FeatureService.get_mode_summary(db, user_id)
        return ModeSummaryResponse(**summary)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start trial: {str(e)}"
        )


@router.post("/user-mode/{user_id}/upgrade", response_model=ModeSummaryResponse)
async def upgrade_to_pro(
    user_id: str,
    request: SubscriptionUpgradeRequest,
    db: Session = Depends(get_db)
):
    """
    Upgrade user to Pro mode subscription
    
    In production, this should:
    1. Process payment
    2. Create subscription record
    3. Then upgrade user
    """
    try:
        # TODO: Integrate with payment gateway (Razorpay, Stripe, etc.)
        
        profile = FeatureService.upgrade_to_pro(db, user_id, request.subscription_days)
        
        # Automatically switch to Pro mode
        FeatureService.set_user_mode(db, user_id, UserModeEnum.PRO)
        
        summary = FeatureService.get_mode_summary(db, user_id)
        return ModeSummaryResponse(**summary)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upgrade to Pro: {str(e)}"
        )


@router.put(
    "/user-mode/{user_id}/feature/{feature_name}",
    response_model=ModeSummaryResponse
)
async def toggle_feature(
    user_id: str,
    feature_name: str,
    request: FeatureToggleRequest,
    db: Session = Depends(get_db)
):
    """
    Enable or disable a specific feature for the user
    """
    try:
        # Check if feature is accessible
        if not FeatureService.is_feature_accessible(db, user_id, feature_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Feature '{feature_name}' is not accessible in current mode"
            )
        
        # Get user profile
        profile = FeatureService.get_or_create_user_mode(db, user_id)
        
        # Map feature names to profile attributes
        feature_toggles = {
            "ai_suggestions": "ai_suggestions_enabled",
            "voice_commands": "voice_commands_enabled",
            "family_assistant": "family_assistant_enabled",
            "fleet_management": "fleet_management_enabled",
            "analytics": "analytics_dashboard_enabled",
            "corporate_billing": "corporate_billing_enabled",
        }
        
        if feature_name in feature_toggles:
            attr = feature_toggles[feature_name]
            setattr(profile, attr, request.enabled)
            db.commit()
        
        summary = FeatureService.get_mode_summary(db, user_id)
        return ModeSummaryResponse(**summary)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to toggle feature: {str(e)}"
        )


@router.get("/modes/summary", response_model=AllModesResponse)
async def get_all_modes_summary():
    """
    Get all modes comparison without authentication
    Useful for onboarding screens
    """
    return AllModesResponse(
        simple=ModeDescriptionResponse(
            name="Simple Mode",
            badge="BASIC",
            color="#3B82F6",
            description="Basic ride booking and tracking",
            features=["Book Ride", "Schedule Ride", "Track Ride"],
            price="Free"
        ),
        smart=ModeDescriptionResponse(
            name="Smart Mode",
            badge="SMART",
            color="#8B5CF6",
            description="AI-powered features with voice booking and family assistant",
            features=[
                "AI Suggestions",
                "Family Assistant",
                "Voice Booking",
                "All Simple features"
            ],
            price="₹199/month"
        ),
        pro=ModeDescriptionResponse(
            name="Pro Mode",
            badge="ENTERPRISE",
            color="#DC2626",
            description="Enterprise features including fleet management and analytics",
            features=[
                "Fleet Management",
                "Analytics Dashboard",
                "Corporate Billing",
                "All Smart features"
            ],
            price="Custom pricing"
        )
    )


@router.post("/modes/features/register", response_model=FeatureResponse)
async def register_feature(
    request: FeatureRegisterRequest,
    db: Session = Depends(get_db)
    # TODO: Add role check for admin only
):
    """
    Register a new feature (Admin only)
    
    This endpoint allows platform admins to register new features
    and define which mode they belong to
    """
    try:
        # Convert access_mode string to enum
        access_mode = FeatureAccessMode(request.access_mode)
        
        # Register feature
        feature = FeatureService.register_feature(
            db=db,
            name=request.name,
            access_mode=access_mode,
            description=request.description,
            component_path=request.component_path,
            router_name=request.router_name,
            version=request.version
        )
        
        return FeatureResponse(**feature.to_dict())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid access_mode"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register feature: {str(e)}"
        )


@router.post("/modes/bootstrap-features")
async def bootstrap_default_features(
    db: Session = Depends(get_db)
    # TODO: Add role check for admin only
):
    """
    Initialize default features (Admin only)
    Call this once during deployment to set up all features
    """
    try:
        bootstrap_features(db)
        return {"status": "success", "message": "Features bootstrapped successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bootstrap features: {str(e)}"
        )
