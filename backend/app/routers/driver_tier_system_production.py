from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import func, desc, and_
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from enum import Enum
from decimal import Decimal
import uuid

# Database Models
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, Boolean, Enum as SQLEnum

Base = declarative_base()

# ==================== ENUMS ====================

class TierLevel(str, Enum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"
    PLATINUM = "platinum"

# ==================== DATABASE MODELS ====================

class DriverTier(Base):
    __tablename__ = "driver_tiers"

    tier_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String, nullable=False, index=True, unique=True)
    current_tier = Column(SQLEnum(TierLevel), nullable=False, default=TierLevel.BRONZE)
    tier_points = Column(Integer, nullable=False, default=0)
    total_rides_completed = Column(Integer, nullable=False, default=0)
    average_rating = Column(Float, nullable=False, default=3.5)
    acceptance_rate = Column(Float, nullable=False, default=0.0)
    total_earnings = Column(Float, nullable=False, default=0.0)
    tier_upgrade_date = Column(DateTime, nullable=True)
    current_benefits = Column(JSON, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class TierBenefit(Base):
    __tablename__ = "tier_benefits"

    benefit_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tier_level = Column(SQLEnum(TierLevel), nullable=False, index=True)
    benefit_name = Column(String, nullable=False)
    benefit_description = Column(String, nullable=False)
    earning_multiplier = Column(Float, nullable=False)
    priority_support = Column(Boolean, default=False)
    badges_earned = Column(Integer, default=0)
    exclusive_features = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class TierProgress(Base):
    __tablename__ = "tier_progress"

    progress_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String, nullable=False, index=True, unique=True)
    current_tier_level = Column(String, nullable=False)
    next_tier_level = Column(String, nullable=True)
    points_current = Column(Integer, nullable=False, default=0)
    points_required = Column(Integer, nullable=False, default=0)
    requirements = Column(JSON, nullable=False)
    progress_percentage = Column(Integer, nullable=False, default=0)
    estimated_days_to_upgrade = Column(Integer, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class TierHistory(Base):
    __tablename__ = "tier_history"

    history_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String, nullable=False, index=True)
    from_tier = Column(String, nullable=False)
    to_tier = Column(String, nullable=False)
    upgrade_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    metrics_at_upgrade = Column(JSON, nullable=False)

# ==================== TIER CONFIGURATION ====================

TIER_CONFIG = {
    "bronze": {
        "name": "Bronze",
        "color": "#CD7F32",
        "multiplier": 1.0,
        "rides_required": 0,
        "rating_required": 3.5,
        "acceptance_required": 0.0,
        "benefits": ["Platform access", "Ride matching"],
        "points_threshold": 0
    },
    "silver": {
        "name": "Silver",
        "color": "#C0C0C0",
        "multiplier": 1.05,
        "rides_required": 200,
        "rating_required": 4.0,
        "acceptance_required": 70.0,
        "benefits": ["Priority queue", "5% earnings boost", "Silver badge"],
        "points_threshold": 1500
    },
    "gold": {
        "name": "Gold",
        "color": "#FFD700",
        "multiplier": 1.15,
        "rides_required": 1000,
        "rating_required": 4.3,
        "acceptance_required": 80.0,
        "benefits": ["15% earnings boost", "Priority support", "Gold badge", "Ride history"],
        "points_threshold": 6000
    },
    "platinum": {
        "name": "Platinum",
        "color": "#E5E4E2",
        "multiplier": 1.3,
        "rides_required": 2000,
        "rating_required": 4.6,
        "acceptance_required": 85.0,
        "benefits": ["30% earnings boost", "VIP support", "Elite badge", "Exclusive events"],
        "points_threshold": 12000
    }
}

# ==================== CALCULATION FUNCTIONS ====================

class TierCalculator:
    @staticmethod
    def calculate_tier_points(rides: int, rating: float, acceptance: float, earnings: float) -> int:
        """Calculate tier points from driver metrics"""
        points = 0
        points += int(rides / 5)  # 1 point per 5 rides
        points += int(rating * 1000)  # Rating multiplied by 1000
        points += int(acceptance * 10)  # Acceptance rate × 10
        points += int(earnings / 100)  # Earnings / 100
        return points

    @staticmethod
    def get_tier_from_points(points: int) -> TierLevel:
        """Determine tier based on points"""
        if points >= TIER_CONFIG["platinum"]["points_threshold"]:
            return TierLevel.PLATINUM
        elif points >= TIER_CONFIG["gold"]["points_threshold"]:
            return TierLevel.GOLD
        elif points >= TIER_CONFIG["silver"]["points_threshold"]:
            return TierLevel.SILVER
        else:
            return TierLevel.BRONZE

    @staticmethod
    def check_tier_eligibility(rides: int, rating: float, acceptance: float) -> TierLevel:
        """Check tier eligibility based on requirements"""
        # Check platinum
        if (rides >= TIER_CONFIG["platinum"]["rides_required"] and
            rating >= TIER_CONFIG["platinum"]["rating_required"] and
            acceptance >= TIER_CONFIG["platinum"]["acceptance_required"]):
            return TierLevel.PLATINUM

        # Check gold
        if (rides >= TIER_CONFIG["gold"]["rides_required"] and
            rating >= TIER_CONFIG["gold"]["rating_required"] and
            acceptance >= TIER_CONFIG["gold"]["acceptance_required"]):
            return TierLevel.GOLD

        # Check silver
        if (rides >= TIER_CONFIG["silver"]["rides_required"] and
            rating >= TIER_CONFIG["silver"]["rating_required"] and
            acceptance >= TIER_CONFIG["silver"]["acceptance_required"]):
            return TierLevel.SILVER

        return TierLevel.BRONZE

    @staticmethod
    def calculate_progress_to_next_tier(current_tier: str, current_points: int, rides: int,
                                       rating: float, acceptance: float) -> Dict:
        """Calculate progress to next tier"""
        tier_order = ["bronze", "silver", "gold", "platinum"]
        current_idx = tier_order.index(current_tier)

        if current_idx >= len(tier_order) - 1:
            return {
                "current_tier": current_tier,
                "next_tier": None,
                "progress_percentage": 100,
                "days_estimate": 0
            }

        next_tier = tier_order[current_idx + 1]
        next_config = TIER_CONFIG[next_tier]
        current_config = TIER_CONFIG[current_tier]

        points_needed = next_config["points_threshold"] - current_points

        # Estimate days (assuming 1 ride per day = ~150 points per day)
        days_estimate = max(1, int(points_needed / 150)) if points_needed > 0 else 0

        # Progress percentage
        if next_config["points_threshold"] > 0:
            progress_pct = int((current_points / next_config["points_threshold"]) * 100)
        else:
            progress_pct = 100

        return {
            "current_tier": current_tier,
            "next_tier": next_tier,
            "points_current": current_points,
            "points_required": next_config["points_threshold"],
            "points_needed": points_needed,
            "progress_percentage": min(progress_pct, 100),
            "rides_required": next_config["rides_required"],
            "rides_current": rides,
            "rides_needed": max(0, next_config["rides_required"] - rides),
            "rating_required": next_config["rating_required"],
            "rating_current": rating,
            "acceptance_required": next_config["acceptance_required"],
            "acceptance_current": acceptance,
            "days_estimate": days_estimate
        }

# ==================== ROUTER ====================

router = APIRouter(prefix="/api/v3/driver-tier", tags=["driver-tier"])

from sqlalchemy.orm import sessionmaker
SessionLocal = sessionmaker(bind=None)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==================== ENDPOINTS ====================

@router.get("/current/{driver_id}")
async def get_current_tier(driver_id: str, db: Session = Depends(get_db)):
    """Get driver's current tier with multiplier and benefits"""
    try:
        tier = db.query(DriverTier).filter(DriverTier.driver_id == driver_id).first()

        if not tier:
            # Create default tier for new driver
            tier = DriverTier(
                driver_id=driver_id,
                current_tier=TierLevel.BRONZE,
                tier_points=0
            )
            db.add(tier)
            db.commit()

        config = TIER_CONFIG[tier.current_tier.value]

        return {
            "driver_id": driver_id,
            "current_tier": tier.current_tier,
            "tier_name": config["name"],
            "tier_color": config["color"],
            "multiplier": config["multiplier"],
            "tier_points": tier.tier_points,
            "benefits": config["benefits"],
            "last_updated": tier.updated_at.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/progress/{driver_id}")
async def get_tier_progress(driver_id: str, db: Session = Depends(get_db)):
    """Get progress toward next tier"""
    try:
        tier = db.query(DriverTier).filter(DriverTier.driver_id == driver_id).first()

        if not tier:
            tier = DriverTier(driver_id=driver_id)
            db.add(tier)
            db.commit()

        progress = TierCalculator.calculate_progress_to_next_tier(
            tier.current_tier.value,
            tier.tier_points,
            tier.total_rides_completed,
            tier.average_rating,
            tier.acceptance_rate
        )

        return progress
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/benefits/{tier_level}")
async def get_tier_benefits(tier_level: str):
    """Get benefits for specific tier level"""
    try:
        if tier_level not in TIER_CONFIG:
            raise HTTPException(status_code=400, detail="Invalid tier level")

        config = TIER_CONFIG[tier_level]

        return {
            "tier": tier_level,
            "name": config["name"],
            "multiplier": config["multiplier"],
            "earning_percentage_boost": int((config["multiplier"] - 1.0) * 100),
            "requirements": {
                "rides": config["rides_required"],
                "rating": config["rating_required"],
                "acceptance_rate": config["acceptance_required"]
            },
            "benefits": config["benefits"],
            "color": config["color"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{driver_id}")
async def get_tier_history(driver_id: str, db: Session = Depends(get_db)):
    """Get tier upgrade history"""
    try:
        history = db.query(TierHistory).filter(
            TierHistory.driver_id == driver_id
        ).order_by(desc(TierHistory.upgrade_date)).all()

        return {
            "driver_id": driver_id,
            "upgrades": [
                {
                    "date": h.upgrade_date.isoformat(),
                    "from_tier": h.from_tier,
                    "to_tier": h.to_tier,
                    "metrics_at_upgrade": h.metrics_at_upgrade
                }
                for h in history
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/earnings-multiplier/{driver_id}")
async def get_earnings_multiplier(driver_id: str, db: Session = Depends(get_db)):
    """Get current earning multiplier for driver"""
    try:
        tier = db.query(DriverTier).filter(DriverTier.driver_id == driver_id).first()

        if not tier:
            multiplier = 1.0
        else:
            multiplier = TIER_CONFIG[tier.current_tier.value]["multiplier"]

        return {
            "driver_id": driver_id,
            "multiplier": multiplier,
            "percentage_boost": int((multiplier - 1.0) * 100)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/apply-multiplier/{ride_id}")
async def apply_multiplier(ride_id: str, base_fare: float, driver_id: str = Query(...),
                          db: Session = Depends(get_db)):
    """Apply tier multiplier to ride earnings"""
    try:
        tier = db.query(DriverTier).filter(DriverTier.driver_id == driver_id).first()
        multiplier = TIER_CONFIG[tier.current_tier.value]["multiplier"] if tier else 1.0

        final_fare = base_fare * multiplier

        return {
            "ride_id": ride_id,
            "base_fare": base_fare,
            "multiplier": multiplier,
            "final_fare": round(final_fare, 2),
            "earnings_boost": round(final_fare - base_fare, 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/check-upgrade/{driver_id}")
async def check_upgrade(driver_id: str, db: Session = Depends(get_db)):
    """Check and apply tier upgrade if eligible"""
    try:
        tier = db.query(DriverTier).filter(DriverTier.driver_id == driver_id).first()

        if not tier:
            raise HTTPException(status_code=404, detail="Driver not found")

        # Check eligibility
        eligible_tier = TierCalculator.check_tier_eligibility(
            tier.total_rides_completed,
            tier.average_rating,
            tier.acceptance_rate
        )

        upgraded = False
        if eligible_tier != tier.current_tier:
            # Record upgrade
            history = TierHistory(
                driver_id=driver_id,
                from_tier=tier.current_tier.value,
                to_tier=eligible_tier.value,
                metrics_at_upgrade={
                    "rides": tier.total_rides_completed,
                    "rating": tier.average_rating,
                    "acceptance": tier.acceptance_rate,
                    "earnings": tier.total_earnings
                }
            )
            db.add(history)

            # Update tier
            tier.current_tier = eligible_tier
            tier.tier_upgrade_date = datetime.utcnow()
            tier.updated_at = datetime.utcnow()
            db.commit()
            upgraded = True

        config = TIER_CONFIG[tier.current_tier.value]

        return {
            "driver_id": driver_id,
            "current_tier": tier.current_tier,
            "tier_name": config["name"],
            "upgraded": upgraded,
            "multiplier": config["multiplier"],
            "benefits": config["benefits"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dashboard/{driver_id}")
async def get_tier_dashboard(driver_id: str, db: Session = Depends(get_db)):
    """Get complete tier dashboard data"""
    try:
        tier = db.query(DriverTier).filter(DriverTier.driver_id == driver_id).first()

        if not tier:
            tier = DriverTier(driver_id=driver_id)
            db.add(tier)
            db.commit()

        config = TIER_CONFIG[tier.current_tier.value]
        progress = TierCalculator.calculate_progress_to_next_tier(
            tier.current_tier.value,
            tier.tier_points,
            tier.total_rides_completed,
            tier.average_rating,
            tier.acceptance_rate
        )

        return {
            "tier_info": {
                "current_tier": tier.current_tier,
                "tier_name": config["name"],
                "tier_color": config["color"],
                "multiplier": config["multiplier"],
                "earnings_boost_percentage": int((config["multiplier"] - 1.0) * 100),
                "tier_points": tier.tier_points
            },
            "progress": progress,
            "benefits": config["benefits"],
            "metrics": {
                "total_rides": tier.total_rides_completed,
                "average_rating": tier.average_rating,
                "acceptance_rate": tier.acceptance_rate,
                "total_earnings": tier.total_earnings
            },
            "last_updated": tier.updated_at.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
