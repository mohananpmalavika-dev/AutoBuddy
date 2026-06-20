from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy import func, and_, desc, asc
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from decimal import Decimal
import json
import uuid
from enum import Enum

# Database Models
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, Boolean, Enum as SQLEnum

Base = declarative_base()

# ==================== DATABASE MODELS ====================

class MetricTypeEnum(str, Enum):
    SCORECARD = "scorecard"
    TRIP_ANALYTICS = "trip_analytics"
    BEHAVIOR = "behavior"
    IMPROVEMENT = "improvement"

class PriorityEnum(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class BehaviorPatternTypeEnum(str, Enum):
    PEAK_HOURS = "peak_hours"
    ZONE_PREFERENCE = "zone_preference"
    CONSISTENCY = "consistency"
    ACCEPTANCE_PATTERN = "acceptance_pattern"

class SuggestionCategoryEnum(str, Enum):
    EARNINGS = "earnings"
    RATING = "rating"
    CONSISTENCY = "consistency"
    SAFETY = "safety"
    EFFICIENCY = "efficiency"

class DriverPerformanceInsight(Base):
    __tablename__ = "driver_performance_insights"

    insight_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String, nullable=False, index=True)
    metric_type = Column(SQLEnum(MetricTypeEnum), nullable=False)
    score = Column(Integer, nullable=False)  # 0-100
    details = Column(JSON, nullable=True)
    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    period = Column(String, nullable=False)  # day/week/month

class TripAnalytics(Base):
    __tablename__ = "trip_analytics"

    trip_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String, nullable=False, index=True)
    ride_id = Column(String, nullable=True)
    trip_duration_minutes = Column(Integer, nullable=False)
    trip_distance_km = Column(Float, nullable=False)
    earnings = Column(Float, nullable=False)
    rating_received = Column(Float, nullable=True)
    efficiency_score = Column(Integer, nullable=False)  # earnings per km
    on_time_score = Column(Integer, nullable=False)  # 0-100
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class DriverBehaviorPattern(Base):
    __tablename__ = "driver_behavior_patterns"

    pattern_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String, nullable=False, index=True)
    pattern_type = Column(SQLEnum(BehaviorPatternTypeEnum), nullable=False)
    description = Column(String, nullable=False)
    frequency_percentage = Column(Integer, nullable=False)  # 0-100
    trend = Column(String, nullable=False)  # up/down/stable
    last_updated = Column(DateTime, nullable=False, default=datetime.utcnow)

class PerformanceBenchmark(Base):
    __tablename__ = "performance_benchmarks"

    benchmark_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    vehicle_type = Column(String, nullable=False)
    metric_name = Column(String, nullable=False)
    percentile_50 = Column(Float, nullable=False)
    percentile_75 = Column(Float, nullable=False)
    percentile_90 = Column(Float, nullable=False)
    percentile_95 = Column(Float, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class ImprovementSuggestion(Base):
    __tablename__ = "improvement_suggestions"

    suggestion_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String, nullable=False, index=True)
    category = Column(SQLEnum(SuggestionCategoryEnum), nullable=False)
    priority = Column(SQLEnum(PriorityEnum), nullable=False)
    suggestion_text = Column(String, nullable=False)
    expected_impact = Column(String, nullable=False)
    confidence_score = Column(Integer, nullable=False)  # 0-100
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    acknowledged = Column(Boolean, default=False)

# ==================== CALCULATION FUNCTIONS ====================

class PerformanceCalculator:
    @staticmethod
    def calculate_scorecard(driver_id: str, db: Session, days: int = 30) -> Dict:
        """Calculate comprehensive performance scorecard (6 metrics, 100 total points)"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)

        # Fetch all trips for driver in period
        trips = db.query(TripAnalytics).filter(
            and_(
                TripAnalytics.driver_id == driver_id,
                TripAnalytics.created_at >= cutoff_date
            )
        ).all()

        if not trips:
            return {
                "overall_score": 0,
                "acceptance_rate_score": 0,
                "completion_rate_score": 0,
                "rating_score": 0,
                "consistency_score": 0,
                "efficiency_score": 0,
                "reliability_score": 0,
                "trend": "neutral"
            }

        total_trips = len(trips)

        # Calculate individual scores
        avg_rating = sum([t.rating_received for t in trips if t.rating_received]) / len([t for t in trips if t.rating_received]) if any(t.rating_received for t in trips) else 3.0
        rating_score = min(20, (avg_rating / 5.0) * 20)

        # Acceptance rate (assume based on completion - simplified)
        completion_rate_score = min(20, 20)  # Assume 100% for trips calculated

        # Efficiency score
        avg_earnings_per_km = sum([t.earnings / t.trip_distance_km for t in trips]) / len(trips) if trips else 0
        efficiency_score = min(15, (avg_earnings_per_km / 50.0) * 15) if avg_earnings_per_km > 0 else 0

        # Reliability score (on-time delivery)
        avg_on_time_score = sum([t.on_time_score for t in trips]) / len(trips) if trips else 0
        reliability_score = min(10, (avg_on_time_score / 100.0) * 10)

        # Consistency score (std deviation of daily earnings)
        daily_earnings = {}
        for trip in trips:
            date_key = trip.created_at.date()
            if date_key not in daily_earnings:
                daily_earnings[date_key] = 0
            daily_earnings[date_key] += trip.earnings

        if len(daily_earnings) > 1:
            mean_daily = sum(daily_earnings.values()) / len(daily_earnings)
            variance = sum([(v - mean_daily) ** 2 for v in daily_earnings.values()]) / len(daily_earnings)
            std_dev = variance ** 0.5
            consistency_score = min(15, 15 - (std_dev / 1000.0) * 5)  # Inverse correlation
        else:
            consistency_score = 10

        # Acceptance rate score (placeholder - would need offer data)
        acceptance_rate_score = 18  # Default high

        overall_score = int(
            rating_score +
            acceptance_rate_score +
            completion_rate_score +
            consistency_score +
            efficiency_score +
            reliability_score
        )

        # Trend calculation (compare to previous period)
        prev_cutoff = cutoff_date - timedelta(days=days)
        prev_trips = db.query(TripAnalytics).filter(
            and_(
                TripAnalytics.driver_id == driver_id,
                TripAnalytics.created_at.between(prev_cutoff, cutoff_date)
            )
        ).all()

        trend = "stable"
        if prev_trips:
            prev_score = (sum([t.rating_received for t in prev_trips if t.rating_received]) / len([t for t in prev_trips if t.rating_received])) * 4 if any(t.rating_received for t in prev_trips) else 0
            current_score = (sum([t.rating_received for t in trips if t.rating_received]) / len([t for t in trips if t.rating_received])) if any(t.rating_received for t in trips) else 0
            if current_score > prev_score + 0.2:
                trend = "up"
            elif current_score < prev_score - 0.2:
                trend = "down"

        return {
            "overall_score": min(100, overall_score),
            "acceptance_rate_score": int(acceptance_rate_score),
            "completion_rate_score": int(completion_rate_score),
            "rating_score": int(rating_score),
            "consistency_score": int(consistency_score),
            "efficiency_score": int(efficiency_score),
            "reliability_score": int(reliability_score),
            "trend": trend
        }

    @staticmethod
    def calculate_behavior_patterns(driver_id: str, db: Session, days: int = 30) -> List[Dict]:
        """Detect behavior patterns from trip data"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        trips = db.query(TripAnalytics).filter(
            and_(
                TripAnalytics.driver_id == driver_id,
                TripAnalytics.created_at >= cutoff_date
            )
        ).all()

        patterns = []

        if not trips:
            return patterns

        # Peak hours analysis
        hour_distribution = {}
        for trip in trips:
            hour = trip.created_at.hour
            hour_distribution[hour] = hour_distribution.get(hour, 0) + 1

        if hour_distribution:
            avg_trips_per_hour = sum(hour_distribution.values()) / 24
            peak_hours = [h for h, count in hour_distribution.items() if count > avg_trips_per_hour * 1.5]
            if peak_hours:
                patterns.append({
                    "pattern_type": "peak_hours",
                    "description": f"Most active between {min(peak_hours)}:00 - {max(peak_hours)+1}:00",
                    "frequency_percentage": int((len(peak_hours) / 24) * 100),
                    "trend": "stable"
                })

        # Consistency pattern
        daily_trip_count = {}
        for trip in trips:
            date_key = trip.created_at.date()
            daily_trip_count[date_key] = daily_trip_count.get(date_key, 0) + 1

        if daily_trip_count:
            avg_daily = sum(daily_trip_count.values()) / len(daily_trip_count)
            variance = sum([(v - avg_daily) ** 2 for v in daily_trip_count.values()]) / len(daily_trip_count)
            std_dev = (variance ** 0.5) / avg_daily if avg_daily > 0 else 0

            consistency = "high" if std_dev < 0.3 else ("medium" if std_dev < 0.6 else "low")
            patterns.append({
                "pattern_type": "consistency",
                "description": f"{consistency.capitalize()} consistency in daily ride count",
                "frequency_percentage": int((1 - min(std_dev, 1)) * 100),
                "trend": "stable"
            })

        return patterns

    @staticmethod
    def generate_suggestions(driver_id: str, scorecard: Dict, patterns: List[Dict], db: Session) -> List[Dict]:
        """Generate AI-driven suggestions based on performance metrics"""
        suggestions = []

        # Rule-based suggestion generation
        if scorecard["rating_score"] < 12:  # rating < 4.0
            suggestions.append({
                "category": "rating",
                "priority": "high",
                "suggestion_text": "Your rating is below 4.0. Focus on arriving on time and maintaining vehicle cleanliness.",
                "expected_impact": "Improve rating by 0.5-1.0 stars within 2 weeks",
                "confidence_score": 90
            })

        if scorecard["efficiency_score"] < 8:  # Low efficiency
            suggestions.append({
                "category": "earnings",
                "priority": "medium",
                "suggestion_text": "Optimize your route efficiency to earn more per km.",
                "expected_impact": "Increase earnings by 10-15%",
                "confidence_score": 85
            })

        if scorecard["reliability_score"] < 6:  # Poor on-time
            suggestions.append({
                "category": "consistency",
                "priority": "medium",
                "suggestion_text": "Deliver passengers on time to improve ratings and earnings.",
                "expected_impact": "Improve on-time score by 15-20%",
                "confidence_score": 80
            })

        if scorecard["overall_score"] < 60:
            suggestions.append({
                "category": "consistency",
                "priority": "high",
                "suggestion_text": "Your overall performance score is below average. Focus on completing more rides and maintaining quality.",
                "expected_impact": "Improve overall score by 20-30 points",
                "confidence_score": 95
            })

        # Limit to 5 suggestions
        return suggestions[:5]

# ==================== ROUTER ====================

router = APIRouter(prefix="/api/v3/driver-insights", tags=["driver-insights"])

# Dependency for database session
from sqlalchemy.orm import sessionmaker
SessionLocal = sessionmaker(bind=None)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==================== ENDPOINTS ====================

@router.get("/scorecard/{driver_id}")
async def get_scorecard(driver_id: str, period: int = Query(30, description="Days to analyze"), db: Session = Depends(get_db)):
    """Get driver performance scorecard with 6 subscores"""
    try:
        scorecard = PerformanceCalculator.calculate_scorecard(driver_id, db, period)

        # Get peer percentile
        all_scorecards = db.query(func.avg(DriverPerformanceInsight.score)).filter(
            DriverPerformanceInsight.metric_type == MetricTypeEnum.SCORECARD
        ).scalar()

        peer_percentile = 50
        if all_scorecards:
            higher_scores = db.query(func.count(DriverPerformanceInsight.score)).filter(
                and_(
                    DriverPerformanceInsight.metric_type == MetricTypeEnum.SCORECARD,
                    DriverPerformanceInsight.score <= scorecard["overall_score"]
                )
            ).scalar()
            total_drivers = db.query(func.count(DriverPerformanceInsight.driver_id.distinct())).filter(
                DriverPerformanceInsight.metric_type == MetricTypeEnum.SCORECARD
            ).scalar()
            peer_percentile = int((higher_scores / max(total_drivers, 1)) * 100) if total_drivers else 50

        return {
            **scorecard,
            "peer_percentile": peer_percentile,
            "last_updated": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/trip-analytics/{driver_id}")
async def get_trip_analytics(driver_id: str, days: int = Query(30), db: Session = Depends(get_db)):
    """Get detailed trip analytics for specified period"""
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        trips = db.query(TripAnalytics).filter(
            and_(
                TripAnalytics.driver_id == driver_id,
                TripAnalytics.created_at >= cutoff_date
            )
        ).order_by(desc(TripAnalytics.created_at)).all()

        if not trips:
            return {"trips": [], "aggregated_stats": {}}

        total_earnings = sum([t.earnings for t in trips])
        total_distance = sum([t.trip_distance_km for t in trips])
        total_duration = sum([t.trip_duration_minutes for t in trips])

        return {
            "trips": [
                {
                    "trip_id": t.trip_id,
                    "date": t.created_at.isoformat(),
                    "duration_minutes": t.trip_duration_minutes,
                    "distance_km": t.trip_distance_km,
                    "earnings": t.earnings,
                    "rating": t.rating_received,
                    "efficiency_score": t.efficiency_score,
                    "on_time_score": t.on_time_score
                }
                for t in trips
            ],
            "aggregated_stats": {
                "total_trips": len(trips),
                "total_earnings": total_earnings,
                "total_distance": total_distance,
                "total_duration_minutes": total_duration,
                "average_earnings_per_trip": total_earnings / len(trips),
                "average_distance_per_trip": total_distance / len(trips),
                "average_duration_per_trip": total_duration / len(trips),
                "average_efficiency_score": sum([t.efficiency_score for t in trips]) / len(trips),
                "average_rating": sum([t.rating_received for t in trips if t.rating_received]) / len([t for t in trips if t.rating_received]) if any(t.rating_received for t in trips) else None
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/behavior-patterns/{driver_id}")
async def get_behavior_patterns(driver_id: str, days: int = Query(30), db: Session = Depends(get_db)):
    """Get behavior patterns (peak hours, zones, consistency)"""
    try:
        patterns = PerformanceCalculator.calculate_behavior_patterns(driver_id, db, days)
        return {
            "patterns": patterns,
            "last_updated": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/benchmarks/{driver_id}")
async def get_benchmarks(driver_id: str, db: Session = Depends(get_db)):
    """Get driver metrics vs peer benchmarks (percentiles)"""
    try:
        scorecard = PerformanceCalculator.calculate_scorecard(driver_id, db)

        # Simplified benchmark (would aggregate across all drivers)
        benchmarks = {
            "driver_score": scorecard["overall_score"],
            "peer_percentiles": {
                "50th_percentile": 65,
                "75th_percentile": 78,
                "90th_percentile": 88,
                "95th_percentile": 95
            },
            "interpretation": {
                "your_position": "At 50th percentile" if scorecard["overall_score"] < 70 else "Above 75th percentile",
                "top_metric": "Rating" if scorecard["rating_score"] > 15 else "Efficiency",
                "needs_improvement": "Consistency" if scorecard["consistency_score"] < 10 else "Efficiency"
            }
        }

        return benchmarks
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/suggestions/{driver_id}")
async def get_suggestions(driver_id: str, db: Session = Depends(get_db)):
    """Get AI-driven improvement suggestions"""
    try:
        scorecard = PerformanceCalculator.calculate_scorecard(driver_id, db)
        patterns = PerformanceCalculator.calculate_behavior_patterns(driver_id, db)
        suggestions = PerformanceCalculator.generate_suggestions(driver_id, scorecard, patterns, db)

        return {
            "suggestions": suggestions,
            "total_count": len(suggestions),
            "by_priority": {
                "high": len([s for s in suggestions if s["priority"] == "high"]),
                "medium": len([s for s in suggestions if s["priority"] == "medium"]),
                "low": len([s for s in suggestions if s["priority"] == "low"])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/trip-details/{trip_id}")
async def get_trip_details(trip_id: str, db: Session = Depends(get_db)):
    """Get full trip analytics with breakdowns"""
    try:
        trip = db.query(TripAnalytics).filter(TripAnalytics.trip_id == trip_id).first()
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")

        return {
            "trip_id": trip.trip_id,
            "date": trip.created_at.isoformat(),
            "duration_minutes": trip.trip_duration_minutes,
            "distance_km": trip.trip_distance_km,
            "earnings": trip.earnings,
            "rating": trip.rating_received,
            "efficiency_score": trip.efficiency_score,
            "on_time_score": trip.on_time_score,
            "breakdown": {
                "earnings_per_km": trip.earnings / trip.trip_distance_km,
                "earnings_per_minute": trip.earnings / trip.trip_duration_minutes,
                "speed_kmh": (trip.trip_distance_km / trip.trip_duration_minutes) * 60 if trip.trip_duration_minutes > 0 else 0
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dashboard/{driver_id}")
async def get_full_dashboard(driver_id: str, days: int = Query(30), db: Session = Depends(get_db)):
    """Get complete driver insights dashboard (scorecard, analytics, suggestions, benchmarks)"""
    try:
        scorecard = PerformanceCalculator.calculate_scorecard(driver_id, db, days)
        trips = db.query(TripAnalytics).filter(
            and_(
                TripAnalytics.driver_id == driver_id,
                TripAnalytics.created_at >= datetime.utcnow() - timedelta(days=days)
            )
        ).all()
        patterns = PerformanceCalculator.calculate_behavior_patterns(driver_id, db, days)
        suggestions = PerformanceCalculator.generate_suggestions(driver_id, scorecard, patterns, db)

        return {
            "scorecard": scorecard,
            "trip_summary": {
                "total_trips": len(trips),
                "total_earnings": sum([t.earnings for t in trips]),
                "average_rating": sum([t.rating_received for t in trips if t.rating_received]) / len([t for t in trips if t.rating_received]) if any(t.rating_received for t in trips) else None
            },
            "behavior_patterns": patterns,
            "suggestions": suggestions,
            "benchmarks": {
                "your_position": "50th percentile",
                "peer_50th": 65,
                "peer_75th": 78
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/regenerate/{driver_id}")
async def regenerate_insights(driver_id: str, db: Session = Depends(get_db)):
    """Force recalculation of all insights for driver"""
    try:
        # Delete old insights
        db.query(DriverPerformanceInsight).filter(DriverPerformanceInsight.driver_id == driver_id).delete()

        # Recalculate
        scorecard = PerformanceCalculator.calculate_scorecard(driver_id, db)
        patterns = PerformanceCalculator.calculate_behavior_patterns(driver_id, db)
        suggestions = PerformanceCalculator.generate_suggestions(driver_id, scorecard, patterns, db)

        # Store new insights
        new_insight = DriverPerformanceInsight(
            driver_id=driver_id,
            metric_type=MetricTypeEnum.SCORECARD,
            score=scorecard["overall_score"],
            details=scorecard,
            period="month"
        )
        db.add(new_insight)
        db.commit()

        return {
            "status": "regenerated",
            "scorecard": scorecard,
            "suggestions_count": len(suggestions)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{driver_id}")
async def get_insights_history(driver_id: str, metric_type: str = Query("scorecard"), db: Session = Depends(get_db)):
    """Get historical insights with dates for trend tracking"""
    try:
        query = db.query(DriverPerformanceInsight).filter(
            DriverPerformanceInsight.driver_id == driver_id
        )

        if metric_type != "all":
            query = query.filter(DriverPerformanceInsight.metric_type == metric_type)

        insights = query.order_by(desc(DriverPerformanceInsight.generated_at)).limit(30).all()

        return {
            "insights": [
                {
                    "date": i.generated_at.isoformat(),
                    "score": i.score,
                    "metric_type": i.metric_type,
                    "details": i.details
                }
                for i in insights
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
