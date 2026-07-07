# AutoBuddy Missing Project Audit

Date: 2026-07-08

Scope: broad local audit of backend, mobile app source, tests, docs, and existing agent reports. This report lists missing or incomplete work found from source search and validation commands. It does not claim every item is broken in production, but it identifies the gaps the repo itself currently exposes.

## Validation Summary

- Backend Python compile check passed for `backend/server.py`, `backend/app/main.py`, and `backend/app/bootstrap.py`.
- Backend tests do not pass from the repo root because `app` is not importable by `backend/tests/conftest.py`.
- Backend tests run from `backend/` but fail in workflow route mounting, SafePath database setup, operator portal, rate limiting, and traffic alert async fixture areas.
- Mobile Jest tests mostly pass, but 2 tests time out.
- Mobile TypeScript typecheck fails with missing imports, missing packages/types, invalid icon names, removed React Native APIs, wrong relative hook imports, and component/type mismatches.

## Highest Priority Missing Items

1. The backend route graph is not complete according to the repo's own workflow tests.
   - Tests expect critical user routes such as `/api/bookings`, `/api/bookings/active`, `/api/drivers/readiness`, `/api/drivers/availability`, `/api/drivers/location`, `/api/v1/passengers/preferences`, `/api/v1/passengers/support/tickets`, `/api/v1/passengers/scheduled-rides`, wallet top-up routes, upload routes, and airport surge routes.
   - Admin control routes are expected for capabilities, fares, drivers, passengers, disputes, refunds, commissions, documents, live rides, and blocked users.
   - This may be a true missing route issue, a router import/registration issue, or duplicated prefix issue in app bootstrap. The failing tests make it a must-fix surface.

2. Mobile TypeScript is not green.
   - Root `App.tsx` imports `./AppShell` and `./utils/setupIntegration`, but those files live under `src/`.
   - `src/App.tsx` and `src/AppShell.tsx` reference navigation packages and screens that are missing or not installed/exported.
   - Several feature modules import hooks from the wrong relative path, especially nested driver feature folders.
   - Multiple MaterialIcons names use underscore names that do not match Expo vector icon types.
   - Removed React Native APIs are still referenced, including `ProgressViewIOS`, `DatePickerAndroid`, and `TimePickerAndroid`.

3. Passenger and driver features still need full availability verification.
   - Recent work mounted many passenger and driver options, but the route graph and typecheck failures show not every backend or frontend surface is reliably reachable.
   - The next pass should map every visible menu chip/card/button to a real screen or API call and remove dead or placeholder actions.

4. Test setup is incomplete.
   - Running backend tests from the repo root fails because `PYTHONPATH` or test invocation is not configured for `backend/app`.
   - SafePath tests attempt to connect to local Postgres at `localhost:5432/autobuddy_phase1`; no isolated test database fallback is active.
   - Traffic alert E2E tests have async fixture/plugin configuration errors.
   - Pytest cache cannot be written because `.pytest_cache` directories are permission denied.

## Incomplete Or Mocked Backend Work

- `backend/app/services/calendar_booking_service.py`
  - Calendar event fetch and geocoding are mock implementations.
  - AI travel planning should be connected to real calendar provider data and a real geocoding/routing service before production use.

- `backend/app/routers/admin_kyc_enhanced.py`
  - Admin KYC endpoints return mock data.
  - Real KYC review queue, document state, audit history, and persistence are still missing or not wired here.

- `backend/app/sockets/operations_events.py`
  - Incident data is stored in an in-memory mock list.
  - Operations incidents should be persisted and replayable after restart.

- `backend/app/models/__init__.py`
  - AI visibility model classes such as `User`, `RideHistory`, and `Weather` are stubs.
  - These need real ORM/data model integration or the AI visibility router should depend on the existing real models.

- `backend/app/utils/file_validation_enhanced.py`
  - Upload usage limit checks include a placeholder where database-backed current usage should be queried.

- `backend/app/sockets/monitor.py`
  - Empty file. If this is intended to provide socket monitoring, it is missing.

- `backend/app/utils/helpers.py`
  - Empty file. If imports expect shared helpers here, implementation is missing.

## Incomplete Or Placeholder Mobile Work

- `autobuddy-mobile/src/components/DriverPerformanceDashboard.js`
  - Contains visible "Detailed charts coming soon" text.
  - The dashboard should either show real charts now or remove the unfinished promise from the UI.

- `autobuddy-mobile/src/components/LiveTrackingMap.tsx`
  - ETA calculation is marked as a placeholder rather than using routing/traffic data.

- `autobuddy-mobile/src/components/PassengerSimplifiedOnboarding.tsx`
  - OTP send/verify API calls are commented out.
  - The onboarding flow is not fully connected to backend auth.

- `autobuddy-mobile/src/components/DriverInfoCard.tsx`
- `autobuddy-mobile/src/components/DriverManagementCard.tsx`
  - Both use placeholder image URLs.
  - Should use real uploaded driver photos or stable local fallback assets.

## Mobile Test Failures

- `autobuddy-mobile/src/screens/PassengerMap.native.test.js`
  - Test "opens ride details picker from the Ride chip" times out.

- `autobuddy-mobile/src/lib/workflow.integration.test.ts`
  - Test "retries once after 401 by refreshing access token (workflow)" times out.

These timeouts should be treated as real workflow instability until proven otherwise.

## Backend Test Failures

- Workflow route graph tests fail for critical full-server routes, admin control center coverage, core ride flow routes, upload routes, and smoke requests.
- Rate limiting test fails for the specific `/api/bookings/active` rule ordering/selection.
- Operator portal tests fail for vehicle assignment, dashboard summary/bookings, admin operator status, and driver vehicle sync behavior.
- SafePath tests fail because the configured database is unavailable and API responses return server errors instead of expected success or validation responses.
- Traffic alert E2E tests fail from async fixture configuration issues.

## API And Architecture Drift

- The mobile app uses a mixture of API access patterns: local API clients, raw fetch calls, and feature-specific services.
- Endpoint styles are inconsistent across `/api/...`, `/api/v1/...`, `/drivers/...`, and `/api/v3/...`.
- Some backend routers appear to already include prefixes, while bootstrap also mounts them with additional prefixes. This can make routes available at unexpected duplicated paths.
- Multiple docs claim flows are complete, but current test/typecheck results show remaining gaps.

## Recommended Fix Order

1. Make backend test invocation reliable from the repo root.
2. Fix or normalize backend router mounting so the workflow route graph tests pass.
3. Fix mobile TypeScript import/package/API-surface errors.
4. Replace mock KYC, calendar/geocoding, operations incidents, and upload usage placeholders with real persistence/service integrations or clearly gate them as non-production.
5. Stabilize the two mobile timeout tests.
6. Do a screen-by-screen passenger and driver feature mount verification after typecheck and backend route graph are green.
7. Update docs only after the implementation and tests agree.
