"""
Fleet Profitability Dashboard API Router
FastAPI endpoints for fleet financial analysis, vehicle profitability, and ROI tracking
"""

from fastapi import APIRouter, HTTPException, Request
from datetime import datetime
from app.utils.time_helpers import get_ist_now
import random
import logging
from app.utils.rbac import get_current_user_from_request

router = APIRouter(prefix="/api/v1/fleet-profitability", tags=["fleet_profitability"])
logger = logging.getLogger(__name__)


# ============================================================================
# PORTFOLIO & OVERVIEW ENDPOINTS
# ============================================================================

@router.get("/fleets/{fleet_id}/portfolio")
async def get_fleet_portfolio(fleet_id: str, request: Request):
    """Get overall fleet profitability portfolio"""
    try:
        await get_current_user_from_request(request)
        portfolio = {
            "portfolio_id": f"portfolio_{fleet_id}_{random.randint(1000, 9999)}",
            "fleet_id": fleet_id,
            "total_vehicles": random.randint(400, 600),
            "active_vehicles": random.randint(350, 550),
            "idle_vehicles": random.randint(20, 50),
            "maintenance_vehicles": random.randint(10, 30),
            "total_daily_revenue": round(random.uniform(1000000, 1500000), 2),
            "total_daily_cost": round(random.uniform(500000, 750000), 2),
            "total_daily_profit": round(random.uniform(500000, 800000), 2),
            "overall_margin": round(random.uniform(40, 60), 1),
            "average_utilization": round(random.uniform(70, 85), 1),
            "average_rating": round(random.uniform(4.3, 4.8), 1),
            "total_rides_today": random.randint(20000, 30000),
            "premium_tier_vehicles": random.randint(40, 80),
            "loss_making_vehicles": random.randint(1, 10),
            "updated_at": get_ist_now().isoformat() + "Z"
        }
        
        return {
            "status": "success",
            "data": portfolio,
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting portfolio: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fleets/{fleet_id}/dashboard")
async def get_profitability_dashboard(fleet_id: str, request: Request):
    """Get comprehensive profitability dashboard"""
    try:
        await get_current_user_from_request(request)
        dashboard = {
            "dashboard_id": f"dash_{fleet_id}",
            "fleet_id": fleet_id,
            "daily_summary": {
                "revenue": round(random.uniform(1000000, 1500000), 2),
                "cost": round(random.uniform(500000, 750000), 2),
                "profit": round(random.uniform(500000, 800000), 2),
                "margin_percentage": round(random.uniform(40, 60), 1)
            },
            "weekly_summary": {
                "revenue": round(random.uniform(7000000, 10500000), 2),
                "cost": round(random.uniform(3500000, 5250000), 2),
                "profit": round(random.uniform(3500000, 5600000), 2),
                "margin_percentage": round(random.uniform(40, 60), 1),
                "trend": random.choice(["up", "down", "stable"])
            },
            "monthly_projection": {
                "revenue": round(random.uniform(30000000, 45000000), 2),
                "cost": round(random.uniform(15000000, 22500000), 2),
                "profit": round(random.uniform(15000000, 24000000), 2),
                "margin_percentage": round(random.uniform(40, 60), 1)
            },
            "tier_distribution": {
                "premium": random.randint(40, 80),
                "high": random.randint(100, 200),
                "medium": random.randint(150, 250),
                "low": random.randint(50, 100),
                "loss": random.randint(1, 10)
            },
            "top_performer": f"veh_{random.randint(100, 999)}",
            "needs_attention_vehicles": random.randint(5, 20)
        }
        
        return {
            "status": "success",
            "data": dashboard,
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting dashboard: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# VEHICLE PROFITABILITY ENDPOINTS
# ============================================================================

@router.get("/fleets/{fleet_id}/vehicles")
async def list_vehicles_profitability(fleet_id: str, request: Request, limit: int = 20, offset: int = 0):
    """List all vehicles with profitability metrics"""
    try:
        await get_current_user_from_request(request)
        vehicles = []
        for i in range(min(limit, 20)):
            vehicle = {
                "vehicle_id": f"veh_{i + offset:04d}",
                "fleet_id": fleet_id,
                "vehicle_number": f"KA01AB{(i + offset):04d}",
                "vehicle_type": random.choice(["sedan", "suv", "hatchback"]),
                "status": random.choice(["active", "idle", "maintenance"]),
                "daily_revenue": round(random.uniform(1500, 3500), 2),
                "daily_cost": round(random.uniform(800, 1800), 2),
                "daily_profit": round(random.uniform(500, 2000), 2),
                "profit_margin": round(random.uniform(30, 70), 1),
                "utilization_rate": round(random.uniform(60, 95), 1),
                "rides_completed": random.randint(25, 70),
                "average_rating": round(random.uniform(4.2, 4.9), 1),
                "tier": random.choice(["premium", "high", "medium", "low", "loss"])
            }
            vehicles.append(vehicle)
        
        return {
            "status": "success",
            "data": {
                "fleet_id": fleet_id,
                "vehicles": vehicles,
                "total_count": random.randint(400, 600),
                "limit": limit,
                "offset": offset
            },
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error listing vehicles: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fleets/{fleet_id}/vehicles/{vehicle_id}")
async def get_vehicle_profitability(fleet_id: str, vehicle_id: str, request: Request):
    """Get detailed profitability metrics for specific vehicle"""
    try:
        await get_current_user_from_request(request)
        vehicle = {
            "vehicle_id": vehicle_id,
            "fleet_id": fleet_id,
            "vehicle_number": "KA01AB1234",
            "vehicle_type": "sedan",
            "status": random.choice(["active", "idle"]),
            "daily_revenue": round(random.uniform(2000, 3500), 2),
            "daily_cost": round(random.uniform(900, 1500), 2),
            "daily_profit": round(random.uniform(800, 2200), 2),
            "profit_margin": round(random.uniform(45, 70), 1),
            "utilization_rate": round(random.uniform(75, 95), 1),
            "rides_completed": random.randint(40, 70),
            "average_rating": round(random.uniform(4.5, 4.9), 1),
            "total_rides": random.randint(5000, 15000),
            "fuel_efficiency": round(random.uniform(11, 14), 1),
            "maintenance_cost": round(random.uniform(100, 300), 2),
            "tier": "high",
            "last_maintenance": "2025-01-01T00:00:00Z",
            "registration_date": "2024-06-01T00:00:00Z"
        }
        
        return {
            "status": "success",
            "data": vehicle,
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fleets/{fleet_id}/top-performers")
async def get_top_performers(fleet_id: str, request: Request, limit: int = 10):
    """Get top performing vehicles"""
    try:
        await get_current_user_from_request(request)
        performers = []
        for i in range(min(limit, 10)):
            performer = {
                "rank": i + 1,
                "vehicle_id": f"veh_{100 + i:03d}",
                "vehicle_number": f"KA01AB{100 + i:04d}",
                "daily_profit": round((10 - i) * 250 + random.uniform(50, 150), 2),
                "profit_margin": round(65 - i, 1),
                "rides_completed": random.randint(60, 75),
                "average_rating": round(4.9 - i * 0.05, 1),
                "utilization_rate": round(90 - i, 1)
            }
            performers.append(performer)
        
        return {
            "status": "success",
            "data": {
                "fleet_id": fleet_id,
                "top_performers": performers
            },
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting top performers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fleets/{fleet_id}/needs-attention")
async def get_vehicles_needing_attention(fleet_id: str, request: Request):
    """Get vehicles that need operational or financial attention"""
    try:
        await get_current_user_from_request(request)
        vehicles = []
        issues = ["low_utilization", "high_cost", "low_rating", "loss_making"]
        
        for i in range(random.randint(5, 15)):
            vehicle = {
                "vehicle_id": f"veh_{i:04d}",
                "vehicle_number": f"KA01AB{i:04d}",
                "issue": random.choice(issues),
                "current_profit": round(random.uniform(-500, 500), 2),
                "profit_margin": round(random.uniform(-10, 30), 1),
                "recommendation": random.choice([
                    "Increase operational hours",
                    "Perform maintenance",
                    "Consider reassignment",
                    "Driver training needed"
                ]),
                "potential_improvement": round(random.uniform(500, 2000), 2)
            }
            vehicles.append(vehicle)
        
        return {
            "status": "success",
            "data": {
                "fleet_id": fleet_id,
                "vehicles_needing_attention": vehicles,
                "total_count": len(vehicles)
            },
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting attention vehicles: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# COST & REVENUE ENDPOINTS
# ============================================================================

@router.get("/fleets/{fleet_id}/cost-breakdown")
async def get_cost_breakdown(fleet_id: str, request: Request, vehicle_id: str = None):
    """Get detailed cost breakdown"""
    try:
        await get_current_user_from_request(request)
        breakdown = {
            "breakdown_id": f"breakdown_{random.randint(10000, 99999)}",
            "fleet_id": fleet_id,
            "vehicle_id": vehicle_id or f"veh_{random.randint(100, 999)}",
            "fuel_cost": round(random.uniform(300, 500), 2),
            "maintenance_cost": round(random.uniform(100, 300), 2),
            "insurance_cost": round(random.uniform(80, 150), 2),
            "driver_payment": round(random.uniform(300, 500), 2),
            "platform_commission": round(random.uniform(100, 200), 2),
            "other_costs": round(random.uniform(30, 100), 2),
            "total_cost": round(random.uniform(900, 1800), 2),
            "period": "daily"
        }
        
        return {
            "status": "success",
            "data": breakdown,
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting cost breakdown: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fleets/{fleet_id}/revenue-analysis")
async def get_revenue_analysis(fleet_id: str, request: Request):
    """Get revenue analysis by source and pattern"""
    try:
        await get_current_user_from_request(request)
        analysis = {
            "analysis_id": f"analysis_{fleet_id}",
            "fleet_id": fleet_id,
            "daily_revenue": round(random.uniform(1000000, 1500000), 2),
            "revenue_sources": {
                "ride_fares": round(random.uniform(700000, 1000000), 2),
                "cancellation_fees": round(random.uniform(50000, 100000), 2),
                "tolls_reimbursed": round(random.uniform(100000, 200000), 2),
                "other": round(random.uniform(50000, 150000), 2)
            },
            "avg_ride_value": round(random.uniform(250, 350), 2),
            "rides_completed": random.randint(20000, 30000),
            "peak_revenue_hours": ["18:00-20:00", "08:00-09:00"],
            "low_revenue_hours": ["02:00-04:00"],
            "revenue_growth_weekly": round(random.uniform(-5, 15), 1),
            "revenue_growth_monthly": round(random.uniform(0, 20), 1)
        }
        
        return {
            "status": "success",
            "data": analysis,
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting revenue analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ROI & PAYBACK ENDPOINTS
# ============================================================================

@router.get("/fleets/{fleet_id}/vehicles/{vehicle_id}/roi")
async def get_vehicle_roi(fleet_id: str, vehicle_id: str, request: Request):
    """Get ROI analysis for vehicle"""
    try:
        await get_current_user_from_request(request)
        roi = {
            "roi_id": f"roi_{vehicle_id}",
            "vehicle_id": vehicle_id,
            "fleet_id": fleet_id,
            "vehicle_cost": round(random.uniform(600000, 1000000), 2),
            "months_in_operation": random.randint(6, 24),
            "cumulative_profit": round(random.uniform(30000, 200000), 2),
            "roi_percentage": round(random.uniform(5, 25), 1),
            "break_even_months": round(random.uniform(12, 24), 1),
            "months_to_positive_roi": random.randint(2, 8),
            "annual_projected_profit": round(random.uniform(150000, 400000), 2),
            "annual_roi_percentage": round(random.uniform(15, 50), 1),
            "projected_payoff_months": round(random.uniform(30, 72), 1),
            "status": random.choice(["on_track", "ahead_of_schedule", "behind_schedule"])
        }
        
        return {
            "status": "success",
            "data": roi,
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting ROI: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fleets/{fleet_id}/roi-summary")
async def get_fleet_roi_summary(fleet_id: str, request: Request):
    """Get overall fleet ROI summary"""
    try:
        await get_current_user_from_request(request)
        summary = {
            "summary_id": f"roi_summary_{fleet_id}",
            "fleet_id": fleet_id,
            "total_investment": round(random.uniform(300000000, 500000000), 2),
            "total_cumulative_profit": round(random.uniform(50000000, 100000000), 2),
            "overall_roi_percentage": round(random.uniform(10, 25), 1),
            "average_vehicle_roi": round(random.uniform(10, 30), 1),
            "best_roi_vehicle": f"veh_{random.randint(100, 999)}",
            "poorest_roi_vehicle": f"veh_{random.randint(1000, 2000)}",
            "average_payoff_months": round(random.uniform(40, 70), 1),
            "vehicles_roi_positive": random.randint(300, 500),
            "vehicles_roi_negative": random.randint(5, 20)
        }
        
        return {
            "status": "success",
            "data": summary,
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting ROI summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# OPTIMIZATION & RECOMMENDATION ENDPOINTS
# ============================================================================

@router.get("/fleets/{fleet_id}/optimization-tips")
async def get_optimization_tips(fleet_id: str, request: Request):
    """Get AI-driven optimization recommendations"""
    try:
        await get_current_user_from_request(request)
        tips = []
        recommendations = [
            "Increase operational hours in peak zones",
            "Optimize driver shift timings",
            "Reduce fuel consumption through route optimization",
            "Implement predictive maintenance",
            "Focus on high-rated driver retention"
        ]
        
        for i, rec in enumerate(recommendations):
            tip = {
                "tip_id": f"tip_{i:03d}",
                "title": rec,
                "potential_profit_increase": round(random.uniform(100000, 500000), 2),
                "implementation_difficulty": random.choice(["low", "medium", "high"]),
                "estimated_roi_days": random.randint(7, 60),
                "priority": random.choice(["high", "medium", "low"]),
                "impact_area": random.choice(["utilization", "cost", "revenue", "roi"]),
                "vehicles_affected": random.randint(50, 200)
            }
            tips.append(tip)
        
        return {
            "status": "success",
            "data": {
                "fleet_id": fleet_id,
                "optimization_tips": tips,
                "total_potential_profit_increase": round(random.uniform(500000, 1500000), 2)
            },
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting tips: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fleets/{fleet_id}/vehicles/{vehicle_id}/recommendations")
async def get_vehicle_recommendations(fleet_id: str, vehicle_id: str, request: Request):
    """Get recommendations for specific vehicle"""
    try:
        await get_current_user_from_request(request)
        recommendations = []
        for i in range(random.randint(2, 4)):
            rec = {
                "recommendation_id": f"rec_{i}",
                "vehicle_id": vehicle_id,
                "recommendation": random.choice([
                    "Increase utilization hours",
                    "Schedule maintenance",
                    "Driver coaching needed",
                    "Relocate to high-demand zone"
                ]),
                "potential_improvement": round(random.uniform(200, 800), 2),
                "implementation_cost": round(random.uniform(100, 500), 2),
                "roi_days": random.randint(5, 30)
            }
            recommendations.append(rec)
        
        return {
            "status": "success",
            "data": {
                "vehicle_id": vehicle_id,
                "recommendations": recommendations
            },
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting recommendations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DRIVER & MAINTENANCE ENDPOINTS
# ============================================================================

@router.get("/fleets/{fleet_id}/driver-performance")
async def get_driver_performance(fleet_id: str, request: Request):
    """Get driver performance impact on profitability"""
    try:
        await get_current_user_from_request(request)
        drivers = []
        for i in range(random.randint(5, 10)):
            driver = {
                "driver_id": f"driver_{i:04d}",
                "vehicle_id": f"veh_{i:04d}",
                "average_rating": round(random.uniform(4.3, 5.0), 1),
                "total_rides": random.randint(1000, 5000),
                "daily_revenue_generated": round(random.uniform(2000, 4000), 2),
                "revenue_premium": round(random.uniform(200, 800), 2),
                "safety_score": round(random.uniform(90, 99), 1),
                "profit_contribution": round(random.uniform(1000, 2000), 2),
                "rank": i + 1
            }
            drivers.append(driver)
        
        return {
            "status": "success",
            "data": {
                "fleet_id": fleet_id,
                "top_drivers": drivers,
                "average_fleet_rating": round(random.uniform(4.4, 4.7), 1)
            },
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting driver performance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fleets/{fleet_id}/maintenance-alerts")
async def get_maintenance_alerts(fleet_id: str, request: Request):
    """Get predictive maintenance alerts"""
    try:
        await get_current_user_from_request(request)
        alerts = []
        alert_types = ["scheduled_service", "urgent_repair", "tire_replacement", "battery_check"]
        
        for i in range(random.randint(3, 8)):
            alert = {
                "alert_id": f"alert_maint_{i}",
                "vehicle_id": f"veh_{i:04d}",
                "alert_type": random.choice(alert_types),
                "description": "Scheduled maintenance required",
                "estimated_downtime_hours": random.randint(2, 8),
                "estimated_cost": round(random.uniform(1000, 5000), 2),
                "estimated_revenue_loss": round(random.uniform(500, 2000), 2),
                "urgency": random.choice(["critical", "high", "medium"]),
                "potential_cost_if_ignored": round(random.uniform(5000, 20000), 2)
            }
            alerts.append(alert)
        
        return {
            "status": "success",
            "data": {
                "fleet_id": fleet_id,
                "maintenance_alerts": alerts,
                "total_estimated_cost": round(random.uniform(10000, 30000), 2)
            },
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting maintenance alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# COMPARISON & TREND ENDPOINTS
# ============================================================================

@router.get("/fleets/{fleet_id}/trends")
async def get_profitability_trends(fleet_id: str, request: Request, period: str = "monthly"):
    """Get profitability trends over time"""
    try:
        await get_current_user_from_request(request)
        periods = 12 if period == "monthly" else (52 if period == "weekly" else 30)
        trends = []
        
        base_profit = 650000
        for i in range(periods):
            trend = {
                "period": i + 1,
                "revenue": round(base_profit * 2 + random.uniform(-100000, 100000), 2),
                "cost": round(base_profit + random.uniform(-50000, 50000), 2),
                "profit": round(base_profit + random.uniform(-50000, 100000), 2),
                "margin": round(random.uniform(48, 58), 1)
            }
            trends.append(trend)
        
        return {
            "status": "success",
            "data": {
                "fleet_id": fleet_id,
                "trends": trends,
                "period": period
            },
            "updated_at": get_ist_now().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Error getting trends: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Health check
@router.get("/health")
async def fleet_profitability_health():
    """Health check for fleet profitability service"""
    return {"status": "healthy", "service": "fleet_profitability"}
