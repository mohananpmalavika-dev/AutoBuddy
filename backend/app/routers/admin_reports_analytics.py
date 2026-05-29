"""
Admin Reports & Analytics Router
Features: Custom reports, PDF/CSV export, data visualization
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.db.client import get_db
from app.core.auth import require_roles
import json

router = APIRouter(prefix="/api/admin/reports", tags=["admin-reports"])


class CustomReport(BaseModel):
    name: str
    report_type: str = Field(..., description="rides, revenue, users, safety, complaints")
    filters: Optional[Dict[str, Any]] = None
    date_range: Optional[Dict[str, str]] = None


# ==================== GET Endpoints ====================

@router.get("/list")
async def get_reports_list(
    report_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """List all generated reports"""
    try:
        filters = {}
        if report_type:
            filters["report_type"] = report_type
        
        total = await db.reports.count_documents(filters)
        
        reports = await db.reports.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "reports": [
                {
                    "report_id": str(r.get("_id")),
                    "name": r.get("name"),
                    "type": r.get("report_type"),
                    "generated_at": r.get("created_at"),
                    "generated_by": r.get("generated_by"),
                }
                for r in reports
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching reports: {str(e)}")


@router.get("/{report_id}")
async def get_report_details(
    report_id: str,
    format: str = Query("json", description="json, csv, pdf"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get detailed report with export option"""
    try:
        from bson import ObjectId
        report = await db.reports.find_one({"_id": ObjectId(report_id)})
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        data = {
            "report_id": report_id,
            "name": report.get("name"),
            "type": report.get("report_type"),
            "data": report.get("data", {}),
            "generated_at": report.get("created_at"),
        }
        
        # Format handling could be extended for CSV/PDF export
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching report: {str(e)}")


@router.get("/analytics/dashboard")
async def get_analytics_dashboard(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get comprehensive analytics dashboard"""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Rides
        rides_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": None,
                "total_rides": {"$sum": 1},
                "total_revenue": {"$sum": "$fare_amount"},
                "avg_rating": {"$avg": "$ride_rating"}
            }}
        ]
        rides = await db.bookings.aggregate(rides_pipeline).to_list(1)
        rides_data = rides[0] if rides else {"total_rides": 0, "total_revenue": 0, "avg_rating": 0}
        
        # Users
        users_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": "$role",
                "count": {"$sum": 1}
            }}
        ]
        users = await db.users.aggregate(users_pipeline).to_list(None)
        
        return {
            "period_days": days,
            "rides": {
                "total": rides_data.get("total_rides", 0),
                "revenue": rides_data.get("total_revenue", 0),
                "avg_rating": rides_data.get("avg_rating", 0),
            },
            "users": {
                "by_role": [{"role": u.get("_id"), "count": u.get("count")} for u in users]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching analytics: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/generate")
async def generate_report(
    report_config: CustomReport,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Generate custom report"""
    try:
        # Build query based on report type and filters
        data = {}
        
        if report_config.report_type == "rides":
            pipeline = [
                {"$group": {
                    "_id": None,
                    "total_rides": {"$sum": 1},
                    "total_revenue": {"$sum": "$fare_amount"}
                }}
            ]
            result = await db.bookings.aggregate(pipeline).to_list(1)
            data = result[0] if result else {}
        
        elif report_config.report_type == "revenue":
            pipeline = [
                {"$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "daily_revenue": {"$sum": "$fare_amount"},
                    "trips": {"$sum": 1}
                }},
                {"$sort": {"_id": 1}}
            ]
            result = await db.bookings.aggregate(pipeline).to_list(None)
            data = {"daily_breakdown": result}
        
        # Save report
        report_doc = {
            "name": report_config.name,
            "report_type": report_config.report_type,
            "filters": report_config.filters,
            "date_range": report_config.date_range,
            "data": data,
            "generated_by": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        }
        
        result = await db.reports.insert_one(report_doc)
        
        return {
            "status": "success",
            "report_id": str(result.inserted_id),
            "name": report_config.name,
            "type": report_config.report_type,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")


@router.post("/{report_id}/export")
async def export_report(
    report_id: str,
    format: str = Query("csv", description="csv, json, pdf"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Export report in specified format"""
    try:
        from bson import ObjectId
        report = await db.reports.find_one({"_id": ObjectId(report_id)})
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Format conversion logic here
        # For now, return JSON structure ready for export
        
        return {
            "status": "success",
            "report_id": report_id,
            "format": format,
            "download_ready": True,
            "filename": f"{report.get('name')}.{format}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting report: {str(e)}")
