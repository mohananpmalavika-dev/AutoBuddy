# AutoBuddy Project Gap Analysis

Audit date: 2026-05-29  
Scope: backend APIs, mobile app API usage, existing project docs, pitch-deck docs, and automated test signals.

## Executive Verdict

AutoBuddy has strong feature breadth now. The older audit reports in the repo are partly stale: core booking, driver accept/reject, ride status updates, fare estimation, live driver tracking, notifications, receipts, wallet, subscriptions, KYC/document workflows, and admin controls are present in the current backend.

The project is not yet investor/demo/KSUM submission safe as a production product because of three main issues:

1. A backend import failure blocks some test modules and can block app startup.
2. Several mobile screens call stale or mismatched API contracts.
3. Critical production flows are not verified end to end, especially booking lifecycle and payments.

## What Is Already Covered

- Passenger booking creation, active booking lookup, booking history, receipt generation, cancellation, accept/reject, status progression, and OTP-protected trip start.
- Driver availability, nearby drivers, pending requests, active ride lookup, wallet, earnings, subscriptions, KYC/document flows, and location updates.
- Real-time ride tracking through Socket.IO events and booking room/user room emits.
- Fare estimation with breakdowns, surge, route source, and fraud/risk metadata.
- Notifications and read/delete endpoints.
- Payment order and verification support with UPI fallback and Stripe PaymentIntent support when configured.
- Admin areas for users, drivers, documents, security/audit logs, fare management, subscriptions, analytics, fraud/safety, and system controls.

## P0 Launch Blockers

### 1. Backend import/startup failure in fare proposal routers

Evidence:

- `backend/app/routers/driver_fare_proposals.py:12` imports `from app.database import db`
- `backend/app/routers/driver_fare_proposals.py:13` imports `from app.dependencies import require_roles`
- `backend/app/routers/admin_fare_proposals.py:12` imports `from app.database import db`
- `backend/app/routers/admin_fare_proposals.py:13` imports `from app.dependencies import require_roles`

Problem:

Those modules do not match the rest of the backend structure. Similar routers use `app.db.client.get_db` and `app.core.auth.require_roles`. Because `server.py` includes these routers, the backend test suite fails during import.

Impact:

Backend reliability is not acceptable for demo, investor due diligence, or KSUM technical review until this is fixed.

Recommended fix:

Normalize those routers to the same dependency pattern used by `driver_fare_override.py` and `admin_fare_management.py`, then rerun backend tests.

### 2. Mobile API helper has old-signature compatibility gaps

Evidence:

- `autobuddy-mobile/src/lib/api.js:137` defines `apiRequest(path, options = {}, legacyPath, legacyBody)`.
- The compatibility branch only checks `typeof options === 'string'`.

Problem:

Several screens still use calls shaped like `apiRequest('GET', '/api/path')` or pass extra positional arguments. The helper does not properly support that style, so affected screens can call the wrong URL with the wrong token/method.

Affected examples:

- `autobuddy-mobile/src/utils/AdminAuditLogger.js:75`
- `autobuddy-mobile/src/utils/AdminAuditLogger.js:124`
- `autobuddy-mobile/src/components/AdminDocumentRequirements.js:63`
- `autobuddy-mobile/src/components/AdminDocumentRequirements.js:122`
- `autobuddy-mobile/src/components/AdminDocumentRequirements.js:132`
- `autobuddy-mobile/src/components/AdminDocumentRequirements.js:153`
- `autobuddy-mobile/src/components/AdminRateLimitConfig.js:44`
- `autobuddy-mobile/src/components/AdminRateLimitConfig.js:56`
- `autobuddy-mobile/src/components/AdminRateLimitConfig.js:101`
- `autobuddy-mobile/src/components/AdminRateLimitConfig.js:129`
- `autobuddy-mobile/src/components/AdminRateLimitConfig.js:139`
- `autobuddy-mobile/src/components/AdminRateLimitConfig.js:170`
- `autobuddy-mobile/src/components/DriverDocumentUpload.js:25`
- `autobuddy-mobile/src/components/DriverDocumentUpload.js:37`
- `autobuddy-mobile/src/components/PassengerDocumentUpload.js:28`
- `autobuddy-mobile/src/components/PassengerDocumentUpload.js:40`

Impact:

Admin document requirements, rate-limit configuration, audit logging, and document upload flows may look implemented in the UI but fail at runtime.

Recommended fix:

Convert all calls to the current `apiRequest('/path', { method, token, body, query })` format and add a small API helper unit test to prevent regressions.

### 3. Mobile screens reference endpoints that do not appear to exist

Evidence:

- `DocumentExpiryAlertsPanel.js` calls `/drivers/document-expiry-alerts`, `/drivers/documents/{id}/renew-request`, and `/drivers/document-expiry-alerts/{id}/dismiss`.
- `DriverTierBenefitsPanel.js` calls `/drivers/tier-benefits`.
- `DriverReferralPanel.js` calls `/drivers/referral-program`.
- `DriverSuspensionAppealPanel.js` calls `/drivers/suspension-status` and `/drivers/suspension-appeals`.
- `useDriverActions.js` calls `/drivers/sync-actions`.
- `AddStopModal.js` calls `/bookings/{bookingId}/add-stop`.
- `EditDestinationModal.js` calls `/bookings/{bookingId}/destination`.
- `RideNotesPanel.js` calls `/bookings/{bookingId}/notes`.
- `RideStatsPanel.js` calls `/passengers/ride-stats`.
- `ReceiptsPanel.js` calls `/passengers/receipts/{receiptId}/pdf`.

Problem:

The frontend contains advanced UX panels for driver benefits, referrals, suspension appeals, document expiry, ride modification, notes, stats, and PDF receipts, but matching backend routes were not found in the current route map.

Impact:

These are feature-completeness gaps. They will show up as broken buttons, empty panels, or silent failures in a live demo.

Recommended fix:

For each screen, either implement the matching backend endpoint, change the screen to the actual route, or temporarily hide the feature behind a disabled/coming-soon state.

### 4. Payment flow is not production complete

What exists:

- UPI intent generation.
- Stripe PaymentIntent creation when `STRIPE_SECRET_KEY` is configured.
- Payment verification endpoint.
- Booking payment status updates and driver wallet credit.

Missing:

- Stripe webhook verification.
- Refund/cancellation reversal flow.
- Payment reconciliation and settlement status.
- Failed/partial payment handling.
- Dispute/chargeback evidence trail.
- Idempotency guard for payment verification retries.

Impact:

The payment flow may work in a happy-path demo but is not yet strong enough for production money movement.

### 5. No verified full ride lifecycle end-to-end test

The backend has many good unit/integration tests, and the mobile app test suite passes, but I did not find a single automated test that proves the whole user journey:

Passenger signs in -> creates booking -> driver receives request -> accepts -> driver arrives -> OTP starts trip -> location updates stream -> trip completes -> fare finalizes -> payment verifies -> receipt generates -> wallet credits.

Impact:

This is the most important product-confidence test for investors and KSUM reviewers.

## P1 Functional Gaps

### Driver-facing advanced programs

The UI suggests driver tier benefits, referral program, document expiry alerts, suspension status, and suspension appeals. These need backend support or should be removed from the current build until ready.

### Passenger ride controls

The UI suggests add-stop, edit-destination, and ride notes. Backend support was not found. These are valuable features, but they need pricing, safety, driver consent, and audit rules before launch.

### Passenger analytics and downloadable receipts

The app calls passenger ride stats and PDF receipt endpoints. The backend has booking receipt support, but the exact passenger PDF receipt route appears mismatched.

### Admin audit route mismatch

`AdminAuditLogger.js` calls `/admin/audit-log`, while backend routes appear under paths such as `/api/admin/security/audit-logs` and `/api/admin/audit/logs`. This should be normalized.

### OTP/email/SMS delivery provider

There are TODOs for real email/OTP delivery:

- `backend/server.py:4907`
- `backend/user_profile_endpoints.py:95`
- `backend/user_profile_endpoints.py:143`

Demo OTP behavior is guarded outside production, which is good, but a real provider and operational retry/failure handling are still needed.

### Rate limiting enforcement is partly placeholder

Advanced rate limiting code has TODOs around user extraction and distributed limiter integration:

- `backend/app/middleware/advanced_rate_limiting.py:203`
- `backend/app/middleware/advanced_rate_limiting.py:205`
- `backend/app/middleware/advanced_rate_limiting.py:211`
- `backend/app/utils/advanced_rate_limiting.py:589`

Admin rate-limit configuration exists, but enforcement should be verified under authenticated, anonymous, and abusive traffic.

## P1 Technical Gaps

### Backend monolith risk

`backend/server.py` is still the main runtime file and is very large. Modular routers exist, but the project mixes monolithic and modular patterns. This makes review, startup safety, testing, and future refactors harder.

Recommended direction:

Keep `server.py` as the app assembler, move feature domains into routers/services, and enforce import tests for every router.

### API versioning is inconsistent

The backend exposes a mixture of route styles such as:

- `/api/v1/passengers/*`
- `/api/drivers/*`
- `/api/bookings/*`
- `/api/admin/*`
- `/api/driver/*`

This is manageable during development but risky for mobile app releases. Stabilize public mobile APIs under one versioned namespace before production.

### Database architecture should be clarified

The project appears to mix Mongo-style access with modular DB abstractions and some SQL-oriented feature code. Before production, define the canonical production datastore, migration strategy, seed strategy, backup plan, and local test DB approach.

### File upload/S3 path needs verification

Tests emitted warnings around S3 upload availability. Even if dependencies are present, document upload should be verified against the actual target storage configuration with size/type validation, signed URL behavior, and failure recovery.

### Real-time reliability edge cases

Live tracking exists, but production readiness needs tests for:

- Driver app reconnecting mid-trip.
- Passenger app reconnecting mid-trip.
- Multiple devices for the same user.
- Driver goes offline after accepting.
- Location permission revoked.
- Socket emit succeeds but DB write fails.

## P2 Product/Investor Gaps

### Investor and KSUM evidence still needs hard numbers

The pitch materials are polished, but the strongest missing inputs are real operating evidence:

- Pilot city and pilot duration.
- Number of onboarded drivers.
- Number of registered passengers.
- Completed rides.
- Repeat usage.
- GMV.
- Revenue.
- CAC.
- Driver earnings uplift.
- Cancellation rate.
- Average response time.
- Support ticket rate.
- NPS or customer testimonials.

Without these, the deck can tell a good story but will still feel early.

### Valuation report needs source evidence

The valuation report is useful as an internal estimate, but investor-grade valuation usually needs:

- Comparable company source links.
- Detailed financial projections.
- Sensitivity table.
- Cap table.
- Funding ask and dilution math.
- Use-of-funds schedule.
- Founder/team credentials.
- Company registration details.

For formal investor or statutory use, get a CA/registered valuer to certify it.

### KSUM submission package may need attachments

Likely missing or not yet centralized:

- Founder profile and ID/company registration details.
- Problem statement with Kerala/India local relevance.
- Product screenshots or demo video link.
- Pilot/customer validation evidence.
- Budget and milestone plan.
- IP/technology ownership statement.
- Team roles.
- Market and go-to-market evidence.

## Test And Verification Results

Commands run:

- Backend: `..\\.venv\\Scripts\\python.exe -m pytest`
- Mobile typecheck: `npm.cmd run typecheck`
- Mobile lint: `npm.cmd run lint`
- Mobile tests: `npm.cmd test -- --runInBand --cacheDirectory .\\.jest-cache`

Results:

- Backend: 31 passed, 5 failed. The failures are import failures caused by `ModuleNotFoundError: No module named 'app.database'`.
- Mobile typecheck: passed.
- Mobile lint: passed.
- Mobile Jest: 8 suites passed, 18 tests passed.
- Mobile Jest warnings: React `act(...)` warnings in passenger map tests should be cleaned up, but they did not fail the run.

## Recommended Fix Order

1. Fix the backend import failure in `driver_fare_proposals.py` and `admin_fare_proposals.py`.
2. Normalize all old `apiRequest(...)` calls in mobile code.
3. Build or hide the unmatched mobile feature endpoints listed above.
4. Add a full ride lifecycle E2E test.
5. Add payment webhooks, refund handling, reconciliation, and idempotency.
6. Stabilize API versioning and route contracts.
7. Verify OTP/SMS/email, file uploads, rate limiting, and real-time reconnect behavior.
8. Add real pilot metrics and source-backed valuation evidence for investor/KSUM submission.

## Bottom Line

The product is not empty or just a deck. A lot of serious backend and mobile surface area exists. The main risk is not missing ambition; it is contract drift and production hardening. Fixing the P0 items will make AutoBuddy much more credible for demos, investor review, and KSUM submission.
