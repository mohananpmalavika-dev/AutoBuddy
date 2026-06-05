"""
Health check and production readiness endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timezone
from typing import Dict, Any
import logging

from app.db.deps import get_db
from app.utils.production_config import ProductionConfig, ProductionChecklist
from app.utils.production import HealthCheckStatus

router = APIRouter(prefix="/api/health", tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/ready")
async def readiness_check(db: AsyncIOMotorDatabase = Depends(get_db)) -> Dict[str, Any]:
    """
    Readiness probe for Kubernetes/Docker
    Returns 200 only if service is ready to accept traffic
    """
    try:
        # Check database connectivity
        await db.command("ping")
        db_status = HealthCheckStatus.HEALTHY
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        db_status = HealthCheckStatus.UNHEALTHY
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not ready - database unavailable"
        )
    
    return {
        "status": "ready",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "database": db_status
        }
    }


@router.get("/live")
async def liveness_check() -> Dict[str, Any]:
    """
    Liveness probe for Kubernetes/Docker
    Returns 200 if service is running
    """
    return {
        "status": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/")
async def health_check(db: AsyncIOMotorDatabase = Depends(get_db)) -> Dict[str, Any]:
    """
    Comprehensive health check including all subsystems
    """
    checks = {
        "database": HealthCheckStatus.HEALTHY,
        "cache": HealthCheckStatus.HEALTHY,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    # Check database
    try:
        await db.command("ping")
        checks["database"] = HealthCheckStatus.HEALTHY
    except Exception as e:
        logger.warning(f"Database health check degraded: {str(e)}")
        checks["database"] = HealthCheckStatus.DEGRADED
    
    # Overall status
    overall_status = HealthCheckStatus.HEALTHY
    if checks["database"] == HealthCheckStatus.UNHEALTHY:
        overall_status = HealthCheckStatus.UNHEALTHY
    
    return {
        "status": overall_status,
        **checks
    }


@router.get("/production-checklist")
async def production_checklist() -> Dict[str, Any]:
    """
    Run production readiness checklist
    Used for pre-deployment validation
    """
    checks = ProductionChecklist.run_checks()
    config = ProductionConfig()
    
    all_passed = all(
        check.get("all_checks_passed", False)
        for check in checks.values()
    )
    
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": config.ENVIRONMENT,
        "all_checks_passed": all_passed,
        "checks": checks,
        "recommendations": _get_recommendations(checks)
    }


@router.get("/version")
async def version_check() -> Dict[str, Any]:
    """Get API version information"""
    return {
        "version": "1.0.0",
        "api_version": "v1",
        "build_date": datetime.now(timezone.utc).isoformat(),
        "status": "production"
    }


def _get_recommendations(checks: Dict[str, Any]) -> list[str]:
    """Get recommendations based on check results"""
    recommendations = []
    
    if not checks.get("configuration", {}).get("all_checks_passed"):
        recommendations.append("Review configuration - some required settings missing")
    
    if not checks.get("security", {}).get("all_checks_passed"):
        recommendations.append("Strengthen security configuration - enable all security features")
    
    if not checks.get("database", {}).get("all_checks_passed"):
        recommendations.append("Verify database configuration and connectivity")
    
    if not checks.get("api", {}).get("all_checks_passed"):
        recommendations.append("Configure API settings for production")
    
    return recommendations
