# AutoBuddy — KSUM Pitch Report (Driver App)

## 1. Project Title
**AutoBuddy: Smart Driver Companion for Safe, Efficient Rides**

## 2. Team / Contributors
*(Fill in your team members and roles)*
- Team Members:
  1. [Name] — [Role]
  2. [Name] — [Role]
  3. [Name] — [Role]

## 3. Problem Statement
Ride-hailing and delivery drivers face operational and safety challenges such as:
- **Low efficiency** in managing ride requests and ride status transitions.
- **Safety risks** during emergencies or uncertain ride situations.
- **Reliability issues** under real-world network conditions (rate limits, temporary backend unavailability).
- **Operational friction** around earnings/expenses, fare configuration, withdrawals, and compliance (documents/KYC).

## 4. Proposed Solution
AutoBuddy is a **driver-first operational dashboard** that supports the complete ride lifecycle with reliability and safety as core design goals.

The solution enables drivers to:
- Manage **live ride requests** (accept/reject + request queue handling).
- Control **online/offline availability** using a server-confirmed flow (prevents mismatch).
- Perform **live location tracking** and navigation for pickups and drop-offs.
- Use **safety tools**, including SOS integration, during trips.
- Handle **ride workflow progression** using OTP inputs when required.
- Track **expenses**, view **earnings**, request **reports**, and submit **withdrawals**.
- Manage **fare configuration tools** with approval workflow.
- Access **support, KYC/trust, and document-related panels**.

## 5. Key Features (Implemented)

### A) Driver Availability + Reliability Engineering
- Server-confirmed toggle for online/paused state.
- “Ready to Drive” gate before going online.
- Retries and cooldown messaging for rate limits and backend outages.
- UI consistency safeguards (avoid stale snapshots overriding in-flight actions).

### B) Real-Time Ride Operations
- Socket-driven refresh for ride queue and status.
- Pending requests UI with:
  - **Countdown display** for the first pending request.
  - Accept / Decline actions.
- Upcoming & scheduled ride handling (resume, navigation, call room, cancel).

### C) Safety Module
- **SOS trigger and cancel** integrated with the active ride context.
- Ride-context aware UI for safety and emergency workflows.

### D) Live Tracking + Navigation
- GPS tracking during eligible states (online/ride-active).
- Location update throttling and movement thresholds.
- Map view with routing and fallback strategies (embed/directions + fallback map behavior).

### E) Ride Workflow Management
- Ride status progression logic with OTP requirements:
  - Passenger OTP required when needed to start trip.
  - Optional completion OTP for trip completion.
- Sticky active ride bar for quick actions:
  - Open Ride, Message, Call, Map, Next action, Cancel.

### F) Earnings, Expenses, and Financial Tools
- Expense tracking during trips.
- Earnings dashboard and driver performance surfaces.
- Earnings report generation request.
- Withdrawal request flow for admin processing.

### G) Fare Tools (Admin Approval Workflow)
- Driver fare calculator tooling:
  - base fare, per-km rate, surge multiplier, night multiplier
  - minimum fare
  - search radii and pickup surcharge per km
  - peak hours
- Submit “for approval” request.
- Reset-to-admin-default request.

### H) Support, Compliance & Trust
- Support ticket panel and message templates.
- KYC/trust panels and document upload surface.
- Document expiry alert and appeal/referral-type panels (tiered feature set).

## 6. Target Users
- **Primary:** Taxi/auto drivers using AutoBuddy to receive and manage rides.
- **Secondary (operational/admin support):** Individuals validating fare approvals, withdrawal requests, and compliance workflows.

## 7. Unique Value Proposition
AutoBuddy differentiates by integrating:
1. **Operational completeness** (request → trip → completion → financial tools).
2. **Safety-first** design via SOS integration and ride-context UI.
3. **Reliability-first** behavior through server-confirmed availability and retry/cooldown logic.
4. **Driver experience focus**: countdowns, sticky ride controls, and fast navigation/actions.

## 8. Market Potential
As mobility services expand, drivers require tools that reduce time waste, improve safety response, and provide transparency for earnings and compliance.

AutoBuddy targets these gaps by delivering a comprehensive operational dashboard optimized for real-world connectivity constraints.

## 9. Technology Approach (Summary)
- Frontend: React Native (web-compatible screen implementation)
- Real-time updates: socket-based ride queue refresh
- Backend integration: REST API calls for driver state, rides, earnings, fare tools, settings
- Location strategy: GPS tracking + throttled backend updates using movement thresholds
- Maps: Google maps embed/directions strategy with fallbacks

## 10. Implementation Readiness (Evidence)
This pitch is supported by existing UI & logic in:
- `autobuddy-mobile/src/screens/DriverDashboard.web.js`

That file includes implemented flows for:
- online/offline availability control
- socket-driven ride queue refresh
- live tracking + navigation map embedding
- SOS safety UI integration
- OTP-based ride status progression
- expense tracking and earnings report/withdrawal requests
- fare tools with approval submission
- support/KYC/doc and related panels

## 11. Demo Flow (How to Present in KSUM)
1. Open **Driver Dashboard**.
2. Show **Availability**:
   - Tap Online/Paused and demonstrate server-confirmed behavior.
3. Show **Pending Requests**:
   - Observe countdown → Accept → ride appears as active.
4. Show **Active Ride Workflow**:
   - Demonstrate OTP entry requirement and “Next action” progression.
5. Show **Safety**:
   - Trigger SOS during an active ride (demonstrate cancel flow).
6. Show **Tracking + Map**:
   - Display live driver location and route view.
7. Show **Expenses + Earnings**:
   - Add expense entries and request earnings report.
8. Show **Fare Tools**:
   - Update fare parameters → submit for approval.
9. Show **Support/KYC/Docs**:
   - Open support panel and document/trust-related panels.

## 12. Expected Impact
- Increased driver productivity via real-time queue handling and streamlined ride operations.
- Improved safety outcomes through integrated SOS and ride context.
- Reduced operational confusion due to reliability-focused availability synchronization.
- Improved financial transparency through earnings/expense tools and reporting.
- Better compliance management through KYC/doc workflows and alerts.

