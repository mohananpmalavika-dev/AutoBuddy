# 🚀 TIER 2 FEATURE IMPLEMENTATION PLAN

**Status**: Planning Phase  
**Date**: May 29, 2026  
**Priority**: High (Important for driver retention)  
**Estimated Duration**: 3-4 weeks  

---

## 📋 TIER 2 Features (5 Total)

### 1. **Auto-Decline Ride Filters** ⭐ HIGHEST PRIORITY
Driver can set rules to auto-reject rides that don't match criteria
- Distance filter (max pickup distance)
- Passenger rating minimum
- Pickup location preferences
- Time of day restrictions

**Frontend**: 
- Hook: `useRideFilters.js` - Manage filter preferences
- Component: `RideFilterPanel.js` - Settings UI
- Location: Account → Settings → Ride Filters

**Backend**:
- POST `/api/drivers/ride-filters` - Save filter preferences
- GET `/api/drivers/ride-filters` - Get current filters
- POST `/api/drivers/rides/{id}/auto-decide` - Apply filters to incoming request

---

### 2. **Passenger Ratings Preview** ⭐ HIGH PRIORITY
Show passenger rating/reviews before driver accepts ride
- Display passenger avg rating (1-5 stars)
- Show recent review snippets
- Color-coded urgency indicators

**Frontend**:
- Hook: `usePassengerRating.js` - Fetch passenger ratings
- Component: `PassengerPreview.js` - Rating display in request card
- Location: Ride Request Card

**Backend**:
- GET `/api/passengers/{id}/ratings` - Get passenger avg rating
- GET `/api/passengers/{id}/reviews` - Get recent reviews (3-5 latest)
- Integrate into ride request response

---

### 3. **Vehicle Maintenance Alerts** ⭐ HIGH PRIORITY
Proactive notifications for vehicle maintenance schedules
- Track service intervals (oil, tires, inspection)
- Auto-alert when due
- Document expiry tracking (insurance, registration)

**Frontend**:
- Hook: `useVehicleMaintenance.js` - Fetch maintenance schedule
- Component: `MaintenanceAlertPanel.js` - Alert dashboard
- Location: Account → Vehicle → Maintenance

**Backend**:
- POST `/api/drivers/vehicles/{id}/maintenance` - Log maintenance
- GET `/api/drivers/vehicles/{id}/maintenance-due` - Get due alerts
- PATCH `/api/drivers/vehicles/{id}/maintenance/{id}` - Update service record

---

### 4. **Weekly Earning Targets & Bonuses** ⭐ MEDIUM PRIORITY
Gamification to motivate drivers with earning goals
- Set weekly earning targets
- Track progress toward goal
- Bonus multiplier when target exceeded
- Display remaining hours to hit target

**Frontend**:
- Hook: `useEarningTarget.js` - Fetch target and progress
- Component: `EarningTargetWidget.js` - Visual progress tracker
- Location: Earnings Tab (prominent display)

**Backend**:
- POST `/api/drivers/earning-targets` - Create/update target
- GET `/api/drivers/earning-targets/current` - Get weekly target
- GET `/api/drivers/earning-targets/progress` - Get current progress
- POST `/api/drivers/earning-targets/bonuses` - Track bonuses earned

---

### 5. **Bank Account & Payout Scheduling** ⭐ MEDIUM PRIORITY
Multiple bank accounts + scheduled automatic payouts
- Add/remove bank accounts (Razorpay, UPI, bank transfer)
- Set auto-payout schedule (daily, weekly, monthly)
- View payout history with reconciliation
- Set minimum payout threshold

**Frontend**:
- Hook: `usePaymentMethods.js` - Manage accounts
- Component: `PaymentMethodsPanel.js` - Bank account UI
- Component: `PayoutScheduleWidget.js` - Schedule settings
- Location: Account → Payments

**Backend**:
- POST `/api/drivers/payment-methods` - Add bank account
- GET `/api/drivers/payment-methods` - List accounts
- PATCH `/api/drivers/payment-methods/{id}` - Update account
- DELETE `/api/drivers/payment-methods/{id}` - Remove account
- POST `/api/drivers/payout-schedule` - Set payout schedule
- GET `/api/drivers/payouts/history` - Payout history

---

## 🗓️ IMPLEMENTATION TIMELINE

```
Week 1-2: Auto-Decline Filters + Passenger Ratings Preview
├─ Frontend: useRideFilters, RideFilterPanel (4 hours)
├─ Frontend: usePassengerRating, PassengerPreview (4 hours)
├─ Backend: Ride filter endpoints (8 hours)
├─ Backend: Passenger rating endpoints (6 hours)
└─ Database: New tables + migrations (4 hours)

Week 3: Vehicle Maintenance + Earning Targets
├─ Frontend: useVehicleMaintenance, MaintenanceAlertPanel (5 hours)
├─ Frontend: useEarningTarget, EarningTargetWidget (5 hours)
├─ Backend: Maintenance endpoints (6 hours)
├─ Backend: Earning target endpoints (6 hours)
└─ Database: Maintenance tables + migrations (3 hours)

Week 4: Payment Methods + Testing
├─ Frontend: usePaymentMethods, PaymentMethodsPanel (6 hours)
├─ Frontend: usePayoutSchedule, PayoutScheduleWidget (4 hours)
├─ Backend: Payment method endpoints (8 hours)
├─ Backend: Payout schedule endpoints (8 hours)
├─ Testing: Full E2E testing (8 hours)
└─ Deployment: Staging + Production (4 hours)

Total: ~96 hours (12 dev days @ 8hr/day)
```

---

## 📊 TIER 2 vs TIER 1 Comparison

| Aspect | TIER 1 | TIER 2 |
|--------|--------|--------|
| **Focus** | Safety & Accuracy | Retention & Engagement |
| **User Impact** | Core necessity | Experience enhancement |
| **Complexity** | Medium | High |
| **Database Tables** | 4 | 6-8 |
| **API Endpoints** | 11 | 20+ |
| **Frontend Hooks** | 4 | 5 |
| **Frontend Components** | 3 | 8-10 |
| **Dev Effort** | 40 hours | 96 hours |
| **Risk Level** | Low | Medium |

---

## 🔧 Technical Architecture

### Database Schema Changes

#### 1. Ride Filters Table
```sql
CREATE TABLE ride_filter_preferences (
    id VARCHAR(36) PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    
    max_pickup_distance_km INT,
    min_passenger_rating FLOAT,
    
    allowed_pickup_areas JSON,  -- list of zones/areas
    blocked_pickup_areas JSON,
    
    time_slot_restrictions JSON,  -- {"start": "22:00", "end": "06:00"}
    
    auto_decline_enabled BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 2. Vehicle Maintenance Table
```sql
CREATE TABLE vehicle_maintenance (
    id VARCHAR(36) PRIMARY KEY,
    vehicle_id VARCHAR(36) NOT NULL,
    driver_id VARCHAR(255) NOT NULL,
    
    maintenance_type VARCHAR(50),  -- "oil_change", "tire", "inspection", etc.
    service_date DATE,
    next_due_date DATE,
    
    details TEXT,
    cost DECIMAL(10, 2),
    receipt_url VARCHAR(500),
    
    status VARCHAR(50),  -- "completed", "scheduled", "overdue", "pending"
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (driver_id) REFERENCES users(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

CREATE TABLE vehicle_document_expiry (
    id VARCHAR(36) PRIMARY KEY,
    vehicle_id VARCHAR(36) NOT NULL,
    driver_id VARCHAR(255) NOT NULL,
    
    document_type VARCHAR(50),  -- "insurance", "registration", "permit", "inspection"
    expiry_date DATE,
    
    alert_days_before INT DEFAULT 30,
    last_alert_sent TIMESTAMP,
    
    document_url VARCHAR(500),
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (driver_id) REFERENCES users(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);
```

#### 3. Earning Targets Table
```sql
CREATE TABLE earning_targets (
    id VARCHAR(36) PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    
    target_amount DECIMAL(10, 2),
    target_period VARCHAR(20),  -- "daily", "weekly", "monthly"
    target_week_start DATE,
    
    bonus_multiplier FLOAT DEFAULT 1.5,
    bonus_threshold_amount DECIMAL(10, 2),
    
    current_earnings DECIMAL(10, 2) DEFAULT 0,
    bonus_earned DECIMAL(10, 2) DEFAULT 0,
    
    status VARCHAR(50),  -- "active", "completed", "failed", "pending"
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 4. Payment Methods Table
```sql
CREATE TABLE driver_payment_methods (
    id VARCHAR(36) PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    
    method_type VARCHAR(50),  -- "bank_transfer", "upi", "wallet", "razorpay"
    
    account_holder_name VARCHAR(255),
    account_number VARCHAR(50),
    ifsc_code VARCHAR(20),
    bank_name VARCHAR(255),
    
    upi_id VARCHAR(100),
    
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    verification_status VARCHAR(50),  -- "pending", "verified", "failed"
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE payout_schedule_config (
    id VARCHAR(36) PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    
    payment_method_id VARCHAR(36) NOT NULL,
    
    schedule_type VARCHAR(50),  -- "daily", "weekly", "monthly", "manual"
    
    day_of_week INT,  -- 1-7 (Monday-Sunday) for weekly
    day_of_month INT,  -- 1-31 for monthly
    scheduled_time TIME,
    
    minimum_balance_threshold DECIMAL(10, 2),
    
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (driver_id) REFERENCES users(id),
    FOREIGN KEY (payment_method_id) REFERENCES driver_payment_methods(id)
);

CREATE TABLE payout_history (
    id VARCHAR(36) PRIMARY KEY,
    driver_id VARCHAR(255) NOT NULL,
    payment_method_id VARCHAR(36) NOT NULL,
    
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50),  -- "pending", "processing", "completed", "failed"
    
    transaction_id VARCHAR(100),
    reference_number VARCHAR(100),
    
    scheduled_for TIMESTAMP,
    processed_at TIMESTAMP,
    
    failure_reason TEXT,
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (driver_id) REFERENCES users(id),
    FOREIGN KEY (payment_method_id) REFERENCES driver_payment_methods(id)
);
```

---

## 📚 Frontend Architecture

### Hooks to Create (5)

1. **useRideFilters.js** (120 lines)
   - Load current filter preferences
   - Save/update filters
   - Apply filters locally to incoming requests

2. **usePassengerRating.js** (80 lines)
   - Fetch passenger average rating
   - Cache ratings for 5 minutes
   - Return rating + recent reviews

3. **useVehicleMaintenance.js** (150 lines)
   - Fetch maintenance schedule
   - Track maintenance history
   - Calculate due dates
   - Alert for overdue items

4. **useEarningTarget.js** (100 lines)
   - Load current weekly target
   - Calculate progress percentage
   - Track bonus earned
   - Calculate hours remaining

5. **usePaymentMethods.js** (140 lines)
   - List all payment methods
   - Add/remove methods
   - Set primary method
   - Configure payout schedule

### Components to Create (8-10)

1. **RideFilterPanel.js** (200 lines)
   - Filter configuration form
   - Distance slider
   - Rating selector
   - Area picker
   - Time restrictions

2. **PassengerPreview.js** (100 lines)
   - Stars display
   - Recent review snippet
   - Color-coded rating
   - Confidence indicator

3. **MaintenanceAlertPanel.js** (250 lines)
   - Alert list with due items
   - Service history
   - Schedule new service modal
   - Document expiry tracker

4. **EarningTargetWidget.js** (180 lines)
   - Progress bar
   - Target amount display
   - Hours remaining
   - Bonus indicator
   - Achievement badges

5. **PaymentMethodsPanel.js** (300 lines)
   - List of bank accounts
   - Add/edit/remove forms
   - Primary method selector
   - Verification status display

6. **PayoutScheduleWidget.js** (200 lines)
   - Schedule type selector
   - Day/time picker
   - Minimum balance input
   - Auto-payout toggle

---

## 🎯 Success Metrics

### Feature Adoption
- [ ] 70%+ of drivers enable auto-decline filters within 2 weeks
- [ ] 80%+ of drivers set earning targets
- [ ] 60%+ add multiple payment methods

### Business Impact
- [ ] 15% increase in daily active drivers
- [ ] 20% reduction in ride rejection rates
- [ ] 30% increase in average driver earning targets hit
- [ ] 50% reduction in payout processing errors

### Quality Metrics
- [ ] 99%+ uptime for filter evaluation
- [ ] <500ms latency for passenger rating fetch
- [ ] <100ms for maintenance alert calculation
- [ ] Zero false maintenance alerts

---

## ⚠️ Risk Assessment

### Technical Risks
- **Real-time Filter Evaluation**: May impact ride dispatch latency (mitigation: async processing)
- **Passenger Rating Cache Staleness**: Could show outdated ratings (mitigation: 5-min TTL)
- **Payment Method Verification**: Bank API integration complexity (mitigation: use Razorpay/Stripe)

### Business Risks
- **Over-filtering**: Drivers may filter too aggressively, reducing utilization
  - Mitigation: Show filter impact on estimated rides per day
- **Target Demotivation**: If targets unrealistic, drivers may disengage
  - Mitigation: A/B test target amounts, adjust based on driver profile

### User Experience Risks
- **Settings Complexity**: Too many options could confuse users
  - Mitigation: Provide sensible defaults, progressive disclosure

---

## 🚀 Ready to Proceed?

### Prerequisites Met ✅
- TIER 1 completely implemented and tested
- Backend infrastructure in place
- Database migration framework ready
- API patterns established

### Next Steps
1. ✅ Review this TIER 2 plan
2. ⏳ Create backend models (tier2_models.py)
3. ⏳ Implement 20+ API endpoints
4. ⏳ Create 5 frontend hooks
5. ⏳ Create 8-10 frontend components
6. ⏳ Database migration for 6 new tables
7. ⏳ Comprehensive testing
8. ⏳ Staging deployment

---

**Ready to begin TIER 2 implementation?** ✨
