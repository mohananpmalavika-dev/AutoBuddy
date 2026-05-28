# TIER 1 Backend Implementation Guide
**Date**: 2026-05-29  
**Target**: Fast-track backend API endpoints for frontend integration  
**Effort**: ~10-12 hours across 4 engineers

---

## 🎯 Quick Start

Frontend has delivered **4 complete hook+component pairs** awaiting backend APIs.  
This guide provides exact endpoint specs, database schemas, and integration patterns.

---

## 1️⃣ GPS LOCATION TRACKING
**Complexity**: ⭐⭐ Medium  
**Estimated Effort**: 2-3 hours  
**Dependencies**: None

### Endpoints

#### POST /api/drivers/location
**Purpose**: Store real-time driver GPS coordinate  
**Called**: Every 10-30 seconds during ride or when online  

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime

class LocationUpdate(BaseModel):
    latitude: float  # e.g., 10.306214
    longitude: float  # e.g., 76.290399
    accuracy: float = None  # in meters, e.g., 10
    speed: float = None  # in km/h, e.g., 45.5
    address: str = None  # reverse-geocoded address
    timestamp: str  # ISO 8601, e.g., "2026-05-29T14:30:00Z"

@router.post("/drivers/location")
async def post_driver_location(location: LocationUpdate, token: str = Header(...)):
    """Store driver GPS location"""
    driver_id = get_driver_id(token)
    
    # Insert into driver_gps_locations table
    db.execute("""
        INSERT INTO driver_gps_locations 
        (driver_id, latitude, longitude, accuracy, speed, address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (driver_id, location.latitude, location.longitude, 
          location.accuracy, location.speed, location.address, datetime.now()))
    
    # Emit WebSocket event to passengers in active rides
    if active_ride := get_driver_active_ride(driver_id):
        emit_to_passenger(active_ride.passenger_id, {
            'type': 'driver_location_update',
            'driver_id': driver_id,
            'latitude': location.latitude,
            'longitude': location.longitude,
            'address': location.address,
            'speed': location.speed,
            'timestamp': location.timestamp
        })
    
    return {"status": "ok", "location": location.dict()}
```

#### GET /api/drivers/location
**Purpose**: Fetch current driver location  
**Called**: When app loads or location needed  

```python
@router.get("/drivers/location")
async def get_driver_location(token: str = Header(...)):
    """Get driver's latest GPS location"""
    driver_id = get_driver_id(token)
    
    location = db.query("""
        SELECT latitude, longitude, address, accuracy, speed, created_at
        FROM driver_gps_locations
        WHERE driver_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    """, (driver_id,)).first()
    
    if not location:
        return {"latitude": 0.0, "longitude": 0.0, "address": "Unknown location"}
    
    return {
        "latitude": location.latitude,
        "longitude": location.longitude,
        "address": location.address,
        "accuracy": location.accuracy,
        "speed": location.speed,
        "timestamp": location.created_at.isoformat()
    }
```

### Database Schema

```sql
CREATE TABLE driver_gps_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id VARCHAR(50) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    accuracy FLOAT,
    speed FLOAT,
    address VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    FOREIGN KEY (driver_id) REFERENCES drivers(id),
    INDEX idx_driver_timestamp (driver_id, created_at DESC)
);

-- Optional: Archive old locations after 7 days
DELETE FROM driver_gps_locations 
WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
```

---

## 2️⃣ SOS EMERGENCY ALERT
**Complexity**: ⭐⭐⭐ High  
**Estimated Effort**: 4-6 hours  
**Dependencies**: Twilio/Emergency Service Integration

### Endpoints

#### POST /api/drivers/sos
**Purpose**: Trigger emergency SOS alert  
**Called**: When driver presses SOS button (with 5-second cooldown)  

```python
from datetime import datetime, timedelta

class SOSAlert(BaseModel):
    driver_id: str
    reason: str  # e.g., "Emergency - Driver needs assistance"
    latitude: float
    longitude: float
    address: str = None
    timestamp: str  # ISO 8601

@router.post("/drivers/sos")
async def trigger_sos(alert: SOSAlert, token: str = Header(...)):
    """Trigger emergency SOS alert"""
    driver_id = get_driver_id(token)
    
    # Check 5-second cooldown
    last_sos = db.query("""
        SELECT created_at FROM sos_alerts
        WHERE driver_id = ? AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
    """, (driver_id,)).first()
    
    if last_sos and (datetime.now() - last_sos.created_at).seconds < 5:
        raise HTTPException(status_code=429, detail="SOS on cooldown. Try again later.")
    
    # Create SOS record
    sos_id = db.execute("""
        INSERT INTO sos_alerts 
        (driver_id, reason, latitude, longitude, address, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?)
    """, (driver_id, alert.reason, alert.latitude, alert.longitude, 
          alert.address, datetime.now())).lastrowid
    
    # Get driver contact info
    driver = db.query("SELECT phone, name FROM drivers WHERE id = ?", (driver_id,)).first()
    
    # Call emergency service integration
    try:
        # Example: Twilio call to emergency number
        call_emergency_service(
            sos_id=sos_id,
            driver_name=driver.name,
            driver_phone=driver.phone,
            latitude=alert.latitude,
            longitude=alert.longitude,
            address=alert.address,
            reason=alert.reason
        )
        
        # Send SMS to admin/authorities
        send_sms_alert(
            to=os.getenv('EMERGENCY_CONTACT_PHONE'),
            message=f"🚨 SOS Alert: Driver {driver.name} ({driver_id}) at {alert.address}"
        )
        
        # Broadcast to admin dashboard
        emit_to_admins({
            'type': 'sos_alert',
            'sos_id': sos_id,
            'driver_id': driver_id,
            'driver_name': driver.name,
            'location': {'latitude': alert.latitude, 'longitude': alert.longitude},
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Emergency service call failed: {e}")
        # Still create record, but mark as pending
        db.execute(
            "UPDATE sos_alerts SET status = 'pending' WHERE id = ?", 
            (sos_id,)
        )
    
    return {
        "status": "sos_triggered",
        "sos_id": sos_id,
        "authorities_notified": True,
        "message": "🚨 Emergency services notified. Help is on the way.",
        "reference": str(sos_id)
    }
```

#### POST /api/drivers/sos/cancel
**Purpose**: Cancel active SOS alert  
**Called**: When SOS is resolved or false alarm  

```python
class SOSCancel(BaseModel):
    sos_id: str = None  # Optional, cancels active if not provided

@router.post("/drivers/sos/cancel")
async def cancel_sos(payload: SOSCancel, token: str = Header(...)):
    """Cancel SOS alert"""
    driver_id = get_driver_id(token)
    
    # Find active SOS
    sos = db.query("""
        SELECT * FROM sos_alerts
        WHERE driver_id = ? AND (status = 'active' OR status = 'pending')
        ORDER BY created_at DESC LIMIT 1
    """, (driver_id,)).first()
    
    if not sos:
        raise HTTPException(status_code=404, detail="No active SOS found")
    
    # Cancel SOS
    db.execute(
        "UPDATE sos_alerts SET status = 'cancelled', resolved_at = ? WHERE id = ?",
        (datetime.now(), sos.id)
    )
    
    # Notify authorities of cancellation
    try:
        notify_emergency_service_cancellation(sos_id=sos.id)
    except Exception as e:
        logger.error(f"Cancellation notification failed: {e}")
    
    # Broadcast cancellation to admins
    emit_to_admins({
        'type': 'sos_cancelled',
        'sos_id': sos.id,
        'driver_id': driver_id,
        'timestamp': datetime.now().isoformat()
    })
    
    return {
        "status": "sos_cancelled",
        "sos_id": sos.id,
        "message": "SOS alert cancelled"
    }
```

### Database Schema

```sql
CREATE TABLE sos_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id VARCHAR(50) NOT NULL,
    reason VARCHAR(255),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    address VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',  -- active, pending, cancelled, resolved
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    
    FOREIGN KEY (driver_id) REFERENCES drivers(id),
    INDEX idx_driver_status (driver_id, status),
    INDEX idx_created_at (created_at DESC)
);
```

---

## 3️⃣ EXPENSE TRACKING (Toll, Parking, Fuel)
**Complexity**: ⭐⭐ Medium  
**Estimated Effort**: 3-4 hours  
**Dependencies**: Rides table

### Endpoints

#### POST /api/drivers/expenses
**Purpose**: Add expense for current ride  
**Called**: When driver records toll, parking, fuel, etc.  

```python
class Expense(BaseModel):
    type: str  # "toll" | "parking" | "fuel" | "maintenance" | "other"
    amount: float
    description: str = None  # e.g., "NH Toll Booth"
    receipt_url: str = None  # Cloud storage URL
    timestamp: str  # ISO 8601

@router.post("/drivers/expenses")
async def add_expense(ride_id: str, expense: Expense, token: str = Header(...)):
    """Add expense for ride"""
    driver_id = get_driver_id(token)
    
    # Verify ride ownership
    ride = db.query(
        "SELECT * FROM bookings WHERE id = ? AND driver_id = ?",
        (ride_id, driver_id)
    ).first()
    
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    # Create expense record
    expense_id = db.execute("""
        INSERT INTO expenses 
        (ride_id, driver_id, type, amount, description, receipt_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (ride_id, driver_id, expense.type, expense.amount, 
          expense.description, expense.receipt_url, datetime.now())).lastrowid
    
    # Update ride total_expenses
    total_expenses = db.query(
        "SELECT SUM(amount) as total FROM expenses WHERE ride_id = ?",
        (ride_id,)
    ).first().total or 0
    
    db.execute(
        "UPDATE bookings SET total_expenses = ? WHERE id = ?",
        (total_expenses, ride_id)
    )
    
    return {
        "id": expense_id,
        "type": expense.type,
        "amount": expense.amount,
        "description": expense.description,
        "receipt_url": expense.receipt_url,
        "status": "recorded",
        "timestamp": datetime.now().isoformat()
    }
```

#### GET /api/drivers/rides/{ride_id}/expenses
**Purpose**: Fetch all expenses for a ride  
**Called**: When viewing ride details  

```python
@router.get("/drivers/rides/{ride_id}/expenses")
async def get_ride_expenses(ride_id: str, token: str = Header(...)):
    """Get all expenses for ride"""
    driver_id = get_driver_id(token)
    
    # Verify ride ownership
    ride = db.query(
        "SELECT * FROM bookings WHERE id = ? AND driver_id = ?",
        (ride_id, driver_id)
    ).first()
    
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    # Fetch expenses
    expenses = db.query("""
        SELECT id, type, amount, description, receipt_url, created_at
        FROM expenses
        WHERE ride_id = ?
        ORDER BY created_at DESC
    """, (ride_id,)).all()
    
    total = sum(e.amount for e in expenses)
    
    return {
        "expenses": [
            {
                "id": e.id,
                "type": e.type,
                "amount": e.amount,
                "description": e.description,
                "receipt_url": e.receipt_url,
                "timestamp": e.created_at.isoformat()
            }
            for e in expenses
        ],
        "total": total
    }
```

#### DELETE /api/drivers/expenses/{expense_id}
**Purpose**: Remove expense  

```python
@router.delete("/drivers/expenses/{expense_id}")
async def delete_expense(expense_id: str, token: str = Header(...)):
    """Delete expense"""
    driver_id = get_driver_id(token)
    
    expense = db.query(
        "SELECT * FROM expenses WHERE id = ? AND driver_id = ?",
        (expense_id, driver_id)
    ).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    ride_id = expense.ride_id
    
    db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    
    # Update ride total_expenses
    total_expenses = db.query(
        "SELECT SUM(amount) as total FROM expenses WHERE ride_id = ?",
        (ride_id,)
    ).first().total or 0
    
    db.execute(
        "UPDATE bookings SET total_expenses = ? WHERE id = ?",
        (total_expenses, ride_id)
    )
    
    return {"status": "deleted"}
```

#### PATCH /api/drivers/expenses/{expense_id}
**Purpose**: Update expense details  

```python
@router.patch("/drivers/expenses/{expense_id}")
async def update_expense(expense_id: str, updates: dict, token: str = Header(...)):
    """Update expense"""
    driver_id = get_driver_id(token)
    
    expense = db.query(
        "SELECT * FROM expenses WHERE id = ? AND driver_id = ?",
        (expense_id, driver_id)
    ).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Build UPDATE query
    allowed_fields = ['type', 'amount', 'description', 'receipt_url']
    update_clause = ", ".join([f"{k} = ?" for k in updates.keys() if k in allowed_fields])
    
    if update_clause:
        db.execute(
            f"UPDATE expenses SET {update_clause} WHERE id = ?",
            (*[updates[k] for k in updates if k in allowed_fields], expense_id)
        )
        
        # Recalculate ride total if amount changed
        if 'amount' in updates:
            total_expenses = db.query(
                "SELECT SUM(amount) as total FROM expenses WHERE ride_id = ?",
                (expense.ride_id,)
            ).first().total or 0
            
            db.execute(
                "UPDATE bookings SET total_expenses = ? WHERE id = ?",
                (total_expenses, expense.ride_id)
            )
    
    return {"status": "updated", **updates}
```

### Database Schema

```sql
CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ride_id VARCHAR(50) NOT NULL,
    driver_id VARCHAR(50) NOT NULL,
    type VARCHAR(20),  -- toll, parking, fuel, maintenance, other
    amount DECIMAL(8,2),
    description VARCHAR(255),
    receipt_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (ride_id) REFERENCES bookings(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id),
    INDEX idx_ride_id (ride_id),
    INDEX idx_driver_id (driver_id)
);

-- Update bookings table to track total expenses
ALTER TABLE bookings ADD COLUMN total_expenses DECIMAL(8,2) DEFAULT 0;
```

---

## 📋 Implementation Checklist

### Step 1: Database Setup (30 min)
- [ ] Create `driver_gps_locations` table
- [ ] Create `sos_alerts` table  
- [ ] Create `expenses` table
- [ ] Add `total_expenses` column to `bookings` table
- [ ] Create indexes for performance

### Step 2: Location Tracking (1.5 hours)
- [ ] Implement POST `/drivers/location`
- [ ] Implement GET `/drivers/location`
- [ ] Add WebSocket event emission to passengers
- [ ] Test with mock frontend requests

### Step 3: SOS Emergency Alert (2-3 hours)
- [ ] Implement POST `/drivers/sos`
- [ ] Implement POST `/drivers/sos/cancel`
- [ ] Integrate with emergency service provider (Twilio/local)
- [ ] Set up SMS notifications to admin
- [ ] Add admin dashboard WebSocket events

### Step 4: Expense Tracking (1.5 hours)
- [ ] Implement POST `/drivers/expenses`
- [ ] Implement GET `/drivers/rides/{ride_id}/expenses`
- [ ] Implement DELETE `/drivers/expenses/{expense_id}`
- [ ] Implement PATCH `/drivers/expenses/{expense_id}`
- [ ] Update ride earnings calculation to deduct expenses

### Step 5: Testing & Integration (1.5 hours)
- [ ] Unit tests for each endpoint
- [ ] Integration tests with frontend
- [ ] Load testing for location updates (10/sec)
- [ ] Test error scenarios (missing ride, invalid token, etc.)

---

## 🚀 Deployment Notes

1. **Location Update Frequency**: Frontend sends every 10-30 seconds. Consider:
   - Batch updates if high volume
   - Archive old locations after 7 days
   - Index on `(driver_id, created_at DESC)` for performance

2. **SOS Alert**: Emergency service integration is critical
   - Use queue/background job for Twilio calls (don't block)
   - Implement retry logic with exponential backoff
   - Log all SOS events for audit trail

3. **Expense Tracking**: No special considerations
   - Simple CRUD operations
   - Ensure amounts are non-negative
   - Consider implementing receipt image validation

4. **WebSocket Events**: Required for real-time updates
   - Emit location to active passengers
   - Emit SOS/cancel to admins
   - Consider message compression for frequent location updates

---

## 📞 Questions?

Refer to frontend implementation at: `src/hooks/useGPSTracking.js`, `useSOSAlert.js`, `useExpenseTracking.js`

All API contracts are documented in hook code comments.
