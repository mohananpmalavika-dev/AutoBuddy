# Database Schema

## 1. Overview
This document describes the primary database entities and relationships used by AutoBuddy.

## 2. Core Tables
### users
- `id`
- `name`
- `email`
- `phone`
- `role` (passenger, driver, admin)
- `status`
- `password_hash`
- `created_at`
- `updated_at`

### rides
- `id`
- `passenger_id`
- `driver_id`
- `pickup_location`
- `dropoff_location`
- `status`
- `fare`
- `distance`
- `eta`
- `created_at`
- `updated_at`

### payments
- `id`
- `ride_id`
- `user_id`
- `amount`
- `currency`
- `status`
- `payment_provider_id`
- `created_at`
- `updated_at`

### driver_profiles
- `driver_id`
- `license_number`
- `vehicle_registration`
- `kyc_status`
- `documents`
- `rating`
- `available_since`

## 3. Supporting Tables
- `messages`: in-app chat history.
- `locations`: saved pickup/dropoff points.
- `transactions`: payment and refund ledger.
- `audit_logs`: admin and ride event history.

## 4. Relationships
- `users.id` → `rides.passenger_id`
- `users.id` → `rides.driver_id`
- `rides.id` → `payments.ride_id`
- `users.id` → `driver_profiles.driver_id`

## 5. Indexing
- Index on `users.email` and `users.phone`.
- Index on `rides.status` and `rides.created_at`.
- Spatial index on `rides.pickup_location` if location queries are required.

## 6. Data Retention
- Keep ride and payment history for operational reporting.
- Archive or delete stale KYC documents per policy and local regulations.
