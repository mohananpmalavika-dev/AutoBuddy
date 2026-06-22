"""
Feature Service - Handles feature access, visibility, and mode-based logic

Location: backend/app/services/feature_service.py
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from app.models.user_mode import UserModeProfile, UserModeEnum, FeatureDefinition, FeatureAccessMode
import uuid

IST_TZ = timezone(timedelta(hours=5, minutes=30))
def get_ist_now():
    return datetime.now(IST_TZ)


class FeatureService:
    """Service for managing user modes and feature access"""

    @staticmethod
    def get_or_create_user_mode(db: Session, user_id: str) -> UserModeProfile:
        """
        Get existing user mode profile or create default one
        """
        profile = db.query(UserModeProfile).filter(
            UserModeProfile.user_id == user_id
        ).first()
        
        if not profile:
            profile = UserModeProfile(
                id=str(uuid.uuid4()),
                user_id=user_id,
                current_mode=UserModeEnum.SIMPLE,
                created_at=get_ist_now(),
                updated_at=get_ist_now()
            )
            db.add(profile)
            db.commit()
        
        return profile

    @staticmethod
    def set_user_mode(db: Session, user_id: str, new_mode: UserModeEnum) -> UserModeProfile:
        """
        Update user's current mode
        """
        profile = FeatureService.get_or_create_user_mode(db, user_id)
        
        # Track mode change history
        if profile.current_mode != new_mode:
            profile.previous_mode = profile.current_mode
            profile.mode_upgraded_at = get_ist_now()
            profile.current_mode = new_mode
            profile.updated_at = get_ist_now()
            db.commit()
        
        return profile

    @staticmethod
    def get_user_mode(db: Session, user_id: str) -> UserModeEnum:
        """
        Get current user's mode
        """
        profile = FeatureService.get_or_create_user_mode(db, user_id)
        return profile.current_mode

    @staticmethod
    def is_feature_accessible(db: Session, user_id: str, feature_name: str) -> bool:
        """
        Check if user can access a specific feature
        """
        profile = FeatureService.get_or_create_user_mode(db, user_id)
        user_mode = profile.current_mode
        
        # Get feature definition
        feature = db.query(FeatureDefinition).filter(
            FeatureDefinition.name == feature_name
        ).first()
        
        if not feature:
            # Feature not registered - deny by default
            return False
        
        # Check if feature is deprecated
        if feature.is_deprecated:
            return False
        
        # Check access based on mode
        if feature.access_mode == FeatureAccessMode.ALL:
            return True
        
        if feature.access_mode == FeatureAccessMode.SIMPLE:
            return True  # Available in all modes
        
        if feature.access_mode == FeatureAccessMode.SMART:
            return user_mode in [UserModeEnum.SMART, UserModeEnum.PRO]
        
        if feature.access_mode == FeatureAccessMode.PRO:
            return user_mode == UserModeEnum.PRO
        
        return False

    @staticmethod
    def get_accessible_features(db: Session, user_id: str) -> List[FeatureDefinition]:
        """
        Get all features accessible to current user
        """
        profile = FeatureService.get_or_create_user_mode(db, user_id)
        user_mode = profile.current_mode
        
        # Query features accessible in user's mode
        features = db.query(FeatureDefinition).filter(
            FeatureDefinition.is_deprecated == False
        ).all()
        
        accessible = []
        for feature in features:
            if FeatureService.is_feature_accessible(db, user_id, feature.name):
                accessible.append(feature)
        
        return accessible

    @staticmethod
    def get_mode_features(db: Session, mode: UserModeEnum) -> List[FeatureDefinition]:
        """
        Get all features available in a specific mode
        """
        features = db.query(FeatureDefinition).filter(
            FeatureDefinition.is_deprecated == False
        ).all()
        
        accessible = []
        for feature in features:
            # Check if feature is available in this mode or higher
            if feature.access_mode == FeatureAccessMode.ALL:
                accessible.append(feature)
            elif feature.access_mode == FeatureAccessMode.SIMPLE:
                accessible.append(feature)
            elif feature.access_mode == FeatureAccessMode.SMART and mode in [UserModeEnum.SMART, UserModeEnum.PRO]:
                accessible.append(feature)
            elif feature.access_mode == FeatureAccessMode.PRO and mode == UserModeEnum.PRO:
                accessible.append(feature)
        
        return accessible

    @staticmethod
    def register_feature(
        db: Session,
        name: str,
        access_mode: FeatureAccessMode = FeatureAccessMode.SIMPLE,
        description: str = None,
        component_path: str = None,
        router_name: str = None,
        version: str = "1.0.0"
    ) -> FeatureDefinition:
        """
        Register a new feature or update existing
        """
        feature = db.query(FeatureDefinition).filter(
            FeatureDefinition.name == name
        ).first()
        
        if not feature:
            feature = FeatureDefinition(
                id=str(uuid.uuid4()),
                name=name,
                access_mode=access_mode,
                description=description,
                component_path=component_path,
                router_name=router_name,
                introduced_in_version=version
            )
            db.add(feature)
        else:
            feature.access_mode = access_mode
            feature.description = description
            feature.component_path = component_path
            feature.router_name = router_name
            feature.updated_at = get_ist_now()
        
        db.commit()
        return feature

    @staticmethod
    def start_pro_trial(db: Session, user_id: str, trial_days: int = 7) -> UserModeProfile:
        """
        Start a Pro mode trial for user
        """
        profile = FeatureService.get_or_create_user_mode(db, user_id)
        
        profile.is_pro_trial = True
        profile.pro_trial_expires_at = get_ist_now() + timedelta(days=trial_days)
        profile.updated_at = get_ist_now()
        
        db.commit()
        return profile

    @staticmethod
    def upgrade_to_pro(db: Session, user_id: str, subscription_days: int = 30) -> UserModeProfile:
        """
        Upgrade user to Pro mode subscription
        """
        profile = FeatureService.set_user_mode(db, user_id, UserModeEnum.PRO)
        
        profile.is_pro_subscriber = True
        profile.pro_subscription_expires_at = get_ist_now() + timedelta(days=subscription_days)
        profile.is_pro_trial = False
        profile.pro_trial_expires_at = None
        profile.updated_at = get_ist_now()
        
        db.commit()
        return profile

    @staticmethod
    def check_trial_expiry(db: Session, user_id: str) -> bool:
        """
        Check if trial has expired and downgrade if necessary
        """
        profile = FeatureService.get_or_create_user_mode(db, user_id)
        
        if profile.is_pro_trial and profile.pro_trial_expires_at:
            if get_ist_now() >= profile.pro_trial_expires_at:
                # Trial expired - downgrade to Smart mode
                profile.is_pro_trial = False
                profile.pro_trial_expires_at = None
                FeatureService.set_user_mode(db, user_id, UserModeEnum.SMART)
                return True
        
        return False

    @staticmethod
    def get_mode_summary(db: Session, user_id: str) -> Dict[str, Any]:
        """
        Get comprehensive user mode information
        """
        profile = FeatureService.get_or_create_user_mode(db, user_id)
        accessible_features = FeatureService.get_accessible_features(db, user_id)
        
        return {
            "user_id": user_id,
            "current_mode": profile.current_mode.value,
            "total_features_accessible": len(accessible_features),
            "features": [f.to_dict() for f in accessible_features],
            "is_pro_trial": profile.is_pro_trial,
            "pro_trial_expires_at": profile.pro_trial_expires_at.isoformat() if profile.pro_trial_expires_at else None,
            "is_pro_subscriber": profile.is_pro_subscriber,
            "pro_subscription_expires_at": profile.pro_subscription_expires_at.isoformat() if profile.pro_subscription_expires_at else None,
            "mode_profile": profile.to_dict()
        }


# Feature Bootstrap - Register default features
def bootstrap_features(db: Session):
    """
    Initialize default features for the 3-mode system
    """
    
    # SIMPLE MODE FEATURES
    simple_features = [
        {
            "name": "book_ride",
            "description": "Book a ride immediately",
            "access_mode": FeatureAccessMode.SIMPLE,
            "component_path": "screens/BookRideScreen",
            "router_name": "BookRide"
        },
        {
            "name": "schedule_ride",
            "description": "Schedule a ride for future",
            "access_mode": FeatureAccessMode.SIMPLE,
            "component_path": "screens/ScheduleRideScreen",
            "router_name": "ScheduleRide"
        },
        {
            "name": "track_ride",
            "description": "Track current ride in real-time",
            "access_mode": FeatureAccessMode.SIMPLE,
            "component_path": "screens/TrackRideScreen",
            "router_name": "TrackRide"
        },
    ]
    
    # SMART MODE FEATURES
    smart_features = [
        {
            "name": "ai_suggestions",
            "description": "AI-powered ride suggestions and optimization",
            "access_mode": FeatureAccessMode.SMART,
            "component_path": "screens/AISuggestionsScreen",
            "router_name": "AISuggestions"
        },
        {
            "name": "family_assistant",
            "description": "Family and group ride management",
            "access_mode": FeatureAccessMode.SMART,
            "component_path": "screens/FamilyAssistantScreen",
            "router_name": "FamilyAssistant"
        },
        {
            "name": "voice_booking",
            "description": "Voice-enabled ride booking",
            "access_mode": FeatureAccessMode.SMART,
            "component_path": "screens/VoiceBookingScreen",
            "router_name": "VoiceBooking"
        },
    ]
    
    # PRO MODE FEATURES
    pro_features = [
        {
            "name": "fleet_management",
            "description": "Fleet operations and management console",
            "access_mode": FeatureAccessMode.PRO,
            "component_path": "screens/FleetManagementScreen",
            "router_name": "FleetManagement"
        },
        {
            "name": "analytics_dashboard",
            "description": "Advanced analytics and insights",
            "access_mode": FeatureAccessMode.PRO,
            "component_path": "screens/AnalyticsDashboardScreen",
            "router_name": "AnalyticsDashboard"
        },
        {
            "name": "corporate_billing",
            "description": "Corporate account management and billing",
            "access_mode": FeatureAccessMode.PRO,
            "component_path": "screens/CorporateBillingScreen",
            "router_name": "CorporateBilling"
        },
    ]
    
    # Register all features
    all_features = simple_features + smart_features + pro_features
    
    for feature_def in all_features:
        FeatureService.register_feature(
            db=db,
            name=feature_def["name"],
            access_mode=feature_def["access_mode"],
            description=feature_def["description"],
            component_path=feature_def["component_path"],
            router_name=feature_def["router_name"]
        )
