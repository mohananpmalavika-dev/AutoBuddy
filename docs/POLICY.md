# AutoBuddy Project Policy Document

*Document purpose:* This document describes how AutoBuddy (the “Service”) is intended to collect, use, share, and protect user information, and the rules users must follow.

> **Important:** This is a policy draft based on the current repository features. Before launch, have legal counsel review for your jurisdiction(s) and hosting providers.

## 1) Who we are
AutoBuddy provides a ride-hailing/booking platform with roles for **Passengers**, **Drivers**, and **Admins**. The Service includes:
- Mobile/web client (Expo app)
- Backend API (FastAPI) and realtime communication (Socket.IO)

## 2) Definitions
- **Account data:** Email/phone, name, role, and authentication-related information.
- **Location data:** Latitude/longitude used to match drivers, estimate fares, and enable live ride tracking.
- **Ride data:** Booking and ride status (pending/accepted/in-progress/completed/cancelled), pickup/drop points, and ride distance.
- **Messages:** Passenger/driver in-app chat messages.
- **KYC data:** Driver identity and verification documents (e.g., Aadhaar/license/RC/selfie image URLs) submitted for verification.
- **Payment data:** Payment intent/order identifiers and transaction references. Actual payment handling may occur via third parties.

## 3) What information we collect
### 3.1 Account & authentication data
Depending on how you sign up, we may collect:
- **Email** (for login/verification; OAuth/OTP flows may create accounts)
- **Phone** (OTP flows)
- **Name**
- **Role** (passenger/driver)
- **Authentication credentials** are stored in a **hashed** form for password-based login.

### 3.2 Location data
The Service uses location to:
- Find nearby available drivers
- Calculate distances and ETA for routing/estimation
- Provide **driver live location** updates during active rides

Location may include:
- Passenger-provided coordinates (pickup location and optional nearby search coordinates)
- Driver coordinates updated while available and/or during active rides

### 3.3 Ride & communications data
We may collect and display:
- Booking lifecycle events and status updates
- In-app chat messages between passenger and driver
- A ride communication “call room” link (e.g., Jitsi room URL) used by participating users

### 3.4 Payment-related information
We may collect and store:
- Payment order identifiers and statuses
- UPI intent details (e.g., UPI intent URL)
- Stripe identifiers (if Stripe is enabled)
- Wallet top-up balances (if you use wallet features)

### 3.5 Driver KYC & compliance data
If you are a **Driver**, you may be required to submit identity and vehicle information, including:
- Aadhaar number
- License number
- RC number
- URLs to images (Aadhaar/license/RC/selfie)
- KYC status and admin review decisions

### 3.6 Emergency/SOS and contacts
Users may submit:
- Emergency contacts (name/phone/relation)
- SOS alerts containing coordinates and message/severity
- Notifications sent to admins/other users as appropriate

### 3.7 Notifications and realtime tokens
We may process:
- Push tokens (for sending notifications)
- Realtime communication session data

### 3.8 AI features (optional)
The Service may provide AI-assisted text:
- Trip tips
- Support chat responses
- Driver advice

When enabled by server configuration, the Service may send prompts/context to an AI provider.

## 4) How we use information
We use user data to:
- Operate bookings and matching
- Maintain driver availability and realtime tracking during active rides
- Calculate pricing estimates and trip costs
- Enable chat/call-room communications
- Process payments, wallet top-ups, and subscriptions
- Verify driver identity for account safety (KYC)
- Support account management (password change, phone updates)
- Send notifications (in-app and optionally push)
- Provide AI-generated assistance (when configured)

## 5) Legal basis / purposes (high-level)
Where applicable, data processing is performed for:
- Contractual necessity (providing ride booking, communication, payments)
- Legitimate interests (security, preventing abuse, operational monitoring)
- Compliance (KYC and safety-related measures)
- Consent (e.g., opt-in notifications), where required by law

> Exact legal bases depend on your region and configuration.

## 6) Sharing of information
We may share limited information with:

### 6.1 Third-party service providers
- **Database hosting** (e.g., MongoDB / MongoDB Atlas)
- **Payment processors** (e.g., Stripe for card/online flows)
- **Mapping/routing APIs** (e.g., Google Maps Places, geocoding)
- **Push notification providers** (e.g., FCM)
- **Communication services** (e.g., Socket.IO; call room provider such as Jitsi)
- **AI provider** (if AI features are enabled)

### 6.2 Other users (within the Service)
During a ride, certain information must be shared to complete the service, including:
- Passenger/driver identities that are relevant to the booking
- Pickup/drop locations and driver live location during active ride
- Chat messages between the passenger and assigned driver
- SOS alert details shared with admins and trusted contacts (as configured)

### 6.3 Admin access and internal operations
Admins may access operational/admin endpoints for:
- KYC review
- Subscription configuration and verification
- Pricing rules and service monitoring

## 7) Data security
We implement reasonable technical and organizational measures designed to protect user data, including:
- Passwords are stored as **bcrypt hashes**
- JWTs are used for authenticated API access
- HTTPS/TLS is assumed for transport security in production

> Note: This policy describes intended measures. Review and harden infrastructure (firewalls, access controls, secrets management, logging policies) before launch.

## 8) Retention
We retain data as long as reasonably needed for:
- Account functionality and transaction history
- Safety, fraud prevention, and dispute resolution
- Operational monitoring and compliance

Where possible, the Service may use automatic expiry/indexing for certain data types (e.g., time-limited alerts/records). Exact retention periods depend on your configuration and infrastructure.

## 9) User rights and controls
Depending on your jurisdiction, you may be able to request:
- Access to your personal data
- Correction of inaccurate data
- Deletion of your account (subject to legal/compliance exceptions)
- Withdrawal of consent (where consent is the legal basis)

Practical controls available in the app include:
- Password change
- Phone change request flow (with verification/admin review)

## 10) Acceptable use and prohibited conduct
You agree not to:
- Use the Service for unlawful, fraudulent, or abusive activity
- Impersonate another person or falsify KYC/identity documents
- Attempt to bypass OTPs, authentication, or authorization
- Harass other users through chat/messages
- Share sensitive secrets (e.g., OTPs, tokens) with unauthorized parties

We may suspend or terminate accounts that violate these rules.

## 11) Safety and emergency disclosures
- The Service provides SOS and emergency contact features, but it cannot guarantee that emergency services respond.
- Always use local emergency numbers when you are in immediate danger.

## 12) Communication links (call rooms)
If the app uses a call room link for ride communication:
- The link enables communication among participating users.
- You should not share call-room links publicly.

## 13) Payments and refunds
Payments are handled via third-party payment providers when enabled.
- The app may generate payment intents/orders and store payment status/refs.
- Refunds, cancellations, and disputes should be handled in accordance with your provider agreements and operational policies.

## 14) AI limitations
AI-generated responses (tips/support/driver advice) are:
- Provided for convenience
- Not guaranteed to be accurate, complete, or suitable for all situations
- Should not be treated as professional advice

## 15) Changes to this policy
We may update this document from time to time. The latest version should be posted in the repository/site.

## 16) Contact
For questions, privacy requests, or policy updates, contact:
- **Privacy/Support email:** (add your email)
- **Address / entity:** (add your legal entity details)


