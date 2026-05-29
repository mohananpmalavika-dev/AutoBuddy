# AutoBuddy - Quick Fix Priority List
**Last Updated**: May 29, 2026  
**For**: Development Team  
**Urgency**: 🔴 HIGH - These block production deployment

---

## 🔴 TIER 1: CRITICAL BLOCKERS (Do These First)

### 1. Implement Driver Accept/Decline Workflow
**Blocks**: Drivers can't respond to ride requests  
**Effort**: 6-8 hours  
**Impact**: Core functionality

**What to build**:
```python
# backend/app/routers/bookings_core.py - NEW FILE

@app.post("/bookings/{booking_id}/accept")
async def accept_ride(booking_id: str, driver_id: str):
    # Mark booking status as ACCEPTED
    # Notify passenger
    # Cancel other driver offers
    # Start 30-minute ride timer

@app.post("/bookings/{booking_id}/decline")  
async def decline_ride(booking_id: str, driver_id: str):
    # Mark as DECLINED by this driver
    # Reassign to next available driver
    # Notify driver of reassignment
```

**Frontend already ready**: `RideCard.js` waiting to call these endpoints

---

### 2. Implement Real-time Location Broadcasting
**Blocks**: Passengers can't track driver location  
**Effort**: 4-6 hours  
**Impact**: Core user experience

**What to fix**:
```javascript
// backend/server.py - UPDATE Socket.IO handler (line ~14160)

// CURRENT (broken): Receives location but doesn't send to passenger
@io.on('ride_location_update')
def handle_location_update(data):
    # ❌ Just stores location
    
// FIXED: Broadcast to waiting passenger
@io.on('ride_location_update')
def handle_location_update(data):
    driver_id = data['driver_id']
    location = data['location']
    booking_id = data['booking_id']
    
    # Send to passenger waiting for this ride
    io.emit('driver_location_update', {
        'booking_id': booking_id,
        'driver_location': location,
        'eta_seconds': calculate_eta(location, destination)
    }, room=f'passenger_{booking.passenger_id}')
```

**Frontend already ready**: `PassengerMap.web.js` listening for this event

---

### 3. Implement Payment Intent Creation (Stripe)
**Blocks**: Can't charge users, no payment flow  
**Effort**: 6-8 hours  
**Impact**: Revenue impossible

**What to build**:
```python
# backend/app/routers/payments.py - NEW FILE

import stripe

@app.post("/payments/stripe/intent")
async def create_payment_intent(booking_id: str, amount: float):
    try:
        intent = stripe.PaymentIntent.create(
            amount=int(amount * 100),  # Convert to cents
            currency="inr",
            metadata={
                'booking_id': booking_id,
                'customer_id': user.id
            }
        )
        return {"client_secret": intent.client_secret}
    except stripe.error.StripeError as e:
        return {"error": str(e)}, 400

@app.post("/payments/webhooks/stripe")
async def handle_stripe_webhook(request: Request):
    # Handle payment.intent.succeeded
    # Handle payment.intent.payment_failed
    # Update booking status & generate receipt
```

**Stripe API Key**: Add to environment variables

---

### 4. Fix Ride Status Transitions
**Blocks**: Incomplete ride lifecycle, can't mark rides as complete  
**Effort**: 4-6 hours  
**Impact**: Can't process completed rides

**What to build**:
```python
# backend/app/routers/driver_operations.py - NEW FILE

@app.post("/bookings/{booking_id}/start")
async def start_ride(booking_id: str, driver_id: str):
    # Change status ACCEPTED → IN_PROGRESS
    # Notify passenger: "Driver is on the way"
    # Start ride timer

@app.post("/bookings/{booking_id}/complete")
async def complete_ride(booking_id: str, driver_id: str, 
                        final_location: dict, distance_km: float):
    # Change status IN_PROGRESS → COMPLETED
    # Recalculate final fare based on actual distance
    # Create payment record
    # Notify both users
    # Generate receipt
```

---

### 5. Implement Driver Availability Toggle
**Blocks**: Drivers always appear as available, can't go offline  
**Effort**: 2-3 hours  
**Impact**: Driver experience

**What to build**:
```python
@app.patch("/drivers/{driver_id}/availability")
async def update_availability(driver_id: str, available: bool):
    driver = await db.drivers.find_one_and_update(
        {'_id': ObjectId(driver_id)},
        {'$set': {'is_available': available}},
        return_document=True
    )
    
    # Broadcast to dispatch system
    io.emit('driver_availability_changed', {
        'driver_id': driver_id,
        'available': available
    }, room='dispatch')
```

---

## 🟡 TIER 2: HIGH PRIORITY (Next Sprint)

### 6. Implement Intelligent Driver Dispatch
**Blocks**: Rides go to random drivers, not nearest/best  
**Effort**: 8-10 hours  
**Impact**: Driver acceptance rate, ride quality

**What to build**:
```python
# backend/app/services/dispatcher.py - NEW FILE

class RideDispatcher:
    async def find_best_drivers(self, passenger_location, ride_type, budget):
        # 1. Get all drivers within 2km radius
        nearby_drivers = await db.drivers.find({
            'location': {
                '$near': {
                    '$geometry': {
                        'type': 'Point',
                        'coordinates': [passenger_location['lng'], 
                                      passenger_location['lat']]
                    },
                    '$maxDistance': 2000  # 2km
                }
            },
            'is_available': True,
            'current_ride': None
        }).to_list(50)
        
        # 2. Score drivers by: rating, acceptance_rate, vehicle_type, surge
        scored_drivers = [
            {
                'driver': driver,
                'score': self.calculate_score(driver, ride_type),
                'eta': self.calculate_eta(driver['location'], passenger_location)
            }
            for driver in nearby_drivers
        ]
        
        # 3. Return top 5 drivers, sorted by score
        return sorted(scored_drivers, key=lambda x: x['score'], 
                     reverse=True)[:5]
    
    def calculate_score(self, driver, ride_type):
        # Score = rating (40%) + acceptance_rate (30%) + 
        #         speed_to_pickup (20%) + vehicle_match (10%)
        score = (driver['rating'] * 0.4 + 
                driver['acceptance_rate'] * 0.3 +
                (100 - driver['avg_pickup_time_seconds']/60) * 0.2 +
                (1.0 if driver['vehicle_type'] == ride_type else 0.5) * 0.1)
        return score
```

---

### 7. Add Ride History Filtering
**Blocks**: Passengers see all rides with no search  
**Effort**: 3-4 hours  
**Impact**: UX improvement

**What to fix**:
```python
# backend/app/routers/ride_history.py - UPDATE

@app.get("/bookings")
async def get_ride_history(
    user_id: str,
    status: Optional[str] = None,  # completed, cancelled, ongoing
    start_date: Optional[str] = None,  # YYYY-MM-DD
    end_date: Optional[str] = None,
    ride_type: Optional[str] = None,
    page: int = 1,
    limit: int = 20
):
    query = {'passenger_id': ObjectId(user_id)}
    
    # Add filters
    if status:
        query['status'] = status
    if start_date:
        query['created_at'] = {'$gte': datetime.fromisoformat(start_date)}
    if ride_type:
        query['ride_type'] = ride_type
    
    # Pagination
    skip = (page - 1) * limit
    rides = await db.bookings.find(query)\
        .skip(skip).limit(limit).to_list(limit)
    
    return {'rides': rides, 'total': count, 'page': page}
```

**Frontend waiting**: `RideHistoryPanel.js` ready to filter

---

### 8. Implement Fare Breakdown Display
**Blocks**: Passengers don't see fare components  
**Effort**: 3-4 hours  
**Impact**: Transparency, trust

**What to fix**:
```python
# backend/app/routers/fares.py - UPDATE fare/estimate endpoint

@app.post("/fares/estimate")
async def estimate_fare(start_location, end_location, ride_type):
    distance_km = calculate_distance(start_location, end_location)
    duration_minutes = estimate_duration(distance_km)
    base_fare = get_base_fare(ride_type)
    
    # Calculate components
    distance_charge = distance_km * get_per_km_rate(ride_type)
    time_charge = duration_minutes * get_per_minute_rate(ride_type)
    surge_multiplier = await get_surge_multiplier()
    subtotal = (base_fare + distance_charge + time_charge) * surge_multiplier
    taxes = subtotal * 0.05  # 5% tax
    discount = apply_user_discount(user_id)
    total = subtotal + taxes - discount
    
    return {
        'base_fare': base_fare,
        'distance_km': distance_km,
        'distance_charge': distance_charge,
        'duration_minutes': duration_minutes,
        'time_charge': time_charge,
        'surge_multiplier': surge_multiplier,
        'subtotal': subtotal,
        'taxes': taxes,
        'discount': discount,
        'total_fare': total,
        'estimated_time': f"{duration_minutes} min",
        'estimated_distance': f"{distance_km} km"
    }
```

---

## 🟠 TIER 3: MEDIUM PRIORITY (Nice to Have)

### 9. Implement Ride Pooling Algorithm
- Frontend UI ready in `RidePoolingPanel.js`
- Match passengers with similar routes
- Split fare calculation

### 10. Implement Notification System
- Push notifications when ride status changes
- Notification preferences per user
- Notification history storage

### 11. Add Support Ticket System
- Create/track support issues
- Chat with support team
- Track resolution status

### 12. Implement Driver Analytics
- Earnings breakdown
- Trip statistics
- Performance metrics

---

## Implementation Priority Summary

```
WEEK 1: Tier 1 Critical Blockers
├── Monday: Accept/Decline workflow (#1)
├── Tuesday: Location Broadcasting (#2)
├── Wednesday: Payment Intent (#3)
├── Thursday: Status Transitions (#4)
└── Friday: Availability Toggle (#5)

WEEK 2: Tier 2 High Priority
├── Monday-Tuesday: Dispatch Algorithm (#6)
├── Wednesday: History Filtering (#7)
├── Thursday: Fare Breakdown (#8)
└── Friday: Code review & testing

WEEK 3+: Tier 3 & Refactoring
├── Architecture cleanup
├── Test coverage
└── Optimization
```

---

## Testing Checklist (Before Going Live)

- [ ] Driver can accept ride within 30 seconds
- [ ] Driver can decline ride and it reassigns
- [ ] Passenger sees driver location update in real-time
- [ ] Payment processes without errors
- [ ] Ride completion generates receipt
- [ ] Driver can toggle availability on/off
- [ ] Dispatch offers rides to nearest drivers first
- [ ] Ride history filters work correctly
- [ ] Fare breakdown shows all components
- [ ] No sensitive data exposed in API responses
- [ ] System handles 100+ concurrent rides
- [ ] WebSocket reconnections work smoothly

---

## File Structure to Create

```
backend/app/
├── routers/
│   ├── bookings_core.py          (NEW - #1,#4)
│   ├── driver_operations.py      (NEW - #2,#5)
│   ├── payments.py               (NEW - #3)
│   └── ride_history.py           (UPDATE - #7)
├── services/
│   ├── dispatcher.py             (NEW - #6)
│   └── surge_calculator.py       (NEW - #6)
├── webhooks/
│   └── stripe.py                 (NEW - #3)
└── server.py                     (REDUCE from 14,500 to 3,000 lines)
```

---

## Success Metrics

After implementing all Tier 1 items:
- ✅ Drivers can complete full ride workflow
- ✅ Real-time tracking works
- ✅ Payments process
- ✅ Passengers see ride history
- ✅ Basic dispatch works

**Estimated Time**: 2-3 weeks for experienced developer

