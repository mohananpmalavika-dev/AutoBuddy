# MongoDB Schema Documentation

## Overview

AutoBuddy uses MongoDB as the primary data store for flexibility and scalability. This document outlines all collections, fields, indexes, and relationships.

## Database Configuration

- **Database Name**: `autobuddy_db`
- **Connection**: MongoDB Atlas (production) / Local MongoDB (development)
- **Replication**: Enabled in production
- **Backup**: Daily automated backups

---

## Collections

### 1. users

**Purpose**: Store all user accounts (passengers, drivers, operators, admins)

```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  phone: String (unique, indexed),
  password_hash: String,
  name: String,
  role: String, // "passenger", "driver", "operator", "admin"
  profile_picture: String (URL),
  is_active: Boolean,
  is_verified: Boolean,
  verification_documents: [{
    type: String,
    url: String,
    verified_at: Date
  }],
  created_at: Date (indexed),
  updated_at: Date,
  last_login: Date,
  preferences: {
    language: String,
    currency: String,
    notifications_enabled: Boolean
  }
}
```

**Indexes**:
- `email` (unique)
- `phone` (unique)
- `role`
- `created_at` (desc)
- `is_active`
- `{email, is_active}` (compound)

**Relationships**:
- 1:1 with `drivers` (if role='driver')
- 1:Many with `rides` (as passenger or driver)
- 1:Many with `payments`

---

### 2. rides

**Purpose**: Store ride booking and trip information

```javascript
{
  _id: ObjectId,
  passenger_id: ObjectId (ref: users, indexed),
  driver_id: ObjectId (ref: users, indexed, nullable),
  status: String (indexed), // "pending", "accepted", "in_progress", "completed", "cancelled"
  ride_type: String, // "standard", "premium", "shared", "airport", "rental"
  
  pickup_location: {
    type: "Point",
    coordinates: [longitude, latitude], // GeoJSON (indexed)
    address: String,
    landmark: String
  },
  
  dropoff_location: {
    type: "Point",
    coordinates: [longitude, latitude], // GeoJSON (indexed)
    address: String,
    landmark: String
  },
  
  fare: {
    base_fare: Number,
    distance_fare: Number,
    time_fare: Number,
    surge_multiplier: Number,
    total: Number,
    currency: String
  },
  
  distance_km: Number,
  estimated_duration_minutes: Number,
  actual_duration_minutes: Number,
  
  scheduled_time: Date (indexed, nullable),
  accepted_at: Date,
  started_at: Date,
  completed_at: Date,
  cancelled_at: Date,
  cancellation_reason: String,
  
  payment_method: String, // "card", "upi", "cash", "wallet"
  payment_status: String, // "pending", "completed", "failed", "refunded"
  
  driver_rating: Number (1-5),
  passenger_rating: Number (1-5),
  
  created_at: Date (indexed),
  updated_at: Date
}
```

**Indexes**:
- `passenger_id`
- `driver_id`
- `status`
- `created_at` (desc)
- `scheduled_time`
- `pickup_location` (2dsphere)
- `dropoff_location` (2dsphere)
- `{passenger_id, status}` (compound)
- `{driver_id, status}` (compound)
- `{status, created_at}` (compound)

---

### 3. drivers

**Purpose**: Extended driver profile information

```javascript
{
  _id: ObjectId,
  user_id: ObjectId (ref: users, unique, indexed),
  license_number: String (unique),
  license_expiry: Date,
  is_available: Boolean (indexed),
  is_verified: Boolean,
  
  current_location: {
    type: "Point",
    coordinates: [longitude, latitude], // GeoJSON (indexed)
    last_updated: Date
  },
  
  rating: Number (indexed),
  total_rides: Number (indexed),
  total_earnings: Number,
  
  vehicle_type: String, // "sedan", "suv", "auto", "bike"
  tier: String, // "bronze", "silver", "gold", "platinum"
  
  documents: {
    license: { url: String, verified: Boolean },
    insurance: { url: String, verified: Boolean },
    background_check: { url: String, verified: Boolean }
  },
  
  availability_schedule: [{
    day: String,
    start_time: String,
    end_time: String
  }],
  
  created_at: Date,
  updated_at: Date
}
```

**Indexes**:
- `user_id` (unique)
- `is_available`
- `current_location` (2dsphere)
- `rating` (desc)
- `total_rides` (desc)
- `{is_available, current_location}` (compound)
- `{vehicle_type, is_available}` (compound)

---

### 4. vehicles

**Purpose**: Vehicle information for drivers

```javascript
{
  _id: ObjectId,
  driver_id: ObjectId (ref: drivers, indexed),
  registration_number: String (unique, indexed),
  vehicle_type: String (indexed),
  make: String,
  model: String,
  year: Number,
  color: String,
  
  is_verified: Boolean (indexed),
  insurance_expiry: Date,
  pollution_check_expiry: Date,
  
  documents: {
    registration: { url: String, verified: Boolean },
    insurance: { url: String, verified: Boolean },
    pollution: { url: String, verified: Boolean },
    photos: [String]
  },
  
  created_at: Date,
  updated_at: Date
}
```

**Indexes**:
- `driver_id`
- `registration_number` (unique)
- `vehicle_type`
- `is_verified`

---

### 5. payments

**Purpose**: Payment transactions

```javascript
{
  _id: ObjectId,
  ride_id: ObjectId (ref: rides, indexed),
  user_id: ObjectId (ref: users, indexed),
  amount: Number,
  currency: String,
  payment_method: String (indexed), // "card", "upi", "cash", "wallet"
  status: String (indexed), // "pending", "processing", "completed", "failed", "refunded"
  
  transaction_id: String (unique, indexed),
  gateway: String, // "stripe", "razorpay", "paytm"
  
  stripe_payment_intent_id: String,
  upi_transaction_id: String,
  
  metadata: Object,
  
  created_at: Date (indexed),
  updated_at: Date,
  completed_at: Date
}
```

**Indexes**:
- `ride_id`
- `user_id`
- `status`
- `created_at` (desc)
- `payment_method`
- `transaction_id` (unique, sparse)
- `{user_id, status}` (compound)

---

### 6. bookings

**Purpose**: Scheduled ride bookings

```javascript
{
  _id: ObjectId,
  user_id: ObjectId (ref: users, indexed),
  ride_id: ObjectId (ref: rides, indexed, nullable),
  status: String (indexed), // "scheduled", "confirmed", "completed", "cancelled"
  
  pickup_location: Object,
  dropoff_location: Object,
  booking_time: Date (indexed),
  scheduled_time: Date,
  
  preferences: {
    vehicle_type: String,
    driver_gender: String,
    amenities: [String]
  },
  
  created_at: Date,
  updated_at: Date
}
```

**Indexes**:
- `user_id`
- `ride_id`
- `status`
- `booking_time` (desc)
- `{user_id, status}` (compound)

---

### 7. notifications

**Purpose**: User notifications

```javascript
{
  _id: ObjectId,
  user_id: ObjectId (ref: users, indexed),
  type: String, // "ride_update", "payment", "promotion", "system"
  title: String,
  message: String,
  data: Object,
  
  is_read: Boolean (indexed),
  is_push_sent: Boolean,
  
  created_at: Date (indexed, TTL: 30 days),
  read_at: Date
}
```

**Indexes**:
- `user_id`
- `is_read`
- `created_at` (desc, TTL: 30 days)
- `{user_id, is_read}` (compound)

**TTL**: Documents automatically deleted after 30 days

---

### 8. reviews

**Purpose**: Ratings and reviews for rides

```javascript
{
  _id: ObjectId,
  ride_id: ObjectId (ref: rides, indexed),
  reviewer_id: ObjectId (ref: users, indexed),
  reviewee_id: ObjectId (ref: users, indexed),
  reviewer_type: String, // "passenger", "driver"
  
  rating: Number (1-5, indexed),
  comment: String,
  tags: [String], // "punctual", "clean", "polite", etc.
  
  created_at: Date (indexed),
  updated_at: Date
}
```

**Indexes**:
- `ride_id`
- `reviewer_id`
- `reviewee_id`
- `rating` (desc)
- `created_at` (desc)

---

### 9. sessions

**Purpose**: User authentication sessions

```javascript
{
  _id: ObjectId,
  user_id: ObjectId (ref: users, indexed),
  token: String (unique, indexed),
  refresh_token: String,
  device_info: {
    device_type: String,
    os: String,
    app_version: String,
    device_id: String
  },
  ip_address: String,
  
  created_at: Date,
  expires_at: Date (indexed, TTL: 0),
  last_activity: Date
}
```

**Indexes**:
- `user_id`
- `token` (unique)
- `expires_at` (TTL: auto-delete expired)

**TTL**: Documents automatically deleted when `expires_at` is reached

---

### 10. support_tickets

**Purpose**: Customer support tickets

```javascript
{
  _id: ObjectId,
  user_id: ObjectId (ref: users, indexed),
  ride_id: ObjectId (ref: rides, indexed, nullable),
  type: String, // "payment", "driver", "app_bug", "other"
  subject: String,
  description: String,
  status: String (indexed), // "open", "in_progress", "resolved", "closed"
  priority: String (indexed), // "low", "medium", "high", "urgent"
  
  assigned_to: ObjectId (ref: users, nullable),
  
  messages: [{
    sender_id: ObjectId,
    message: String,
    timestamp: Date,
    attachments: [String]
  }],
  
  created_at: Date (indexed),
  updated_at: Date,
  resolved_at: Date
}
```

**Indexes**:
- `user_id`
- `ride_id`
- `status`
- `priority` (desc)
- `created_at` (desc)
- `{status, priority}` (compound)

---

### 11. promo_codes

**Purpose**: Promotional discount codes

```javascript
{
  _id: ObjectId,
  code: String (unique, indexed),
  description: String,
  discount_type: String, // "percentage", "fixed"
  discount_value: Number,
  max_discount: Number,
  
  is_active: Boolean (indexed),
  usage_limit: Number,
  usage_count: Number,
  
  valid_from: Date,
  valid_until: Date,
  
  applicable_to: {
    user_ids: [ObjectId],
    ride_types: [String],
    min_fare: Number
  },
  
  created_at: Date,
  updated_at: Date
}
```

**Indexes**:
- `code` (unique)
- `is_active`
- `{valid_from, valid_until}` (compound)

---

### 12. referrals

**Purpose**: Referral program tracking

```javascript
{
  _id: ObjectId,
  referrer_id: ObjectId (ref: users, indexed),
  referee_id: ObjectId (ref: users, indexed),
  referral_code: String (unique, indexed),
  
  status: String, // "pending", "completed", "rewarded"
  reward_amount: Number,
  
  created_at: Date,
  completed_at: Date,
  rewarded_at: Date
}
```

**Indexes**:
- `referrer_id`
- `referee_id`
- `referral_code` (unique)

---

## Data Relationships

```
users (1) ←→ (1) drivers
users (1) →  (∞) rides (as passenger)
users (1) →  (∞) rides (as driver)
users (1) →  (∞) payments
users (1) →  (∞) bookings
users (1) →  (∞) notifications
users (1) →  (∞) reviews (as reviewer)
users (1) →  (∞) reviews (as reviewee)
users (1) →  (∞) support_tickets

drivers (1) →  (∞) vehicles
drivers (1) →  (∞) rides

rides (1) →  (1) payments
rides (1) →  (∞) reviews

bookings (1) →  (0-1) rides
```

---

## Index Performance Guidelines

### Query Optimization

1. **Always use indexes for**:
   - Lookups by email, phone (unique indexes)
   - Filtering by status, role, is_active
   - Sorting by created_at, rating
   - Geospatial queries for location

2. **Compound indexes for**:
   - Common filter combinations (e.g., user_id + status)
   - Sort + filter queries (e.g., status + created_at)

3. **Geospatial indexes for**:
   - Finding nearby drivers: `drivers.current_location`
   - Ride location queries: `rides.pickup_location`, `rides.dropoff_location`

### Index Maintenance

```bash
# Create all indexes
python scripts/create_mongo_indexes.py

# Verify indexes
python scripts/create_mongo_indexes.py --verify-only

# Recreate indexes (drop and create)
python scripts/create_mongo_indexes.py --drop-existing

# Production deployment
python scripts/create_mongo_indexes.py --env production
```

---

## Migration Guidelines

### Adding a New Collection

1. Define schema in this document
2. Add index definitions to `scripts/create_mongo_indexes.py`
3. Create migration script if needed for existing data
4. Run index creation: `python scripts/create_mongo_indexes.py`
5. Test queries with `explain()` to verify index usage

### Adding a New Field

1. Update schema documentation
2. Add migration script if default value needed
3. Add index if field will be queried frequently
4. Update API models and schemas

### Modifying Index

1. Plan for zero-downtime: create new index first, then drop old
2. Monitor query performance during transition
3. Use `--drop-existing` flag carefully (causes downtime)

---

## Backup & Restore

### Backup

```bash
# Full database backup
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/autobuddy_db" --out=/backup/2026-07-09

# Single collection backup
mongodump --uri="..." --collection=users --out=/backup/users-2026-07-09

# Compressed backup
mongodump --uri="..." --gzip --archive=/backup/autobuddy-2026-07-09.gz
```

### Restore

```bash
# Full database restore
mongorestore --uri="mongodb+srv://user:pass@cluster.mongodb.net/autobuddy_db" /backup/2026-07-09

# Single collection restore
mongorestore --uri="..." --collection=users /backup/users-2026-07-09/autobuddy_db/users.bson

# From compressed archive
mongorestore --uri="..." --gzip --archive=/backup/autobuddy-2026-07-09.gz
```

---

## Monitoring

### Key Metrics to Monitor

1. **Index Usage**:
   ```javascript
   db.rides.aggregate([{ $indexStats: {} }])
   ```

2. **Slow Queries**: Enable profiling
   ```javascript
   db.setProfilingLevel(1, { slowms: 100 })
   db.system.profile.find().sort({ ts: -1 }).limit(10)
   ```

3. **Collection Stats**:
   ```javascript
   db.rides.stats()
   ```

4. **Index Size**:
   ```javascript
   db.rides.totalIndexSize()
   ```

---

## Security

### Authentication
- All connections require username/password or certificate
- Production uses MongoDB Atlas with IP whitelist
- Application uses dedicated service account

### Encryption
- Encryption at rest: Enabled in MongoDB Atlas
- Encryption in transit: TLS 1.2+ required
- Field-level encryption for sensitive data (planned)

### Access Control
- Least privilege principle
- Application service account: Read/Write on `autobuddy_db` only
- Admin users: Separate accounts with MFA
- Backup service account: Read-only access

---

## Performance Tuning

### Collection Sharding (Future)

When collections exceed 100M documents:

```javascript
// Enable sharding on database
sh.enableSharding("autobuddy_db")

// Shard rides collection by user_id
sh.shardCollection("autobuddy_db.rides", { "passenger_id": "hashed" })

// Shard payments by created_at (time-based)
sh.shardCollection("autobuddy_db.payments", { "created_at": 1 })
```

### Read Preference

- **Primary**: Writes, critical reads
- **Secondary**: Analytics, reporting queries
- **Nearest**: Geospatial queries for low latency

---

**Last Updated**: July 9, 2026  
**Schema Version**: 1.0  
**Maintainer**: Backend Team
