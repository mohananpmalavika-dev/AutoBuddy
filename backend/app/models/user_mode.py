"""
User Mode Model - 3-Mode Feature Segmentation System

Modes:
- SIMPLE: Basic features (Book, Schedule, Track)
- SMART: AI-powered features (AI Suggestions, Family Assistant, Voice Booking)
- PRO: Enterprise features (Fleet, Analytics, Corporate)
"""

from sqlalchemy import Column, String, Integer, DateTime, Boolean, Enum as SQLEnum, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timedelta, timezone
import enum

Base = declarative_base()

# IST Timezone
IST_TZ = timezone(timedelta(hours=5, minutes=30))
def get_ist_now():
    """Returns current time in IST timezone."""
    return datetime.now(IST_TZ)


class UserModeEnum(str, enum.Enum):
    """User application mode"""
    SIMPLE = "simple"
    SMART = "smart"
    PRO = "pro"


class FeatureAccessMode(str, enum.Enum):
    """Feature visibility modes"""
    SIMPLE = "simple"
    SMART = "smart"
    PRO = "pro"
    ALL = "all"  # Available in all modes


class UserModeProfile(Base):
    """
    Stores user's selected mode and preferences
    Links to users table via user_id
    """
    __tablename__ = "user_mode_profiles"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, unique=True, index=True)
    
    # Current user mode
    current_mode = Column(
        SQLEnum(UserModeEnum),
        default=UserModeEnum.SIMPLE,
        nullable=False,
        index=True
    )
    
    # Mode upgrade history
    mode_upgraded_at = Column(DateTime, nullable=True)
    previous_mode = Column(SQLEnum(UserModeEnum), nullable=True)
    
    # Feature preferences within current mode
    ai_suggestions_enabled = Column(Boolean, default=True)
    voice_commands_enabled = Column(Boolean, default=True)
    family_assistant_enabled = Column(Boolean, default=False)
    
    # Pro mode specific
    fleet_management_enabled = Column(Boolean, default=False)
    analytics_dashboard_enabled = Column(Boolean, default=False)
    corporate_billing_enabled = Column(Boolean, default=False)
    
    # Trial/subscription info
    is_pro_trial = Column(Boolean, default=False)
    pro_trial_expires_at = Column(DateTime, nullable=True)
    is_pro_subscriber = Column(Boolean, default=False)
    pro_subscription_expires_at = Column(DateTime, nullable=True)
    
    # Audit
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "current_mode": self.current_mode.value if self.current_mode else None,
            "previous_mode": self.previous_mode.value if self.previous_mode else None,
            "mode_upgraded_at": self.mode_upgraded_at.isoformat() if self.mode_upgraded_at else None,
            "ai_suggestions_enabled": self.ai_suggestions_enabled,
            "voice_commands_enabled": self.voice_commands_enabled,
            "family_assistant_enabled": self.family_assistant_enabled,
            "fleet_management_enabled": self.fleet_management_enabled,
            "analytics_dashboard_enabled": self.analytics_dashboard_enabled,
            "corporate_billing_enabled": self.corporate_billing_enabled,
            "is_pro_trial": self.is_pro_trial,
            "pro_trial_expires_at": self.pro_trial_expires_at.isoformat() if self.pro_trial_expires_at else None,
            "is_pro_subscriber": self.is_pro_subscriber,
            "pro_subscription_expires_at": self.pro_subscription_expires_at.isoformat() if self.pro_subscription_expires_at else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class FeatureDefinition(Base):
    """
    Master registry of all features with their access levels
    """
    __tablename__ = "feature_definitions"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, unique=True, index=True)
    description = Column(String)
    
    # Which modes can access this feature
    access_mode = Column(
        SQLEnum(FeatureAccessMode),
        default=FeatureAccessMode.SIMPLE,
        nullable=False
    )
    
    # Feature metadata
    component_path = Column(String)  # React component or screen path
    router_name = Column(String)  # Navigation route name
    is_experimental = Column(Boolean, default=False)
    is_deprecated = Column(Boolean, default=False)
    
    # Version tracking
    introduced_in_version = Column(String)
    deprecated_in_version = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=get_ist_now)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "access_mode": self.access_mode.value if self.access_mode else None,
            "component_path": self.component_path,
            "router_name": self.router_name,
            "is_experimental": self.is_experimental,
            "is_deprecated": self.is_deprecated,
            "introduced_in_version": self.introduced_in_version,
            "deprecated_in_version": self.deprecated_in_version,
        }
