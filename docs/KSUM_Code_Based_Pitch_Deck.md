# AutoBuddy - KSUM Pitch Deck

Code-based draft for presentation. This deck is built from the product codebase, not from existing project documents.

---

## 1. AutoBuddy

**Kerala-first mobility platform for trusted rides, driver earnings, and local transport operations.**

- One product across passenger, driver, admin, operator, fleet, corporate, and airport workflows.
- Built as an Expo app with web and native surfaces.
- Backend already exposes production-style APIs for booking, dispatch, payments, safety, KYC, wallets, analytics, and realtime updates.

**Speaker note:**  
AutoBuddy is not just a ride-booking UI. The codebase already contains the operating layer needed to run a regional mobility marketplace.

**Code signals:**  
`autobuddy-mobile/src/app/index.tsx`, `DriverDashboard.web.js`, `PassengerMap.web.js`, `AdminDashboard.js`, `OperatorDashboard.js`, `backend/server.py`

---

## 2. Problem

**Local mobility is fragmented and operationally hard to trust.**

- Passengers need dependable booking, live tracking, payments, support, safety, and ride history.
- Drivers need predictable earning tools, fair dispatch, KYC, payout visibility, vehicle management, and support.
- Operators and admins need live status, pricing control, KYC approval, payment verification, dispute handling, and system monitoring.
- Kerala-specific adoption needs language, safety, and local compliance workflows, not a generic clone.

**Speaker note:**  
The pain is not only "book a cab." The hard part is running the whole trusted mobility network.

---

## 3. Our Insight

**A regional mobility platform wins when it combines booking + trust + operations.**

- Booking alone is easy to copy.
- Trust workflows are harder: KYC, documents, safety events, driver/passenger blocking, ratings, audit trails.
- Operations workflows are harder still: driver readiness, dispatch scoring, admin pricing, live user status, wallets, subscriptions, and support.
- AutoBuddy is already structured around this full stack.

**Code signals:**  
Driver readiness and availability routes, KYC routes, blocked/favorite driver flows, admin audit and live user status, support tickets, wallet top-ups.

---

## 4. Product

**A multi-sided mobility operating system.**

- Passenger app: booking, maps, fare estimate, payments, wallet, saved/favorite drivers, support, scheduled rides, notifications.
- Driver command center: online/offline, live GPS, ride requests, earnings, fare tools, safety card, documents, vehicle management, reviews, shifts, payouts.
- Admin cockpit: users, live status, pricing, KYC, subscriptions, wallet approvals, launch visits, ongoing trips, audit actions.
- Operator/fleet layer: dispatch, fleet operations, corporate portal, profitability, airport rides, heatmaps.

**Speaker note:**  
This matters for KSUM because the product can serve city/region operations, not just individual rides.

---

## 5. Passenger Experience

**End-to-end ride flow from request to post-ride support.**

- Booking APIs support active bookings, booking history, receipts, chat, call room, cancellation, fare estimate, and route estimate.
- Passenger features include profile, KYC, documents, wallet, subscriptions, favorite/blocked drivers, support attachments, lost items, ratings, notifications.
- Frontend has separate web/native passenger map implementations.

**Code signals:**  
`PassengerMap.web.js`, `PassengerMap.native.js`, `/bookings`, `/fare/estimate`, `/route/estimate`, `/wallet`, `/payments`, `/passengers/support/*`

---

## 6. Driver Experience

**Driver Command Center built for daily work.**

- Driver availability, live location, GPS tracking, pending ride requests, active ride, upcoming rides.
- Earnings, withdrawals, payout schedule, payment methods, fare calculator, fare reset request.
- Safety, SOS, Kerala safety card, trust/KYC, documents, document expiry, vehicle management.
- Demand map, traffic alerts, ride filters, favorites, shifts, reviews, tier benefits, referrals, tax reports.

**Code signals:**  
`DriverDashboard.web.js`, `DriverDashboard.native.js`, `DriverTabBar.js`, `useGPSTracking.js`, `useDriverRealtimeTracking.js`, `/drivers/availability`, `/drivers/location`, `/drivers/earnings`, `/drivers/withdraw`

---

## 7. Trust And Safety

**Trust is designed as product infrastructure, not an afterthought.**

- Driver and passenger KYC flows.
- Driver documents, vehicle activation, bank details, emergency contacts.
- SOS event route, emergency contacts, Kerala safety card, family tracking/audio recording indexes.
- Favorite/blocking systems for both passenger and driver sides.
- Admin review queues for KYC, account deletions, wallet top-ups, subscription payments, and driver fare changes.

**Speaker note:**  
For a Kerala rollout, safety and accountability can become the differentiator.

**Code signals:**  
`KeralaSafetyCard.js`, `DriverTrustCard.js`, `DriverKycPanel.js`, `/sos`, `/drivers/kyc`, `/admin/kyc/*`, `/passengers/blocked-drivers`, `/drivers/blocked-passengers`

---

## 8. Dispatch Intelligence

**Matching drivers using operational signals.**

- Dispatch service scores available drivers.
- Scoring includes distance, rating, acceptance rate, vehicle type match, recent activity, and active ride load.
- Socket.IO notifications push ride offers and assignments.
- Candidate-driver APIs support admin/operations visibility.

**Speaker note:**  
This is the basis for smarter dispatch: not just nearest driver, but best operational fit.

**Code signals:**  
`backend/app/routers/dispatch_service.py`, `backend/app/services/ai_dispatch.py`, Socket.IO setup in `backend/server.py`

---

## 9. Admin And Operations

**Controls needed to actually run the marketplace.**

- Admin dashboard includes analytics, users/live status, launch visitors, subscriptions, pricing/fare, wallet top-ups, KYC.
- Backend includes admin routers for drivers, passengers, reports, safety, support, subscriptions, trips, wallet, fare proposals, system config.
- Operator and operations center modules exist for city/fleet-level workflows.

**Code signals:**  
`AdminDashboard.js`, `OperatorDashboard.js`, `OperationsCenter.js`, `FleetProfitability.js`, `/admin/dashboard`, `/admin/users/live-status`, `/admin/pricing`, `/admin/wallet/topups/*`

---

## 10. Architecture

**Modern deployment-ready stack.**

- Expo + React Native Web frontend.
- Vercel web deployment with `/api` routed to Render backend.
- FastAPI-style backend with MongoDB, optional Redis for sockets/cache, Socket.IO realtime, JWT auth, Google Maps, Stripe hooks, metrics, Sentry support.
- Health, readiness, metrics, rate limiting, audit, and production config are present in code.

**Code signals:**  
`autobuddy-mobile/vercel.json`, `render.yaml`, `backend/server.py`, `backend/app/utils/*`, `backend/app/middleware/*`

---

## 11. Business Model

**Revenue streams already reflected in product modules.**

- Ride commission or platform fee on completed trips.
- Subscription plans for passengers, drivers, and operators.
- Wallet top-ups and digital payment flows.
- Driver earning reports and withdrawals.
- Corporate/fleet/airport operations as higher-value B2B modules.
- Promotional/gamification layer through spin-win and launch visit tracking.

**Speaker note:**  
The code already contains monetization hooks; the next step is pricing validation and pilot economics.

**Code signals:**  
`/subscriptions/*`, `/payments/*`, `/wallet/*`, `/drivers/withdraw`, `/admin/subscriptions/*`, `/spin-win/*`, `CorporatePortal.js`

---

## 12. Why Kerala / Why KSUM

**AutoBuddy is positioned for a Kerala-first pilot.**

- Kerala mobility has dense city/town corridors, local driver networks, tourism, airport movement, and strong need for trusted digital operations.
- Product includes Kerala-specific safety UX and Malayalam/local-language hooks.
- KSUM support can help with pilot partnerships, government/startup ecosystem access, mentorship, and local validation.

**Speaker note:**  
The ask is not just funding; it is pilot access, credibility, mentorship, and ecosystem support.

---

## 13. Competitive Edge

**Differentiation is in the operating layer.**

- Multi-role platform instead of only passenger booking.
- Driver-first earnings, payout, fare, documents, safety, and support tooling.
- Admin controls for real marketplace governance.
- Realtime dispatch and live status infrastructure.
- Regional trust workflows: KYC, safety, blocking/favorites, support, audit.
- Extensible verticals: fleet, corporate, airport, heatmaps, operations center.

---

## 14. Current Status

**Implemented proof visible in code.**

- Expo app with web/native routing and role-based dashboards.
- Production-style frontend and backend deployment configuration.
- APIs for auth, bookings, driver operations, payments, wallet, subscriptions, support, KYC, admin, analytics, notifications, dispatch.
- Realtime Socket.IO server setup and web dashboard integration.
- Tests exist for workflow core and frontend behavior.

**Be honest in presentation:**  
Use this as “product built / pilot-ready engineering base,” not as traction unless live pilot numbers are available.

---

## 15. Roadmap

**Next 6-12 months.**

- Stabilize live production deployment and observability.
- Run first Kerala pilot with a small driver fleet and controlled passenger cohort.
- Measure booking conversion, driver online hours, response time, cancellation rate, payment success, safety/support incidents.
- Harden dispatch scoring with real operational data.
- Add verified local partnerships: fleets, auto/taxi unions, campus/airport/corporate mobility.
- Prepare compliance, support operations, and city expansion playbook.

---

## 16. KSUM Ask

**What we need from KSUM.**

- Pilot facilitation with a Kerala city/campus/airport/corporate mobility use case.
- Mentorship for go-to-market, compliance, operations, and fundraising readiness.
- Support for cloud credits, testing, and product validation.
- Introductions to fleet partners, tourism/airport stakeholders, and local transport operators.
- Grant or seed support to convert the product into a measurable pilot.

**Suggested closing line:**  
AutoBuddy is building Kerala’s trusted mobility operating layer, starting with rides and expanding into fleet, airport, corporate, and safety-first transport operations.

---

## 17. Demo Flow

**Show this in the meeting.**

- Login/register and role selection.
- Passenger booking and fare estimate flow.
- Driver online status, live GPS, ride flow, earnings, safety, documents.
- Admin dashboard: live users, KYC, pricing, wallet/subscription controls.
- Explain realtime dispatch and backend operations from code.

**Backup if live demo fails:**  
Use screenshots from the app and walk through source-backed modules.

---

## 18. Appendix: Source Evidence

- Frontend roles: `autobuddy-mobile/src/app/index.tsx`
- Passenger dashboards: `PassengerMap.web.js`, `PassengerMap.native.js`
- Driver dashboards: `DriverDashboard.web.js`, `DriverDashboard.native.js`, `DriverTabBar.js`
- Admin dashboard: `AdminDashboard.js`
- Operator/fleet/corporate: `OperatorDashboard.js`, `FleetProfitability.js`, `CorporatePortal.js`, `OperationsCenter.js`
- API backend: `backend/server.py`
- Dispatch: `backend/app/routers/dispatch_service.py`, `backend/app/services/ai_dispatch.py`
- Deployment: `autobuddy-mobile/vercel.json`, `render.yaml`
