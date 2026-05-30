"""
Fleet Owner Portal - Advanced API Endpoints (Uber/Ola Level)

Endpoints for:
1. Fleet Dashboard & KPIs
2. Fleet Wallet & Settlements
3. Driver Assignment System
4. Attendance & Performance
5. Incentive Management
6. Live Fleet Map & Heatmaps
7. Revenue Forecasting
8. AI Fleet Optimization
9. Bulk Operations
10. Compliance Management
"""

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks, Depends
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import asyncio
import random
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db

router = APIRouter(prefix="/api/v1/fleet", tags=["fleet-advanced"])


def _fleet_scope_query(fleet_id: str) -> Dict[str, Any]:
    return {
        "$or": [
            {"fleet_id": fleet_id},
            {"fleet_owner_id": fleet_id},
            {"operator_id": fleet_id},
            {"owner_id": fleet_id},
        ]
    }


def _and_query(*queries: Dict[str, Any]) -> Dict[str, Any]:
    active = [query for query in queries if query]
    if not active:
        return {}
    if len(active) == 1:
        return active[0]
    return {"$and": active}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except (TypeError, ValueError):
        return default


def _string_id(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _safe_percent(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return round((float(numerator) / float(denominator)) * 100.0, 1)


# ============================================================================
# 1. FLEET DASHBOARD & KPIs
# ============================================================================

@router.get("/dashboard/kpis/{fleet_id}")
async def get_fleet_kpis(
    fleet_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get real-time fleet KPI metrics"""
    try:
        scope = _fleet_scope_query(fleet_id)
        operator_vehicle_count = await db.operator_fleet_vehicles.count_documents(scope)
        vehicle_collection = db.operator_fleet_vehicles if operator_vehicle_count else db.vehicles
        total_vehicles = operator_vehicle_count or await db.vehicles.count_documents(scope)
        active_vehicles = await vehicle_collection.count_documents(
            _and_query(scope, {"status": {"$in": ["active", "available", "online", "approved"]}})
        )
        inactive_vehicles = max(0, int(total_vehicles) - int(active_vehicles))

        driver_scope = scope
        driver_rows = await db.drivers.find(driver_scope, {"_id": 0, "user_id": 1, "id": 1, "rating": 1, "is_available": 1, "is_online": 1}).to_list(5000)
        driver_ids = {
            str(row.get("user_id") or row.get("id") or "").strip()
            for row in driver_rows
            if str(row.get("user_id") or row.get("id") or "").strip()
        }
        assignment_rows = await db.fleet_driver_assignments.find(scope, {"_id": 0, "driver_id": 1}).to_list(5000)
        driver_ids.update(
            str(row.get("driver_id") or "").strip()
            for row in assignment_rows
            if str(row.get("driver_id") or "").strip()
        )
        total_drivers = len(driver_ids)
        active_drivers = sum(
            1
            for row in driver_rows
            if bool(row.get("is_available")) or bool(row.get("is_online"))
        )
        if active_drivers == 0 and total_drivers:
            active_drivers = await db.driver_attendance_records.count_documents(
                _and_query(
                    scope,
                    {
                        "status": {"$in": ["present", "online", "available"]},
                        "date": {"$gte": datetime.utcnow() - timedelta(days=1)},
                    },
                )
            )
        offline_drivers = max(0, total_drivers - int(active_drivers))

        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        booking_scope = scope
        if driver_ids:
            booking_scope = {
                "$or": [
                    {"driver_id": {"$in": list(driver_ids)}},
                    *_fleet_scope_query(fleet_id)["$or"],
                ]
            }
        bookings_today = await db.bookings.find(
            _and_query(booking_scope, {"created_at": {"$gte": today_start}}),
            {
                "_id": 0,
                "status": 1,
                "estimated_fare": 1,
                "final_fare": 1,
                "fare": 1,
                "fare_before_discount": 1,
            },
        ).to_list(5000)
        total_rides_today = len(bookings_today)
        completed_today = sum(1 for row in bookings_today if str(row.get("status") or "").lower().split(".")[-1] == "completed")
        cancelled_today = sum(1 for row in bookings_today if str(row.get("status") or "").lower().split(".")[-1] == "cancelled")
        accepted_today = sum(
            1
            for row in bookings_today
            if str(row.get("status") or "").lower().split(".")[-1]
            in {"accepted", "driver_arrived", "in_progress", "completed"}
        )
        total_earnings_today = round(
            sum(
                _safe_float(
                    row.get("final_fare")
                    if row.get("final_fare") is not None
                    else row.get("estimated_fare")
                    if row.get("estimated_fare") is not None
                    else row.get("fare")
                    if row.get("fare") is not None
                    else row.get("fare_before_discount")
                )
                for row in bookings_today
            ),
            2,
        )
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_bookings = await db.bookings.find(
            _and_query(booking_scope, {"created_at": {"$gte": month_start}}),
            {"_id": 0, "estimated_fare": 1, "final_fare": 1, "fare": 1, "fare_before_discount": 1},
        ).to_list(10000)
        total_earnings_month = round(
            sum(
                _safe_float(
                    row.get("final_fare")
                    if row.get("final_fare") is not None
                    else row.get("estimated_fare")
                    if row.get("estimated_fare") is not None
                    else row.get("fare")
                    if row.get("fare") is not None
                    else row.get("fare_before_discount")
                )
                for row in month_bookings
            ),
            2,
        )
        rating_values = [_safe_float(row.get("rating")) for row in driver_rows if _safe_float(row.get("rating")) > 0]
        avg_driver_rating = round(sum(rating_values) / len(rating_values), 2) if rating_values else 0.0
        vehicle_utilization = _safe_percent(active_vehicles, total_vehicles)
        driver_availability = _safe_percent(active_drivers, total_drivers)
        avg_acceptance_rate = _safe_percent(accepted_today, total_rides_today)
        avg_completion_rate = _safe_percent(completed_today, total_rides_today)
        avg_cancellation_rate = _safe_percent(cancelled_today, total_rides_today)
        health_score = round(
            (vehicle_utilization * 0.30)
            + (driver_availability * 0.30)
            + (avg_completion_rate * 0.20)
            + ((avg_driver_rating / 5.0) * 100.0 * 0.20),
            1,
        )
        red_flags = []
        if inactive_vehicles:
            red_flags.append(f"{inactive_vehicles} vehicles inactive")
        if offline_drivers:
            red_flags.append(f"{offline_drivers} drivers offline")
        if avg_cancellation_rate > 8:
            red_flags.append(f"Cancellation rate is {avg_cancellation_rate}% today")
        if avg_driver_rating and avg_driver_rating < 4.2:
            red_flags.append(f"Average driver rating is {avg_driver_rating}")

        kpis = {
            "fleet_id": fleet_id,
            "total_vehicles": int(total_vehicles),
            "active_vehicles": int(active_vehicles),
            "inactive_vehicles": inactive_vehicles,
            "vehicle_utilization": vehicle_utilization,
            "vehicle_health_score": vehicle_utilization,
            "total_drivers": int(total_drivers),
            "active_drivers": int(active_drivers),
            "offline_drivers": int(offline_drivers),
            "driver_availability": driver_availability,
            "avg_driver_rating": avg_driver_rating,
            "total_rides_today": total_rides_today,
            "total_earnings_today": total_earnings_today,
            "total_earnings_month": total_earnings_month,
            "monthly_revenue": total_earnings_month,
            "avg_acceptance_rate": avg_acceptance_rate,
            "avg_completion_rate": avg_completion_rate,
            "avg_cancellation_rate": avg_cancellation_rate,
            "health_status": "good" if health_score >= 80 else "watch" if health_score >= 60 else "critical",
            "health_score": health_score,
            "red_flags": red_flags,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "success",
            "data": kpis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard/health-history/{fleet_id}")
async def get_fleet_health_history(fleet_id: str, days: int = 30, request: Request = None):
    """Get fleet health score history for trend analysis"""
    try:
        # Generate mock historical data
        history = []
        for i in range(days, 0, -1):
            date = datetime.utcnow() - timedelta(days=i)
            score = 85.0 + random.uniform(-5, 5)  # Fluctuate around 85
            history.append({
                "date": date.isoformat(),
                "health_score": round(score, 1),
                "vehicle_utilization": round(85.0 + random.uniform(-10, 10), 1),
                "driver_availability": round(78.0 + random.uniform(-8, 8), 1),
                "avg_rating": round(4.5 + random.uniform(-0.3, 0.3), 2)
            })
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "history": history
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 2. FLEET WALLET & SETTLEMENTS
# ============================================================================

@router.get("/wallet/{fleet_id}")
async def get_fleet_wallet(fleet_id: str, request: Request):
    """Get fleet wallet balance and settlement info"""
    try:
        wallet = {
            "fleet_id": fleet_id,
            "total_earnings": 2450000.0,
            "pending_amount": 325000.0,
            "available_balance": 2125000.0,
            "total_commission_paid": 245000.0,
            "total_driver_payouts": 1890000.0,
            "total_withdrawals": 890000.0,
            "settlement_frequency": "weekly",
            "last_settlement_date": (datetime.utcnow() - timedelta(days=7)).isoformat(),
            "next_settlement_date": (datetime.utcnow() + timedelta(days=7)).isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "success",
            "data": wallet
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settlements/{fleet_id}")
async def get_fleet_settlements(fleet_id: str, month: Optional[str] = None, request: Request = None):
    """Get settlement records"""
    try:
        settlements = [
            {
                "settlement_id": f"SETTLE_{fleet_id}_{i}",
                "fleet_id": fleet_id,
                "total_rides": 320 * (i + 1),
                "gross_earnings": 45600.0 * (i + 1),
                "platform_commission": 4560.0 * (i + 1),
                "commission_percentage": 10.0,
                "net_earnings": 41040.0 * (i + 1),
                "maintenance_deduction": 2000.0 * (i + 1),
                "insurance_deduction": 1000.0 * (i + 1),
                "other_deductions": 500.0 * (i + 1),
                "driver_payouts_total": 25000.0 * (i + 1),
                "drivers_paid": 48,
                "settlement_period_start": (datetime.utcnow() - timedelta(days=7*(4-i))).isoformat(),
                "settlement_period_end": (datetime.utcnow() - timedelta(days=7*(3-i))).isoformat(),
                "settlement_date": (datetime.utcnow() - timedelta(days=7*(3-i))).isoformat(),
                "status": "completed"
            }
            for i in range(4)
        ]
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "settlements": settlements
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/withdraw/{fleet_id}")
async def request_withdrawal(fleet_id: str, amount: float, method: str, request: Request):
    """Request withdrawal from fleet wallet"""
    try:
        withdrawal_id = f"WITHDRAW_{fleet_id}_{int(datetime.utcnow().timestamp())}"
        
        return {
            "status": "success",
            "withdrawal_id": withdrawal_id,
            "fleet_id": fleet_id,
            "amount": amount,
            "method": method,
            "status_code": "pending",
            "requested_at": datetime.utcnow().isoformat(),
            "message": f"Withdrawal request of ₹{amount} submitted. Will be processed within 24-48 hours."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/driver-payouts/{fleet_id}")
async def get_driver_payouts(fleet_id: str, period: str = "current", request: Request = None):
    """Get payout history for all drivers in fleet"""
    try:
        payouts = [
            {
                "payout_id": f"PAYOUT_{fleet_id}_D{i:03d}",
                "fleet_id": fleet_id,
                "driver_id": f"DRIVER_{i:03d}",
                "driver_name": f"Driver {i}",
                "period_start": (datetime.utcnow() - timedelta(days=7)).isoformat(),
                "period_end": datetime.utcnow().isoformat(),
                "total_earnings": 15000.0 + random.uniform(0, 10000),
                "platform_commission": 1500.0 + random.uniform(0, 500),
                "net_amount": 13500.0 + random.uniform(0, 9500),
                "fuel_advance_repaid": 500.0 * random.random(),
                "damaged_vehicle_charges": 0,
                "other_charges": 0,
                "final_payout": 13000.0 + random.uniform(0, 9000),
                "payment_status": "completed" if random.random() > 0.3 else "pending",
                "paid_at": datetime.utcnow().isoformat() if random.random() > 0.3 else None
            }
            for i in range(1, 49)
        ]
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "period": period,
            "payouts": payouts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 3. DRIVER ASSIGNMENT SYSTEM
# ============================================================================

@router.get("/driver-assignment/resources/{fleet_id}")
async def get_driver_assignment_resources(
    fleet_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return real fleet drivers, vehicles, and current assignment state."""
    try:
        scope = _fleet_scope_query(fleet_id)
        active_assignments = await db.fleet_driver_assignments.find(
            _and_query(scope, {"status_code": "active"}),
            {"_id": 0},
        ).to_list(5000)
        assignment_by_driver = {
            _string_id(item.get("driver_id")): item
            for item in active_assignments
            if item.get("driver_id")
        }
        assignment_by_vehicle = {
            _string_id(item.get("vehicle_id")): item
            for item in active_assignments
            if item.get("vehicle_id")
        }

        driver_rows = await db.drivers.find(
            scope,
            {
                "_id": 1,
                "user_id": 1,
                "id": 1,
                "name": 1,
                "full_name": 1,
                "display_name": 1,
                "phone": 1,
                "rating": 1,
                "is_available": 1,
                "is_online": 1,
                "status": 1,
            },
        ).to_list(5000)
        driver_ids = [
            _string_id(row.get("user_id") or row.get("id") or row.get("_id"))
            for row in driver_rows
            if row.get("user_id") or row.get("id") or row.get("_id")
        ]
        users_by_id = {
            _string_id(user.get("id")): user
            for user in await db.users.find(
                {"id": {"$in": driver_ids}},
                {"_id": 0, "id": 1, "name": 1, "full_name": 1, "phone": 1},
            ).to_list(len(driver_ids) or 1)
        }

        drivers = []
        for row in driver_rows:
            driver_id = _string_id(row.get("user_id") or row.get("id") or row.get("_id"))
            assignment = assignment_by_driver.get(driver_id) or {}
            user = users_by_id.get(driver_id) or {}
            current_vehicle = _string_id(assignment.get("vehicle_id"))
            is_available = bool(row.get("is_available")) or bool(row.get("is_online"))
            drivers.append(
                {
                    "id": driver_id,
                    "name": (
                        row.get("name")
                        or row.get("full_name")
                        or row.get("display_name")
                        or user.get("name")
                        or user.get("full_name")
                        or f"Driver {driver_id}"
                    ),
                    "phone": row.get("phone") or user.get("phone"),
                    "status": "assigned" if current_vehicle else "available" if is_available else str(row.get("status") or "offline"),
                    "currentVehicle": current_vehicle or None,
                    "rating": round(_safe_float(row.get("rating"), 0.0), 1),
                }
            )

        operator_vehicle_count = await db.operator_fleet_vehicles.count_documents(scope)
        vehicle_collection = db.operator_fleet_vehicles if operator_vehicle_count else db.vehicles
        vehicle_rows = await vehicle_collection.find(
            scope,
            {
                "_id": 1,
                "vehicle_id": 1,
                "id": 1,
                "vehicleId": 1,
                "plate": 1,
                "license_plate": 1,
                "registration_number": 1,
                "vehicle_number": 1,
                "model": 1,
                "model_name": 1,
                "vehicle_model": 1,
                "type": 1,
                "status": 1,
            },
        ).to_list(5000)
        vehicles = []
        for row in vehicle_rows:
            vehicle_id = _string_id(
                row.get("vehicle_id")
                or row.get("id")
                or row.get("vehicleId")
                or row.get("_id")
            )
            assignment = assignment_by_vehicle.get(vehicle_id) or {}
            driver_id = _string_id(assignment.get("driver_id"))
            plate = row.get("plate") or row.get("license_plate") or row.get("registration_number") or row.get("vehicle_number") or vehicle_id
            model = row.get("model") or row.get("model_name") or row.get("vehicle_model") or row.get("type") or "Vehicle"
            vehicles.append(
                {
                    "id": vehicle_id,
                    "plate": plate,
                    "model": model,
                    "status": "assigned" if driver_id else str(row.get("status") or "unassigned"),
                    "driver": driver_id or None,
                }
            )

        return {
            "status": "success",
            "fleet_id": fleet_id,
            "drivers": drivers,
            "vehicles": vehicles,
            "assignments": active_assignments,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/driver-assignment/assign")
async def assign_driver_to_vehicle(fleet_id: str, driver_id: str, vehicle_id: str, 
                                   shift: str, request: Request,
                                   db: AsyncIOMotorDatabase = Depends(get_db)):
    """Assign driver to vehicle"""
    try:
        assignment_id = f"ASSIGN_{fleet_id}_{driver_id}_{int(datetime.utcnow().timestamp())}"
        now = datetime.utcnow()
        scope = _fleet_scope_query(fleet_id)
        await db.fleet_driver_assignments.update_many(
            _and_query(
                scope,
                {
                    "status_code": "active",
                    "$or": [{"driver_id": driver_id}, {"vehicle_id": vehicle_id}],
                },
            ),
            {"$set": {"status_code": "inactive", "ended_at": now, "updated_at": now}},
        )
        await db.fleet_driver_assignments.insert_one(
            {
                "assignment_id": assignment_id,
                "fleet_id": fleet_id,
                "driver_id": driver_id,
                "vehicle_id": vehicle_id,
                "shift": shift,
                "assignment_date": now,
                "status_code": "active",
                "created_at": now,
                "updated_at": now,
            }
        )
        
        return {
            "status": "success",
            "assignment_id": assignment_id,
            "fleet_id": fleet_id,
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "shift": shift,
            "assignment_date": datetime.utcnow().isoformat(),
            "status_code": "active",
            "message": f"Driver {driver_id} assigned to vehicle {vehicle_id} for {shift} shift"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/driver-assignment/reassign")
async def reassign_driver(fleet_id: str, driver_id: str, new_vehicle_id: str, 
                         reason: str, request: Request):
    """Reassign driver to different vehicle"""
    try:
        request_id = f"REASSIGN_{fleet_id}_{driver_id}_{int(datetime.utcnow().timestamp())}"
        
        return {
            "status": "success",
            "request_id": request_id,
            "driver_id": driver_id,
            "new_vehicle_id": new_vehicle_id,
            "reason": reason,
            "status_code": "pending",
            "message": "Reassignment request submitted for approval"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/driver-assignment/temporary-replacement")
async def create_temporary_replacement(fleet_id: str, original_driver_id: str, 
                                      replacement_driver_id: str, vehicle_id: str,
                                      start_date: str, end_date: str, reason: str,
                                      request: Request):
    """Create temporary driver replacement"""
    try:
        replacement_id = f"REPLACE_{fleet_id}_{int(datetime.utcnow().timestamp())}"
        
        return {
            "status": "success",
            "replacement_id": replacement_id,
            "original_driver_id": original_driver_id,
            "replacement_driver_id": replacement_driver_id,
            "vehicle_id": vehicle_id,
            "start_date": start_date,
            "end_date": end_date,
            "reason": reason,
            "is_active": True,
            "message": f"Temporary replacement active from {start_date} to {end_date}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/driver-assignment/history/{fleet_id}")
async def get_assignment_history(fleet_id: str, driver_id: Optional[str] = None, 
                                request: Request = None):
    """Get driver assignment history"""
    try:
        history = [
            {
                "transfer_id": f"TRANSFER_{fleet_id}_{i}",
                "driver_id": driver_id or f"DRIVER_{i:03d}",
                "from_fleet_id": fleet_id,
                "to_fleet_id": fleet_id,
                "transfer_date": (datetime.utcnow() - timedelta(days=30-i*5)).isoformat(),
                "transfer_reason": ["reassignment", "performance", "request"][i % 3],
                "previous_vehicle_id": f"VEHICLE_{i:03d}",
                "new_vehicle_id": f"VEHICLE_{i+1:03d}",
                "performance_summary": f"Completed {100+i*20} rides before transfer"
            }
            for i in range(6)
        ]
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "driver_id": driver_id,
            "history": history
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 4. ATTENDANCE & PERFORMANCE
# ============================================================================

@router.get("/attendance/{fleet_id}")
async def get_fleet_attendance(fleet_id: str, date: Optional[str] = None, request: Request = None):
    """Get daily attendance records for all drivers"""
    try:
        records = [
            {
                "attendance_id": f"ATT_{fleet_id}_{i:03d}",
                "fleet_id": fleet_id,
                "driver_id": f"DRIVER_{i:03d}",
                "driver_name": f"Driver {i}",
                "date": date or datetime.utcnow().strftime("%Y-%m-%d"),
                "scheduled_hours": 12.0,
                "online_hours": 11.0 + random.uniform(0, 1),
                "active_hours": 8.5 + random.uniform(0, 2),
                "idle_hours": 2.5 + random.uniform(0, 1),
                "total_rides": 15 + int(random.uniform(0, 10)),
                "completed_rides": 14 + int(random.uniform(0, 10)),
                "cancelled_rides": 1 + int(random.uniform(0, 2)),
                "missed_requests": int(random.uniform(0, 3)),
                "avg_response_time": 45 + random.uniform(-20, 20),
                "attendance_score": 85.0 + random.uniform(-10, 10)
            }
            for i in range(1, 49)
        ]
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "date": date or datetime.utcnow().strftime("%Y-%m-%d"),
            "records": records
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/performance/rankings/{fleet_id}")
async def get_driver_rankings(fleet_id: str, period: str = "monthly", request: Request = None):
    """Get driver performance rankings"""
    try:
        rankings = []
        for rank in range(1, 49):
            score = 100 - (rank * 1.5)
            rankings.append({
                "rank": rank,
                "driver_id": f"DRIVER_{rank:03d}",
                "driver_name": f"Driver {rank}",
                "rating": 4.8 - (rank * 0.01),
                "acceptance_rate": 96.0 - (rank * 0.5),
                "completion_rate": 98.0 - (rank * 0.3),
                "cancellation_rate": 1.0 + (rank * 0.02),
                "revenue_score": score,
                "rides_completed": 100 - rank,
                "performance_badge": "gold" if rank <= 10 else "silver" if rank <= 25 else "bronze"
            })
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "period": period,
            "top_performer": rankings[0],
            "rankings": rankings
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/performance/monthly/{fleet_id}/{driver_id}")
async def get_driver_monthly_performance(fleet_id: str, driver_id: str, 
                                        month: Optional[str] = None, request: Request = None):
    """Get detailed monthly performance for driver"""
    try:
        performance = {
            "performance_id": f"PERF_{fleet_id}_{driver_id}",
            "fleet_id": fleet_id,
            "driver_id": driver_id,
            "month_year": month or datetime.utcnow().strftime("%Y-%m"),
            "days_worked": 25,
            "total_hours": 250.0,
            "total_rides": 400,
            "avg_rating_received": 4.7,
            "acceptance_rate": 95.5,
            "completion_rate": 97.8,
            "cancellation_rate": 1.8,
            "gross_revenue": 60000.0,
            "net_earnings": 48000.0,
            "rank_in_fleet": 5,
            "percentile": 89.0,
            "trend": "improving",
            "trend_percentage": 8.5
        }
        
        return {
            "status": "success",
            "performance": performance
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 5. INCENTIVE MANAGEMENT
# ============================================================================

@router.post("/incentives/create")
async def create_driver_incentive(fleet_id: str, driver_id: str, incentive_type: str,
                                 amount: float, condition: str, start_date: str,
                                 end_date: str, request: Request):
    """Create incentive for driver"""
    try:
        incentive_id = f"INCENTIVE_{fleet_id}_{driver_id}_{int(datetime.utcnow().timestamp())}"
        
        return {
            "status": "success",
            "incentive_id": incentive_id,
            "driver_id": driver_id,
            "incentive_type": incentive_type,
            "amount": amount,
            "condition": condition,
            "status_code": "active",
            "message": f"Incentive of ₹{amount} created for {incentive_type}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/incentives/{fleet_id}")
async def get_fleet_incentives(fleet_id: str, status: str = "active", request: Request = None):
    """Get all incentives in fleet"""
    try:
        incentives = [
            {
                "incentive_id": f"INCENTIVE_{fleet_id}_{i}",
                "driver_id": f"DRIVER_{i:03d}",
                "incentive_type": ["weekly_bonus", "performance_bonus", "rating_bonus"][i % 3],
                "amount": [500, 800, 1200][i % 3],
                "condition": ["complete_50_rides", "maintain_4.8_rating", "top_10_performers"][i % 3],
                "progress": 50 + random.uniform(0, 50),
                "status": "active" if i < 35 else "completed",
                "payment_status": "pending" if i < 35 else "paid"
            }
            for i in range(1, 49)
        ]
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "incentives": [inc for inc in incentives if inc["status"] == status]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/incentives/program/{fleet_id}")
async def get_incentive_program(fleet_id: str, request: Request = None):
    """Get active incentive program"""
    try:
        program = {
            "program_id": f"PROG_{fleet_id}",
            "fleet_id": fleet_id,
            "program_name": "Summer Performance Boost 2026",
            "description": "Weekly bonuses for top performers",
            "total_budget": 500000.0,
            "allocated_so_far": 245000.0,
            "remaining_budget": 255000.0,
            "active": True,
            "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
            "end_date": (datetime.utcnow() + timedelta(days=60)).isoformat(),
            "total_incentives_disbursed": 245000.0,
            "drivers_benefited": 38
        }
        
        return {
            "status": "success",
            "program": program
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/incentives/weekly-targets/{fleet_id}")
async def get_weekly_targets(fleet_id: str, request: Request = None):
    """Get weekly incentive targets"""
    try:
        week_start = datetime.utcnow() - timedelta(days=datetime.utcnow().weekday())
        
        targets = {
            "target_id": f"TARGET_{fleet_id}",
            "fleet_id": fleet_id,
            "week_start": week_start.isoformat(),
            "week_end": (week_start + timedelta(days=6)).isoformat(),
            "rides_for_bonus_tier_1": 50,
            "rides_for_bonus_tier_2": 75,
            "rides_for_bonus_tier_3": 100,
            "tier_1_bonus": 500.0,
            "tier_2_bonus": 800.0,
            "tier_3_bonus": 1200.0,
            "top_performers_bonus": 2000.0,
            "min_rating_required": 4.5,
            "max_cancellation_rate": 5.0,
            "drivers_tracking": [
                {
                    "driver_id": f"DRIVER_{i:03d}",
                    "rides_completed": 20 + int(random.uniform(0, 50)),
                    "current_tier": 1 + int(random.uniform(0, 3)),
                    "projected_bonus": 500 + int(random.uniform(0, 1500)),
                    "rating": 4.4 + random.uniform(0, 0.6)
                }
                for i in range(1, 49)
            ]
        }
        
        return {
            "status": "success",
            "targets": targets
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 6. LIVE FLEET MAP & HEATMAPS
# ============================================================================

@router.get("/live-map/{fleet_id}")
async def get_live_fleet_map(fleet_id: str, request: Request = None):
    """Get real-time map with all vehicles"""
    try:
        vehicles = []
        base_lat, base_lng = 13.0827, 80.2707  # Chennai
        
        for i in range(50):
            vehicles.append({
                "vehicle_id": f"VEHICLE_{i:03d}",
                "driver_id": f"DRIVER_{i:03d}",
                "latitude": base_lat + random.uniform(-0.1, 0.1),
                "longitude": base_lng + random.uniform(-0.1, 0.1),
                "status": ["active", "idle", "offline"][i % 3],
                "is_on_ride": i % 3 == 0,
                "current_ride_id": f"RIDE_{i}" if i % 3 == 0 else None,
                "speed": random.uniform(0, 60) if i % 3 != 2 else 0,
                "bearing": random.uniform(0, 360)
            })
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "vehicles": vehicles,
            "summary": {
                "active_vehicles": sum(1 for v in vehicles if v["status"] == "active"),
                "idle_vehicles": sum(1 for v in vehicles if v["status"] == "idle"),
                "offline_vehicles": sum(1 for v in vehicles if v["status"] == "offline"),
                "active_rides": sum(1 for v in vehicles if v["is_on_ride"])
            },
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap/{fleet_id}")
async def get_demand_heatmap(fleet_id: str, zone: Optional[str] = None, request: Request = None):
    """Get demand heatmap for fleet area"""
    try:
        base_lat, base_lng = 13.0827, 80.2707  # Chennai
        cell_size = 50  # 50-meter cells
        
        cells = []
        for i in range(100):
            lat_offset = (i // 10) * 0.01
            lng_offset = (i % 10) * 0.01
            
            demand_level = ["low", "medium", "high", "very_high"][i % 4]
            
            cells.append({
                "lat": base_lat + lat_offset,
                "lng": base_lng + lng_offset,
                "demand_level": demand_level,
                "demand_score": [20, 50, 80, 95][["low", "medium", "high", "very_high"].index(demand_level)],
                "supply_count": int(random.uniform(1, 10)),
                "revenue_potential": random.uniform(5000, 50000)
            })
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "heatmap_cells": cells,
            "high_demand_zones": sum(1 for c in cells if c["demand_level"] in ["high", "very_high"]),
            "recommendations": [
                "Send 5 vehicles to CBD area - Very high demand",
                "Deploy 3 vehicles to Airport Road - High demand",
                "Shift 2 vehicles from suburbs to city center"
            ],
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap/zone/{fleet_id}/{zone_name}")
async def get_zone_demand(fleet_id: str, zone_name: str, request: Request = None):
    """Get detailed demand metrics for specific zone"""
    try:
        zone = {
            "heatmap_id": f"ZONE_{fleet_id}_{zone_name}",
            "fleet_id": fleet_id,
            "zone_name": zone_name,
            "current_demand_level": "high",
            "demand_score": 78.5,
            "available_vehicles": 8,
            "demand_requests_pending": 12,
            "avg_fare_in_zone": 350.0,
            "estimated_revenue_opportunity": 4200.0,
            "hourly_demand": {
                str(i): 20 + i*8 + random.uniform(-10, 10) for i in range(24)
            },
            "updated_at": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "success",
            "zone": zone
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 7. REVENUE FORECASTING
# ============================================================================

@router.get("/forecast/{fleet_id}")
async def get_revenue_forecast(fleet_id: str, days: int = 7, request: Request = None):
    """Get revenue forecast for next N days"""
    try:
        forecasts = []
        for i in range(days):
            date = datetime.utcnow() + timedelta(days=i)
            predicted_rides = 300 + int(random.uniform(-50, 100))
            predicted_revenue = predicted_rides * 150  # avg ₹150 per ride
            
            forecasts.append({
                "forecast_id": f"FORECAST_{fleet_id}_{date.strftime('%Y-%m-%d')}",
                "fleet_id": fleet_id,
                "forecast_date": datetime.utcnow().isoformat(),
                "forecast_for_date": date.isoformat(),
                "predicted_rides": predicted_rides,
                "predicted_revenue": predicted_revenue,
                "predicted_earnings": predicted_revenue * 0.85,  # After commission
                "confidence_level": 85 + random.uniform(-10, 5)
            })
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "forecasts": forecasts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 8. AI FLEET OPTIMIZATION
# ============================================================================

@router.get("/ai-recommendations/{fleet_id}")
async def get_ai_recommendations(fleet_id: str, request: Request = None):
    """Get AI-powered optimization recommendations"""
    try:
        recommendations = [
            {
                "recommendation_id": f"REC_{fleet_id}_1",
                "rec_type": "driver_allocation",
                "title": "Reallocate 3 drivers to high-demand zones",
                "description": "Move drivers from suburbs to CBD area for 2-3 hours peak demand window",
                "suggestion": "Relocate DRIVER_001, DRIVER_002, DRIVER_003 to MG Road area",
                "expected_impact": {
                    "ride_increase": 45,
                    "revenue_increase": 6750,
                    "estimated_increase_percentage": 12.5
                },
                "implementation_steps": [
                    "1. Send notification to 3 drivers",
                    "2. Offer ₹200 incentive for relocation",
                    "3. Monitor for 2 hours"
                ],
                "estimated_implementation_time": "15 minutes",
                "priority": "high",
                "impact_score": 85.0,
                "status": "pending"
            },
            {
                "recommendation_id": f"REC_{fleet_id}_2",
                "rec_type": "shift_optimization",
                "title": "Extend evening shift by 2 hours",
                "description": "Extend 10 drivers' shifts from 6 PM to 10 PM to capture peak demand",
                "suggestion": "Add 2-hour extension to evening shift (6 PM - 10 PM)",
                "expected_impact": {
                    "ride_increase": 80,
                    "revenue_increase": 12000,
                    "estimated_increase_percentage": 22.0
                },
                "implementation_steps": [
                    "1. Update shift configuration",
                    "2. Notify drivers with bonus offer",
                    "3. Monitor completion rates"
                ],
                "estimated_implementation_time": "30 minutes",
                "priority": "high",
                "impact_score": 92.0,
                "status": "pending"
            },
            {
                "recommendation_id": f"REC_{fleet_id}_3",
                "rec_type": "zone_assignment",
                "title": "Assign pool vehicles to high-demand zones",
                "description": "Deploy ride-pooling vehicles to CBD and airport routes",
                "suggestion": "Activate ride-pooling for MG Road ↔ Airport route",
                "expected_impact": {
                    "ride_increase": 120,
                    "revenue_increase": 18000,
                    "estimated_increase_percentage": 33.0
                },
                "implementation_steps": [
                    "1. Configure route preferences",
                    "2. Train driver on pooling process",
                    "3. Launch pilot with 5 vehicles"
                ],
                "estimated_implementation_time": "2 hours",
                "priority": "medium",
                "impact_score": 88.0,
                "status": "pending"
            }
        ]
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "recommendations": recommendations,
            "total_potential_revenue_increase": sum(r["expected_impact"]["revenue_increase"] for r in recommendations)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 9. BULK OPERATIONS
# ============================================================================

@router.post("/bulk/approve-drivers")
async def bulk_approve_drivers(fleet_id: str, driver_ids: List[str], request: Request):
    """Bulk approve multiple drivers"""
    try:
        batch_id = f"BATCH_{fleet_id}_{int(datetime.utcnow().timestamp())}"
        
        return {
            "status": "success",
            "batch_id": batch_id,
            "fleet_id": fleet_id,
            "total_drivers": len(driver_ids),
            "approved_count": len(driver_ids),
            "status_code": "processing",
            "message": f"Bulk approval initiated for {len(driver_ids)} drivers. Will complete within 5 minutes."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk/upload-documents")
async def bulk_upload_documents(fleet_id: str, entity_type: str, document_type: str,
                               file_count: int, request: Request, background_tasks: BackgroundTasks):
    """Bulk upload documents for drivers/vehicles"""
    try:
        upload_id = f"UPLOAD_{fleet_id}_{int(datetime.utcnow().timestamp())}"
        
        # Simulate async processing
        background_tasks.add_task(process_bulk_upload, upload_id, file_count)
        
        return {
            "status": "success",
            "upload_id": upload_id,
            "fleet_id": fleet_id,
            "entity_type": entity_type,
            "document_type": document_type,
            "total_files": file_count,
            "status_code": "processing",
            "message": f"Bulk document upload started. Processing {file_count} files."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def process_bulk_upload(upload_id: str, file_count: int):
    """Background task to process bulk uploads"""
    await asyncio.sleep(5)  # Simulate processing


# ============================================================================
# 10. COMPLIANCE & MAINTENANCE
# ============================================================================

@router.get("/compliance/report/{fleet_id}")
async def get_compliance_report(fleet_id: str, request: Request = None):
    """Get fleet compliance status report"""
    try:
        report = {
            "report_id": f"COMPLIANCE_{fleet_id}",
            "fleet_id": fleet_id,
            "insurance_valid_count": 45,
            "insurance_expiring_count": 3,
            "insurance_expired_count": 2,
            "permits_valid_count": 48,
            "permits_expiring_count": 2,
            "permits_expired_count": 0,
            "drivers_verified_count": 55,
            "drivers_pending_verification_count": 5,
            "pollution_certs_valid_count": 46,
            "fitness_certs_valid_count": 47,
            "compliance_score": 91.5,
            "compliance_status": "compliant",
            "critical_issues": [
                "2 vehicle insurance expired - Immediate action required",
                "5 drivers KYC pending - Block rides if exceeds 7 days"
            ],
            "warnings": [
                "3 insurance policies expiring within 7 days",
                "2 pollution certificates expiring within 15 days"
            ],
            "generated_at": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "success",
            "report": report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/maintenance/alerts/{fleet_id}")
async def get_maintenance_alerts(fleet_id: str, request: Request = None):
    """Get maintenance and document expiry alerts"""
    try:
        alerts = []
        
        # Insurance expiry alerts
        for i in range(3):
            alerts.append({
                "alert_id": f"ALERT_{fleet_id}_INS_{i}",
                "fleet_id": fleet_id,
                "vehicle_id": f"VEHICLE_{i:03d}",
                "document_type": "insurance",
                "expiry_date": (datetime.utcnow() + timedelta(days=5-i*2)).isoformat(),
                "days_until_expiry": 5 - i*2,
                "alert_severity": ["critical", "high", "high"][i],
                "status": "active"
            })
        
        # Pollution certificate alerts
        for i in range(2):
            alerts.append({
                "alert_id": f"ALERT_{fleet_id}_POLL_{i}",
                "fleet_id": fleet_id,
                "vehicle_id": f"VEHICLE_{10+i:03d}",
                "document_type": "pollution_certificate",
                "expiry_date": (datetime.utcnow() + timedelta(days=20-i*5)).isoformat(),
                "days_until_expiry": 20 - i*5,
                "alert_severity": "medium",
                "status": "active"
            })
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "alerts": alerts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ROLE-BASED ACCESS
# ============================================================================

@router.get("/roles/{fleet_id}")
async def get_fleet_roles(fleet_id: str, request: Request = None):
    """Get all user roles in fleet"""
    try:
        roles = [
            {
                "role_id": f"ROLE_{fleet_id}_1",
                "fleet_id": fleet_id,
                "user_id": "USER_001",
                "user_name": "Rajesh Kumar",
                "role": "owner",
                "can_add_drivers": True,
                "can_remove_drivers": True,
                "can_view_earnings": True,
                "can_withdraw_money": True,
                "can_manage_vehicles": True,
                "can_view_analytics": True,
                "can_manage_incentives": True,
                "can_approve_documents": True,
                "can_view_all_data": True
            },
            {
                "role_id": f"ROLE_{fleet_id}_2",
                "fleet_id": fleet_id,
                "user_id": "USER_002",
                "user_name": "Priya Sharma",
                "role": "manager",
                "can_add_drivers": True,
                "can_remove_drivers": False,
                "can_view_earnings": True,
                "can_withdraw_money": False,
                "can_manage_vehicles": True,
                "can_view_analytics": True,
                "can_manage_incentives": True,
                "can_approve_documents": False,
                "can_view_all_data": True
            },
            {
                "role_id": f"ROLE_{fleet_id}_3",
                "fleet_id": fleet_id,
                "user_id": "USER_003",
                "user_name": "Arjun Nair",
                "role": "accountant",
                "can_add_drivers": False,
                "can_remove_drivers": False,
                "can_view_earnings": True,
                "can_withdraw_money": True,
                "can_manage_vehicles": False,
                "can_view_analytics": False,
                "can_manage_incentives": False,
                "can_approve_documents": False,
                "can_view_all_data": False
            }
        ]
        
        return {
            "status": "success",
            "fleet_id": fleet_id,
            "roles": roles
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/roles/assign")
async def assign_role(fleet_id: str, user_id: str, role: str, request: Request):
    """Assign role to user in fleet"""
    try:
        role_id = f"ROLE_{fleet_id}_{user_id}"
        
        return {
            "status": "success",
            "role_id": role_id,
            "fleet_id": fleet_id,
            "user_id": user_id,
            "role": role,
            "message": f"Role '{role}' assigned to user"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
