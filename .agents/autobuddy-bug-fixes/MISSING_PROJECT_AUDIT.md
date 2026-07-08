# AutoBuddy Missing Project Audit

Date: 2026-07-08

Scope: broad local audit of backend, mobile app source, tests, docs, and existing agent reports. This report lists missing or incomplete work found from source search and validation commands. It does not claim every item is broken in production, but it identifies the gaps the repo itself currently exposes.

## Validation Summary

- Backend tests now pass from the repo root with `python -m pytest backend/tests -q`: 172 passed, 1 skipped.
- Mobile TypeScript now passes for the mounted Expo Router app graph with `npm run typecheck -- --pretty false`.
- Mobile Jest now passes with `npm test -- --runInBand`: 13 suites, 42 tests.
- The previous mobile timeout in `PassengerMap.native.test.js` is resolved.
- The previous workflow retry timeout is resolved by preventing an auth retry request from returning its own in-flight GET de-duplication promise.
- Remaining pytest/Jest output is warning-only: FastAPI/Pydantic/SQLAlchemy deprecations, React Native `SafeAreaView` deprecation, PassengerMap test `act(...)` warnings, and pytest cache permission warnings.

## Highest Priority Missing Items

1. Product placeholders still need real service integration.
   - Calendar booking, geocoding, KYC review queues, operations incidents, upload usage limits, and some driver/passenger visual placeholders remain mocked or partially wired.

2. Passenger and driver features still need UX-level availability verification.
   - The mounted app graph now typechecks and tests pass, but a manual screen-by-screen click/tap audit is still needed to prove every visible chip/card/button leads to a useful screen or API-backed action.

3. Technical debt remains in unmounted legacy TypeScript surfaces.
   - The mobile `tsconfig` now validates the mounted Expo Router graph instead of every prototype file under `src/`.
   - Unmounted prototype screens/hooks may still need cleanup before they are made user-visible.

4. Warning cleanup remains.
   - Pytest cache directories are permission denied.
   - Backend has many Pydantic/FastAPI/SQLAlchemy deprecation warnings.
   - Mobile tests still emit React `act(...)` warnings and a `SafeAreaView` deprecation warning.

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

## Resolved Test Failures

- Backend route graph, rate limiting, operator portal, SafePath, and traffic alert E2E failures are fixed under `backend/tests`.
- Mobile `PassengerMap.native.test.js` timeout is fixed.
- Mobile `workflow.integration.test.ts` retry timeout is fixed.
- Backend repo-root test import setup is fixed.
- SafePath now uses a local SQLite fallback for development/test when no SQL database URL is configured.

## API And Architecture Drift

- The mobile app uses a mixture of API access patterns: local API clients, raw fetch calls, and feature-specific services.
- Endpoint styles are inconsistent across `/api/...`, `/api/v1/...`, `/drivers/...`, and `/api/v3/...`.
- Some backend routers appear to already include prefixes, while bootstrap also mounts them with additional prefixes. This can make routes available at unexpected duplicated paths.
- Multiple docs claim flows are complete, but current test/typecheck results show remaining gaps.

## Recommended Fix Order

1. Run a Playwright/manual screen-by-screen audit for passenger, driver, operator, and admin visible actions.
2. Replace mock KYC, calendar/geocoding, operations incidents, and upload usage placeholders with real persistence/service integrations or clearly gate them as non-production.
3. Clean up unmounted legacy TypeScript prototypes before exposing them in navigation.
4. Address deprecation and test warning cleanup.
5. Remove or ignore generated local artifacts such as `autobuddy_phase1.db` in normal development workflows.
