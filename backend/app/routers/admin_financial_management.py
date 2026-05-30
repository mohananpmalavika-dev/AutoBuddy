"""
Admin Financial Management Router
Features: Revenue tracking, settlements, reconciliation, payouts
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api/admin/financial", tags=["admin-financial"])


class PayoutProcessing(BaseModel):
    driver_ids: List[str]
    payout_date: str
    payment_method: str = Field(..., description="bank_transfer, wallet, upi")


class ReconciliationReport(BaseModel):
    period_start: str
    period_end: str
    reconciliation_type: str = Field(..., description="daily, weekly, monthly")


# ==================== GET Endpoints ====================

@router.get("/revenue/dashboard")
async def get_revenue_dashboard(
    period: str = Query("monthly", description="daily, weekly, monthly"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get comprehensive revenue dashboard"""
    try:
        # Calculate date range
        now = get_ist_now()
        if period == "daily":
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "weekly":
            start_date = now - timedelta(days=now.weekday())
        else:  # monthly
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Revenue pipeline
        revenue_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": None,
                "total_revenue": {"$sum": "$fare_amount"},
                "platform_commission": {"$sum": {"$multiply": ["$fare_amount", 0.15]}},
                "driver_earnings": {"$sum": {"$multiply": ["$fare_amount", 0.85]}},
                "total_trips": {"$sum": 1}
            }}
        ]
        
        revenue = await db.bookings.aggregate(revenue_pipeline).to_list(1)
        revenue_data = revenue[0] if revenue else {"total_revenue": 0, "platform_commission": 0, "driver_earnings": 0, "total_trips": 0}
        
        return {
            "period": period,
            "date_range": {"start": start_date, "end": now},
            "revenue": {
                "total": revenue_data.get("total_revenue", 0),
                "platform_commission": revenue_data.get("platform_commission", 0),
                "driver_payouts": revenue_data.get("driver_earnings", 0),
            },
            "trips": revenue_data.get("total_trips", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching revenue: {str(e)}")


@router.get("/settlements/pending")
async def get_pending_settlements(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get pending driver settlements"""
    try:
        total = await db.driver_earnings.count_documents({"pending_amount": {"$gt": 0}})
        
        settlements = await db.driver_earnings.find(
            {"pending_amount": {"$gt": 0}}
        ).sort("last_settlement", ASCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "settlements": [
                {
                    "driver_id": s.get("driver_id"),
                    "pending_amount": s.get("pending_amount", 0),
                    "last_settlement": s.get("last_settlement"),
                    "total_settled": s.get("total_paid", 0),
                }
                for s in settlements
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching settlements: {str(e)}")


@router.get("/reconciliation/{period_id}")
async def get_reconciliation_report(
    period_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get detailed reconciliation report"""
    try:
        report = await db.reconciliation_reports.find_one({"_id": period_id})
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return {
            "period_id": period_id,
            "period": report.get("period"),
            "date_range": report.get("date_range"),
            "summary": {
                "total_bookings": report.get("total_bookings"),
                "total_revenue": report.get("total_revenue"),
                "total_payouts": report.get("total_payouts"),
                "discrepancies": report.get("discrepancies", 0),
            },
            "breakdown": report.get("breakdown", {}),
            "generated_at": report.get("created_at"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching report: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/settlements/process-payouts")
async def process_payouts(
    payout_info: PayoutProcessing,
    dry_run: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Process payouts for drivers"""
    try:
        results = {"processed": [], "failed": [], "total_amount": 0}
        
        for driver_id in payout_info.driver_ids:
            earnings = await db.driver_earnings.find_one({"driver_id": driver_id})
            if not earnings or earnings.get("pending_amount", 0) <= 0:
                results["failed"].append({"driver_id": driver_id, "error": "No pending amount"})
                continue
            
            if not dry_run:
                payout_amount = earnings.get("pending_amount", 0)
                
                # Create payout record
                await db.driver_payouts.insert_one({
                    "driver_id": driver_id,
                    "amount": payout_amount,
                    "method": payout_info.payment_method,
                    "payout_date": datetime.fromisoformat(payout_info.payout_date),
                    "status": "completed",
                    "created_at": get_ist_now(),
                })
                
                # Update earnings
                await db.driver_earnings.update_one(
                    {"driver_id": driver_id},
                    {
                        "$inc": {"total_paid": payout_amount, "pending_amount": -payout_amount},
                        "$set": {"last_settlement": get_ist_now()}
                    }
                )
            
            results["processed"].append(driver_id)
            results["total_amount"] += earnings.get("pending_amount", 0)
        
        return {
            "status": "completed",
            "dry_run": dry_run,
            "processed": len(results["processed"]),
            "failed": len(results["failed"]),
            "total_amount": results["total_amount"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing payouts: {str(e)}")


@router.post("/reconciliation/generate")
async def generate_reconciliation(
    reconciliation: ReconciliationReport,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Generate reconciliation report"""
    try:
        start = datetime.fromisoformat(reconciliation.period_start)
        end = datetime.fromisoformat(reconciliation.period_end)
        
        # Generate report
        pipeline = [
            {"$match": {"created_at": {"$gte": start, "$lte": end}}},
            {"$group": {
                "_id": None,
                "total_bookings": {"$sum": 1},
                "total_revenue": {"$sum": "$fare_amount"},
                "total_commission": {"$sum": {"$multiply": ["$fare_amount", 0.15]}},
            }}
        ]
        
        report_data = await db.bookings.aggregate(pipeline).to_list(1)
        data = report_data[0] if report_data else {"total_bookings": 0, "total_revenue": 0, "total_commission": 0}
        
        report_id = f"reconciliation_{start.timestamp()}"
        
        await db.reconciliation_reports.insert_one({
            "_id": report_id,
            "period": reconciliation.reconciliation_type,
            "date_range": {"start": start, "end": end},
            "total_bookings": data.get("total_bookings", 0),
            "total_revenue": data.get("total_revenue", 0),
            "total_payouts": 0,
            "discrepancies": 0,
            "created_at": get_ist_now(),
        })
        
        return {
            "status": "success",
            "report_id": report_id,
            "summary": data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")
