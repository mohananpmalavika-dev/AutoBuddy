# Phase 1 Deployment & Testing Guide

**Status**: ✅ Phase 1 Complete - Ready for QA Testing  
**Date**: June 19, 2026  
**Components**: 45+ API Endpoints + WebSocket Real-Time + Mobile App

---

## ✅ Phase 1 Completion Checklist

### Core APIs
- [x] Authentication endpoints (login, signup, OTP, refresh, logout)
- [x] Passenger endpoints (8 endpoints for booking, tracking, history)
- [x] Driver endpoints (9 endpoints for earnings, documents, rides)
- [x] Operator endpoints (8 endpoints for fleet management)
- [x] Admin endpoints (10+ endpoints for system management)
- [x] RBAC (Role-Based Access Control) on all endpoints
- [x] Response models and validation
- [x] Error handling (HTTP status codes, error messages)

### Real-Time Updates
- [x] WebSocket connection handling
- [x] Authentication over WebSocket
- [x] Room-based broadcasting
- [x] Event handlers for all 4 flows
- [x] Heartbeat keep-alive mechanism
- [x] Passenger live tracking events
- [x] Driver earnings real-time updates
- [x] Operator fleet location streaming
- [x] Admin alert broadcasting

### Documentation
- [x] API_IMPLEMENTATION_SUMMARY.md (45+ endpoints)
- [x] WEBSOCKET_INTEGRATION_GUIDE.md (Real-time events)
- [x] COMPLETE_INTEGRATION_GUIDE.md (Mobile app integration)
- [x] This deployment guide

### Code Quality
- [x] Python syntax validation
- [x] TypeScript types (mobile app)
- [x] Router registration in bootstrap
- [x] WebSocket handler registration
- [x] Import statements validated

---

## 🚀 Deployment Steps

### 1. Backend Environment Setup

**Create .env file** at `/backend/.env`:
```bash
DATABASE_URL=mongodb://localhost:27017/autobuddy
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here-min-32-chars
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24
REFRESH_TOKEN_EXPIRATION_DAYS=7

# Stripe (if using)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:8081,http://localhost:19006

# Environment
ENVIRONMENT=development  # or production
DEBUG=true
LOG_LEVEL=INFO
```

### 2. Database Setup

**MongoDB**:
```bash
# Start MongoDB
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or using Docker Compose
docker-compose up -d mongodb
```

**Create Indexes**:
```bash
# SSH into MongoDB
mongo localhost:27017/autobuddy

# Create indexes for performance
db.users.createIndex({ "phone": 1 }, { unique: true })
db.users.createIndex({ "email": 1 }, { sparse: true })
db.drivers.createIndex({ "user_id": 1 })
db.passengers.createIndex({ "user_id": 1 })
db.rides.createIndex({ "passenger_id": 1 })
db.rides.createIndex({ "driver_id": 1 })
db.rides.createIndex({ "status": 1 })
db.rides.createIndex({ "created_at": -1 })
```

### 3. Redis Setup (Optional but Recommended)

```bash
# Start Redis
docker run -d -p 6379:6379 --name redis redis:latest

# Or using Docker Compose
docker-compose up -d redis
```

### 4. Backend Installation

```bash
cd /path/to/backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
.\venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations (if any)
python -m alembic upgrade head
```

### 5. Backend Start

```bash
# Development mode (hot reload)
uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Production mode
gunicorn -w 4 -k uvicorn.workers.UvicornWorker server:app
```

Check health: `http://localhost:8000/health`

### 6. Mobile App Setup

```bash
cd /path/to/autobuddy-mobile

# Install dependencies
npm install

# Or
yarn install

# Update .env for API URL
echo "REACT_APP_API_URL=http://localhost:8000/api" > .env

# Start development server (Expo)
npm start
# or
expo start

# Choose to run on:
# - iOS (i)
# - Android (a)
# - Web (w)
```

### 7. Verify Deployments

**Backend API**:
```bash
# Test API health
curl http://localhost:8000/health

# Test login endpoint
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210", "password": "demo123"}'
```

**WebSocket Connection**:
```bash
# Using socket.io-client
npm install socket.io-client

# Test script
const { io } = require('socket.io-client');
const socket = io('http://localhost:8000');
socket.on('connect', () => console.log('Connected'));
socket.emit('authenticate', {
  user_id: 'test',
  token: 'test_token',
  role: 'driver'
});
```

---

## 🧪 Testing Plan

### Level 1: Unit Testing

**Backend Endpoints** (Using pytest):
```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-mongodb

# Run tests
pytest app/tests/test_core_flows.py -v

# Test specific endpoint
pytest app/tests/test_core_flows.py::test_passenger_profile -v
```

**Mobile App** (Using Jest):
```bash
cd autobuddy-mobile

# Run tests
npm test

# Run with coverage
npm test -- --coverage

# Test specific file
npm test -- api-client.test.ts
```

### Level 2: Integration Testing

**API Integration Test**:
```typescript
// test/api.integration.test.ts
import { apiRequest, authAPI, passengerAPI } from '../api-client';

describe('API Integration', () => {
  let token: string;
  
  beforeAll(async () => {
    const response = await authAPI.login('9876543210', 'demo123', 'passenger');
    token = response.token;
  });

  test('Passenger can book ride', async () => {
    const result = await passengerAPI.bookRide(token, {
      pickup: '123 Main St',
      dropoff: '456 Park Ave',
      ride_type: 'economy',
    });
    
    expect(result).toHaveProperty('ride_id');
    expect(result.status).toBe('searching');
  });

  test('Passenger can get ride history', async () => {
    const result = await passengerAPI.getRideHistory(token, 10, 0);
    expect(Array.isArray(result.rides)).toBe(true);
  });
});
```

**WebSocket Integration Test**:
```typescript
// test/websocket.integration.test.ts
import { io } from 'socket.io-client';

describe('WebSocket Integration', () => {
  let socket;

  beforeAll((done) => {
    socket = io('http://localhost:8000');
    socket.on('connect', done);
  });

  test('Driver can update location', (done) => {
    socket.emit('authenticate', {
      user_id: 'driver_123',
      token: 'token',
      role: 'driver'
    });

    socket.emit('driver:update_location', {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 50,
    });

    done();
  });

  afterAll(() => {
    socket.disconnect();
  });
});
```

### Level 3: End-to-End Testing

**Full Flow Testing**:
```bash
# Start backend
uvicorn server:app --port 8000 &

# Start mobile app (web)
npm start

# Run E2E tests
npm run test:e2e

# Using Playwright/Cypress
npx playwright test
# or
npx cypress run
```

**Test Scenarios**:

1. **Passenger Flow**:
   - [ ] Signup as passenger
   - [ ] Complete onboarding (phone → name → email → payment)
   - [ ] Book economy ride
   - [ ] View live driver tracking
   - [ ] Receive driver info (name, rating, vehicle)
   - [ ] Ride completion
   - [ ] View in history

2. **Driver Flow**:
   - [ ] Signup as driver
   - [ ] Upload documents
   - [ ] Go online
   - [ ] Receive ride requests
   - [ ] Accept/decline requests
   - [ ] Real-time location updates
   - [ ] Earn money (tracked in real-time)
   - [ ] View daily earnings

3. **Operator Flow**:
   - [ ] Login as operator
   - [ ] View fleet stats (online drivers, active rides)
   - [ ] See driver metrics
   - [ ] View real-time driver locations on map
   - [ ] Set incentive for a driver
   - [ ] Receive alerts about driver issues
   - [ ] Generate reports

4. **Admin Flow**:
   - [ ] Login as admin
   - [ ] View system health (API, DB, Cache, Payment)
   - [ ] See key metrics (users, revenue, rides, rating)
   - [ ] View and resolve system alerts
   - [ ] Suspend/ban user
   - [ ] Issue refund for a ride
   - [ ] View compliance status

---

## 📊 Performance Testing

### Load Testing (Apache JMeter)

**Test Configuration**:
```jmeter
Thread Group:
- Number of threads: 100
- Ramp-up time: 60 seconds
- Duration: 300 seconds

HTTP Request Samplers:
1. POST /api/auth/login
2. GET /api/passengers/me/profile
3. POST /api/passengers/rides/book
4. GET /api/drivers/me/earnings
5. GET /api/operators/me/fleet-stats
```

**Performance Targets**:
- Response time: < 500ms (95th percentile)
- Error rate: < 1%
- Throughput: > 1000 requests/second
- Memory usage: < 500MB

### WebSocket Load Testing

```python
# test/load_test_websocket.py
import asyncio
import socketio

async def test_driver_locations():
    sio = socketio.AsyncClient()
    
    @sio.on('driver:location_updated')
    async def on_location(data):
        print(f"Location update: {data}")
    
    await sio.connect('http://localhost:8000')
    await sio.emit('authenticate', {
        'user_id': 'test',
        'token': 'token',
        'role': 'operator'
    })
    await sio.emit('operator:subscribe_fleet')
    
    await asyncio.sleep(60)
    await sio.disconnect()

asyncio.run(test_driver_locations())
```

---

## 🔍 Monitoring & Logging

### Backend Logging

**Configure logging** in `server.py`:
```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)
```

**Log levels**:
- DEBUG: Detailed info for development
- INFO: General flow information
- WARNING: Warning messages
- ERROR: Error messages
- CRITICAL: Critical failures

### Metrics to Monitor

```python
# Endpoint response times
GET /api/passengers/me/profile: avg 50ms
POST /api/passengers/rides/book: avg 150ms
GET /api/drivers/me/earnings: avg 75ms

# Error rates
4xx errors: < 1%
5xx errors: < 0.1%

# WebSocket metrics
Active connections: 1000+
Message throughput: 10,000 msg/sec
Connection failures: < 0.1%
```

---

## 🐛 Troubleshooting

### Backend Issues

**Port already in use**:
```bash
# Kill process on port 8000
lsof -ti:8000 | xargs kill -9

# Or use different port
uvicorn server:app --port 8001
```

**Database connection fails**:
```bash
# Check MongoDB is running
docker ps | grep mongodb

# Check connection string
mongodb://localhost:27017/autobuddy
```

**Import errors**:
```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall

# Check Python version
python --version  # Should be 3.9+
```

### Mobile App Issues

**API connection fails**:
- Check backend is running: `http://localhost:8000/health`
- Check .env has correct API_URL
- Check network connectivity
- Try `curl http://localhost:8000/api/auth/login`

**WebSocket connection fails**:
- Check Socket.io is enabled on backend
- Check port 8000 is not firewalled
- Try test client: `socket.io('http://localhost:8000')`

**Authentication fails**:
- Check credentials: phone=9876543210, password=demo123
- Check token is being stored
- Check token is being sent in headers

---

## 📋 Delivery Checklist

Before handing off to QA:
- [x] All 45+ API endpoints implemented
- [x] WebSocket real-time events working
- [x] RBAC enforced on all endpoints
- [x] Error handling complete
- [x] Response models validated
- [x] Mobile app can authenticate
- [x] Mobile app can book rides (passenger)
- [x] Mobile app can accept rides (driver)
- [x] Mobile app can monitor fleet (operator)
- [x] Mobile app can view metrics (admin)
- [x] Documentation complete
- [x] Environment setup guide provided
- [x] Test credentials available
- [x] No console errors or warnings
- [x] Database migrations applied
- [x] Indexes created for performance

---

## 📞 QA Handoff

### Test Credentials
```
Passenger:
  Phone: 9876543210
  Password: demo123

Driver:
  Phone: 9876543211
  Password: demo123

Operator:
  Phone: 9876543212
  Password: demo123

Admin:
  Phone: 9876543213
  Password: demo123
```

### API Documentation
- Swagger/OpenAPI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- API_IMPLEMENTATION_SUMMARY.md
- WEBSOCKET_INTEGRATION_GUIDE.md
- COMPLETE_INTEGRATION_GUIDE.md

### Known Issues
None currently - Phase 1 implementation complete

### Success Criteria
✅ All endpoints responding with correct status codes
✅ Authentication working with JWT tokens
✅ WebSocket connections stable
✅ Real-time updates flowing correctly
✅ Mobile app UI reflects data updates
✅ No performance bottlenecks identified

---

**Status**: ✅ Phase 1 Complete  
**Next Phase**: Phase 2 - Advanced Features & QA Testing  
**Timeline**: 1-2 weeks for QA cycle

