# System Architecture Diagram

## 1. Overview
This document describes the high-level architecture of AutoBuddy, including frontend, backend, data, and realtime components.

## 2. Architecture Components
- **Mobile/Web Client:** Expo-powered app for passengers and drivers.
- **API Backend:** FastAPI server handling authentication, ride management, payments, and business logic.
- **Realtime Service:** Socket.IO for live driver location updates, ride status, and chat.
- **Database:** PostgreSQL for persistent user, ride, payment, and audit data.
- **Storage/Assets:** Optional object storage for document uploads and media.

## 3. Data Flow
1. Passenger requests ride via mobile app.
2. Backend authenticates request and stores booking details.
3. Driver receives dispatch notification through realtime channel.
4. Driver updates location/status via Socket.IO.
5. Passenger receives live ride tracking and status updates.
6. Completed rides close out with payment records.

## 4. Deployment Topology
- Single backend service container with standard web and realtime endpoints.
- PostgreSQL hosted separately for persistence.
- Clients connect to backend over HTTPS and websocket transport.
- Admin console interfaces with API and analytics endpoints.

## 5. Security Boundaries
- Authenticated API access only.
- Role-based protection for admin endpoints.
- Encrypted transport for all client/server communication.

## 6. Diagram Notes
> Use this document as the authoritative architecture reference. For implementation diagrams, generate a visual drawing from the nodes above using your preferred design tool.
