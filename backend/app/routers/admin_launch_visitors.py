"""
Admin Launch Visitors - Enhanced analytics with geo heatmap and device tracking
"""
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/admin/launch-visitors", tags=["admin_launch_visitors"])


def _utc_now() -> datetime:
    return get_ist_now()


async def get_launch_visitors_report(
    db: AsyncIOMotorDatabase,
    days: int = 30,
) -> Dict[str, Any]:
    """Get comprehensive launch visitors report with geo and device data"""
    start_date = _utc_now() - timedelta(days=max(1, min(days, 365)))
    
    visitors_collection = db["launch_visitors"]
    
    # Get summary statistics
    total_clicks = await visitors_collection.count_documents({
        "clicked_at": {"$gte": start_date}
    })
    
    unique_ips = await visitors_collection.distinct(
        "ip_address",
        {"clicked_at": {"$gte": start_date}}
    )
    
    known_visitors = await visitors_collection.count_documents({
        "clicked_at": {"$gte": start_date},
        "user_id": {"$exists": True, "$ne": None}
    })
    
    # Get daily breakdown
    pipeline = [
        {
            "$match": {
                "clicked_at": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$clicked_at"
                    }
                },
                "clicks": {"$sum": 1},
                "unique_ips": {"$addToSet": "$ip_address"},
                "known_users": {
                    "$sum": {
                        "$cond": [
                            {"$ne": ["$user_id", None]},
                            1,
                            0
                        ]
                    }
                }
            }
        },
        {
            "$sort": {"_id": 1}
        }
    ]
    
    daily_data = []
    async for doc in visitors_collection.aggregate(pipeline):
        daily_data.append({
            "date": doc.get("_id"),
            "clicks": doc.get("clicks", 0),
            "unique_ips": len(doc.get("unique_ips", [])),
            "known_users": doc.get("known_users", 0),
        })
    
    # Get device type distribution
    device_pipeline = [
        {
            "$match": {
                "clicked_at": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": "$device_type",
                "count": {"$sum": 1}
            }
        },
        {
            "$sort": {"count": -1}
        }
    ]
    
    device_dist = {}
    async for doc in visitors_collection.aggregate(device_pipeline):
        device_type = doc.get("_id", "unknown")
        device_dist[device_type] = doc.get("count", 0)
    
    # Get browser distribution
    browser_pipeline = [
        {
            "$match": {
                "clicked_at": {"$gte": start_date}
            }
        },
        {
            "$group": {
                "_id": "$browser",
                "count": {"$sum": 1}
            }
        },
        {
            "$sort": {"count": -1}
        },
        {
            "$limit": 10
        }
    ]
    
    browser_dist = {}
    async for doc in visitors_collection.aggregate(browser_pipeline):
        browser_name = doc.get("_id", "unknown")
        browser_dist[browser_name] = doc.get("count", 0)
    
    # Get geographic distribution (geo heatmap data)
    geo_pipeline = [
        {
            "$match": {
                "clicked_at": {"$gte": start_date},
                "latitude": {"$exists": True, "$ne": None},
                "longitude": {"$exists": True, "$ne": None}
            }
        },
        {
            "$group": {
                "_id": {
                    "latitude": "$latitude",
                    "longitude": "$longitude",
                    "city": "$city",
                    "district": "$district"
                },
                "count": {"$sum": 1}
            }
        },
        {
            "$sort": {"count": -1}
        },
        {
            "$limit": 100
        }
    ]
    
    geo_heatmap = []
    async for doc in visitors_collection.aggregate(geo_pipeline):
        geo_data = doc.get("_id", {})
        geo_heatmap.append({
            "latitude": geo_data.get("latitude"),
            "longitude": geo_data.get("longitude"),
            "city": geo_data.get("city"),
            "district": geo_data.get("district"),
            "clicks": doc.get("count", 0),
            "intensity": min(doc.get("count", 0) / max(1, len(unique_ips)) * 100, 100)
        })
    
    # Get top districts
    district_pipeline = [
        {
            "$match": {
                "clicked_at": {"$gte": start_date},
                "district": {"$exists": True, "$ne": None}
            }
        },
        {
            "$group": {
                "_id": "$district",
                "clicks": {"$sum": 1},
                "unique_visitors": {"$addToSet": "$ip_address"}
            }
        },
        {
            "$sort": {"clicks": -1}
        },
        {
            "$limit": 14
        }
    ]
    
    district_data = {}
    async for doc in visitors_collection.aggregate(district_pipeline):
        district_name = doc.get("_id")
        district_data[district_name] = {
            "clicks": doc.get("clicks", 0),
            "unique_visitors": len(doc.get("unique_visitors", []))
        }
    
    # Get recent clicks
    recent_clicks = []
    async for doc in visitors_collection.find(
        {"clicked_at": {"$gte": start_date}}
    ).sort("clicked_at", -1).limit(50):
        recent_clicks.append({
            "ip_address": doc.get("ip_address"),
            "user_id": doc.get("user_id"),
            "user_name": doc.get("user_name"),
            "device_type": doc.get("device_type"),
            "browser": doc.get("browser"),
            "city": doc.get("city"),
            "district": doc.get("district"),
            "clicked_at": doc.get("clicked_at", _utc_now()).isoformat(),
        })
    
    # Get conversion rate (clicks to registration)
    users_collection = db["users"]
    registered_from_clicks = await users_collection.count_documents({
        "created_at": {"$gte": start_date},
        "source": "launch_visitor"
    })
    
    conversion_rate = (
        (registered_from_clicks / total_clicks * 100)
        if total_clicks > 0 else 0
    )
    
    return {
        "summary": {
            "total_clicks": total_clicks,
            "unique_ips": len(unique_ips),
            "unique_visitors": len(unique_ips),
            "known_visitors": known_visitors,
            "unknown_visitors": len(unique_ips) - known_visitors,
            "conversion_to_registration": round(conversion_rate, 2),
            "registered_from_clicks": registered_from_clicks,
        },
        "daily": daily_data,
        "device_distribution": device_dist,
        "browser_distribution": browser_dist,
        "geographic_heatmap": geo_heatmap,
        "district_distribution": district_data,
        "recent_clicks": recent_clicks,
        "generated_at": _utc_now().isoformat() + "Z",
    }


@router.get("/report")
async def get_launch_visitors_report_endpoint(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get comprehensive launch visitors report with geo and device tracking"""
    _ = admin_user
    return await get_launch_visitors_report(db, days)


@router.get("/device-breakdown")
async def get_device_breakdown(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get detailed device type breakdown"""
    _ = admin_user
    report = await get_launch_visitors_report(db, days)
    return {
        "device_distribution": report.get("device_distribution", {}),
        "browser_distribution": report.get("browser_distribution", {}),
    }


@router.get("/geo-heatmap")
async def get_geo_heatmap(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get geographic heatmap for visitor distribution"""
    _ = admin_user
    report = await get_launch_visitors_report(db, days)
    return {
        "heatmap_points": report.get("geographic_heatmap", []),
        "district_distribution": report.get("district_distribution", {}),
    }


@router.get("/conversion-funnel")
async def get_conversion_funnel(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get conversion funnel from click to registration"""
    _ = admin_user
    report = await get_launch_visitors_report(db, days)
    summary = report.get("summary", {})
    
    return {
        "funnel": {
            "total_clicks": summary.get("total_clicks", 0),
            "unique_visitors": summary.get("unique_visitors", 0),
            "registered_from_clicks": summary.get("registered_from_clicks", 0),
            "conversion_rate_percent": summary.get("conversion_to_registration", 0),
        },
    }
