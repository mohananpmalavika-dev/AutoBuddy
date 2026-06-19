# Real-Time WebSocket Integration Guide

**Status**: Ready for Mobile App Integration  
**Date**: June 19, 2026  
**Features**: Live Tracking, Real-Time Earnings, Alerts, Driver Locations

---

## 🔌 WebSocket Connection

### Client Setup (React Native)
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8000', {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});
```

### Authentication
After connecting, authenticate with user credentials:
```typescript
socket.emit('authenticate', {
  user_id: session.user.id,
  token: session.token,
  role: session.user.role,
});

socket.on('auth_response', (data) => {
  if (data.status === 'authenticated') {
    console.log('Connected as', data.role);
  }
});
```

---

## 👥 Passenger Events

### 1. Subscribe to Ride Updates
```typescript
// Listen for new ride acceptance
socket.on('passenger:ride_accepted', (driver) => {
  // Update UI with driver info
  // - name, rating, vehicle
  // - ETA
  // - Can call/message
});

// Listen for real-time location updates
socket.on('driver:location_updated', (location) => {
  // location: {
  //   driver_id, latitude, longitude,
  //   accuracy, heading, speed, timestamp
  // }
  updateMapMarker(location);
});

// Listen for ride completion
socket.on('passenger:ride_completed', (data) => {
  // data: {
  //   ride_id, final_fare, rating, timestamp
  // }
  showRideCompletionModal(data);
});

// Subscribe to ride
socket.emit('passenger:subscribe_ride', {
  ride_id: rideId,
});
```

### 2. Unsubscribe from Ride
```typescript
socket.emit('passenger:unsubscribe_ride', {
  ride_id: rideId,
});
```

---

## 🚗 Driver Events

### 1. Update Location (Every 5 seconds)
```typescript
// Get location from device GPS
const location = await getCurrentLocation();

socket.emit('driver:update_location', {
  ride_id: currentRideId,  // Optional, only if on active ride
  latitude: location.coords.latitude,
  longitude: location.coords.longitude,
  accuracy: location.coords.accuracy,
  heading: location.coords.heading,
  speed: location.coords.speed,
});
```

### 2. Toggle Online Status
```typescript
socket.emit('driver:online_status_changed', {
  online: true, // or false
});

socket.on('driver:status_changed', (data) => {
  // Confirm status change in UI
  setDriverOnline(data.online);
});
```

### 3. Subscribe to Ride Requests
```typescript
socket.emit('driver:subscribe_ride_requests');

socket.on('driver:new_ride_request', (rideRequest) => {
  // rideRequest: {
  //   ride_id, pickup, dropoff,
  //   estimated_fare, passenger_rating,
  //   ride_type, expires_at, timestamp
  // }
  
  // Show 12-second countdown
  showRideRequestModal(rideRequest);
  
  // Auto-decline after 12 seconds if no response
  setTimeout(() => {
    if (!rideAccepted) {
      socket.emit('driver:decline_ride', {
        ride_id: rideRequest.ride_id,
        reason: 'timeout'
      });
    }
  }, 12000);
});
```

### 4. Real-Time Earnings Update
```typescript
socket.on('driver:earning_updated', (earning) => {
  // earning: {
  //   amount, ride_id, timestamp
  // }
  
  // Update earnings display
  addToTodayEarnings(earning.amount);
  updateEarningsWidget();
});
```

### 5. Incentive Notifications
```typescript
socket.on('driver:incentive_updated', (incentive) => {
  // incentive: {
  //   amount, operator_id, timestamp
  // }
  
  // Show incentive notification
  showNotification(`Get ${incentive.amount} incentive!`);
});
```

---

## 🏢 Operator Events

### 1. Subscribe to Fleet Updates
```typescript
socket.emit('operator:subscribe_fleet');

socket.on('operator:fleet_subscription_confirmed', (data) => {
  console.log('Fleet subscription active');
});

// Receive driver location updates
socket.on('driver:location_updated', (location) => {
  // location: {
  //   driver_id, latitude, longitude,
  //   accuracy, heading, speed, timestamp
  // }
  
  // Update driver marker on fleet map
  updateDriverMarker(location);
});

// Receive driver status changes
socket.on('driver:status_changed', (status) => {
  // status: {
  //   driver_id, online, timestamp
  // }
  
  // Update driver status in list
  updateDriverStatus(status.driver_id, status.online);
});
```

### 2. Update Driver Incentive (Broadcast to Driver)
```typescript
socket.emit('operator:update_driver_incentive', {
  driver_id: driverId,
  amount: 500,  // INR
});
```

### 3. Receive Fleet Updates
```typescript
socket.on('operator:fleet_updated', (stats) => {
  // stats: {
  //   online_drivers, active_rides,
  //   total_earnings, timestamp
  // }
  
  // Update dashboard stats
  updateFleetStats(stats);
});
```

---

## 🔐 Admin Events

### 1. Subscribe to System Alerts
```typescript
socket.emit('admin:subscribe_alerts');

socket.on('alert:received', (alert) => {
  // alert: {
  //   id, title, severity, message,
  //   target_role, timestamp
  // }
  
  // severity: 'critical', 'high', 'medium', 'low'
  
  if (alert.severity === 'critical') {
    showCriticalAlert(alert);
  } else {
    addToAlertsList(alert);
  }
});
```

### 2. Subscribe to System Health
```typescript
socket.emit('admin:subscribe_system_health');

socket.on('admin:health_update', (health) => {
  // health: {
  //   api_status, database_status,
  //   cache_status, payment_gateway_status,
  //   timestamp
  // }
  
  updateHealthDashboard(health);
});
```

---

## 📢 Broadcast Events

### Server sends these to all connected clients:

#### 1. New Ride Request (To All Drivers)
```typescript
// Server triggers:
socket.io.of("/").emit("broadcast:new_ride_request", {
  ride_id, pickup, dropoff,
  estimated_fare, passenger_rating,
  ride_type, expires_at
});

// Drivers receive:
socket.on('driver:new_ride_request', (rideRequest) => {
  // Handle as above
});
```

#### 2. Ride Accepted (To Passenger)
```typescript
// Server triggers:
socket.io.of("/").emit("broadcast:ride_accepted", {
  ride_id, driver_id, driver_name,
  driver_rating, vehicle_info, eta
});

// Passenger receives:
socket.on('passenger:ride_accepted', (driver) => {
  // Show driver on map
});
```

#### 3. Ride Completed (To Passenger & Driver)
```typescript
// Server triggers:
socket.io.of("/").emit("broadcast:ride_completed", {
  ride_id, driver_id,
  final_fare, rating
});

// Passenger receives:
socket.on('passenger:ride_completed', (data) => {
  // Show completion screen
});

// Driver receives:
socket.on('driver:earning_updated', (earning) => {
  // Update earnings
});
```

#### 4. System Alert (To Target Role)
```typescript
// Server triggers:
socket.io.of("/").emit("broadcast:alert", {
  id, title, severity,
  message, target_role  // 'driver', 'operator', 'admin'
});

// All clients in that role receive:
socket.on('alert:received', (alert) => {
  // Handle alert
});
```

---

## 💓 Heartbeat (Keep Alive)

Send heartbeat every 30 seconds to keep connection alive:
```typescript
setInterval(() => {
  socket.emit('heartbeat', {
    timestamp: new Date().toISOString(),
  });
}, 30000);

socket.on('heartbeat_response', (data) => {
  // Connection is alive
});
```

---

## 🔗 Socket Rooms Structure

```
passenger:user_123              → Passenger specific events
  ride:ride_456                   → Live ride tracking
broadcast:passenger               → All passengers
  ├─ passenger:ride_accepted
  ├─ passenger:ride_completed
  └─ alert:received

driver:user_789                 → Driver specific events
  ├─ driver:requests:user_789     → Ride requests
  └─ driver:earnings
broadcast:driver                → All drivers
  ├─ driver:new_ride_request
  ├─ driver:status_changed
  ├─ driver:incentive_updated
  └─ alert:received

operator:user_111               → Operator specific
  └─ operator:fleet:user_111      → Fleet updates
operator:drivers                → All drivers (location updates)
broadcast:operator              → All operators
  └─ alert:received

admin:alerts                    → System alerts
admin:health                    → System health
broadcast:admin                 → All admins
  └─ alert:received
```

---

## 🔄 Real-Time Update Intervals

| Event | Interval | Notes |
|-------|----------|-------|
| Driver Location | 5s | When actively tracking |
| Driver Earnings | On Completion | Updated when ride completes |
| Operator Fleet Stats | Real-time | On any driver status change |
| System Health | 30s | Admin dashboard |
| Alerts | Real-time | Immediate broadcast |
| Heartbeat | 30s | Keep connection alive |

---

## ⚠️ Error Handling

```typescript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  // Implement retry logic
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  // Auto-reconnect handled by socket.io config
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

---

## 📱 Integration with Mobile App

### PassengerDashboard.tsx
```typescript
useEffect(() => {
  if (!session?.token || !currentRide) return;

  socket.emit('authenticate', {
    user_id: session.user.id,
    token: session.token,
    role: 'passenger'
  });

  socket.emit('passenger:subscribe_ride', {
    ride_id: currentRide.id,
  });

  socket.on('passenger:ride_accepted', handleRideAccepted);
  socket.on('driver:location_updated', updateMapLocation);
  socket.on('passenger:ride_completed', handleCompletion);

  return () => {
    socket.emit('passenger:unsubscribe_ride', {
      ride_id: currentRide.id,
    });
  };
}, [currentRide?.id]);
```

### DriverDashboardSimplified.tsx
```typescript
useEffect(() => {
  socket.emit('authenticate', {
    user_id: session.user.id,
    token: session.token,
    role: 'driver'
  });

  socket.emit('driver:subscribe_ride_requests');

  socket.on('driver:new_ride_request', handleNewRideRequest);
  socket.on('driver:earning_updated', updateEarnings);
  socket.on('driver:incentive_updated', showIncentive);

  // Update location every 5 seconds
  const locationInterval = setInterval(() => {
    getCurrentLocation().then((loc) => {
      socket.emit('driver:update_location', {
        ride_id: currentRideId,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      });
    });
  }, 5000);

  return () => {
    clearInterval(locationInterval);
  };
}, []);
```

### OperatorDashboard.tsx
```typescript
useEffect(() => {
  socket.emit('authenticate', {
    user_id: session.user.id,
    token: session.token,
    role: 'operator'
  });

  socket.emit('operator:subscribe_fleet');

  socket.on('driver:location_updated', updateFleetMap);
  socket.on('driver:status_changed', updateDriverStatus);
  socket.on('operator:fleet_updated', updateStats);
}, []);
```

---

## 📞 Testing WebSocket Events

### Using Socket.io Test Client
```bash
# Download Socket.io client
npm install socket.io-client

# Test script
const { io } = require('socket.io-client');

const socket = io('http://localhost:8000');

socket.on('connect', () => {
  console.log('Connected');
  
  socket.emit('authenticate', {
    user_id: 'test_user',
    token: 'test_token',
    role: 'driver'
  });
});

socket.on('auth_response', (data) => {
  console.log('Auth response:', data);
});
```

---

## 🚀 Production Deployment

### Redis Adapter (For Multiple Servers)
```python
# In server.py
from python_socketio import AsyncServer
import aioredis

redis = await aioredis.create_redis_pool('redis://localhost')
sio = AsyncServer(
    async_mode='asgi',
    client_manager=AsyncRedisManager(redis)
)
```

### Environment Variables
```
SOCKETIO_PING_INTERVAL=60
SOCKETIO_PING_TIMEOUT=10
SOCKETIO_CORS_ALLOWED_ORIGINS=*
SOCKETIO_CORS_CREDENTIALS=true
```

---

## 📊 Performance Monitoring

Track WebSocket metrics:
- Active connections
- Message throughput
- Latency per event
- Error rates

```typescript
const metrics = {
  connections: 0,
  messagesPerSecond: 0,
  latency: [],
};

socket.onAny((eventName, ...args) => {
  const start = Date.now();
  // Process event
  const latency = Date.now() - start;
  metrics.latency.push(latency);
});
```

---

**Integration Point**: Mobile app connects on app launch, authenticates, subscribes to relevant rooms based on user role, receives real-time updates, disconnects on logout.

**Status**: ✅ Ready for Mobile App Integration
