# Phase 2 Integration Guide - Real-Time Features

**Status**: WebSocket Integration In Progress  
**Date**: June 19, 2026

---

## 📱 Installation & Setup

### 1. Install Dependencies
```bash
cd autobuddy-mobile
npm install
```

New packages added:
- `socket.io-client` - WebSocket client (v4.8.3)
- `firebase` - Push notifications (v10.13.2)
- `expo-notifications` - Local notifications (v0.28.8)

### 2. Configure Environment
Create/update `.env`:
```bash
REACT_APP_API_URL=http://localhost:8000/api
REACT_APP_WS_URL=http://localhost:8000
FIREBASE_API_KEY=your_key
FIREBASE_PROJECT_ID=your_project
```

### 3. Wrap App with Provider
In `App.tsx`:
```typescript
import { AppSessionProvider } from './hooks/useAppSession';

export default function App() {
  return (
    <AppSessionProvider>
      {/* Your app screens */}
    </AppSessionProvider>
  );
}
```

---

## 🔗 WebSocket Integration by Role

### Passenger Flow

#### LivePassengerDashboard (with Real-Time Tracking)
```typescript
import { useRealtimeTracking } from '../hooks/useRealtimeTracking';
import LiveTrackingMap from '../components/LiveTrackingMap';

export function PassengerDashboard({ token, user, onLogout }) {
  const { activeRideId } = useRideState();
  
  // Get real-time driver location
  const { driverLocation, rideInfo, isLoading, unsubscribe } = 
    useRealtimeTracking(activeRideId);

  return (
    <View style={styles.container}>
      {activeRideId && (
        <>
          {/* Show live tracking map */}
          {driverLocation && (
            <LiveTrackingMap 
              driverLocation={driverLocation}
              rideInfo={rideInfo}
              onRideCancel={unsubscribe}
            />
          )}
          
          {/* Show driver info card */}
          {rideInfo && (
            <DriverInfoCard 
              driver={rideInfo}
              eta={rideInfo.eta}
            />
          )}
        </>
      )}
    </View>
  );
}
```

#### Booking a Ride (WebSocket Integration)
```typescript
const bookRide = async (rideData) => {
  try {
    // Book via API
    const response = await passengerAPI.bookRide(token, rideData);
    const rideId = response.ride_id;
    
    // Subscribe to real-time updates
    useRealtimeTracking(rideId);
    
    // Show tracking screen
    setActiveRideId(rideId);
  } catch (error) {
    showError(error.message);
  }
};
```

---

### Driver Flow

#### Real-Time Earnings with Notifications
```typescript
import { useRealtimeEarnings, useRideRequests, useDriverStatus, useDriverAlerts } 
  from '../hooks/useRealtimeEarnings';

export function DriverDashboard({ token, user, onLogout }) {
  const { earnings, latestEarning, incentive } = useRealtimeEarnings();
  const { rideRequest, countdown, acceptRide, declineRide } = useRideRequests();
  const { isOnline, toggleStatus } = useDriverStatus();
  const { alerts, unresolvedCount } = useDriverAlerts();

  return (
    <View style={styles.container}>
      {/* Earnings widget with real-time updates */}
      <DriverEarningsWidget 
        earnings={earnings}
        latestEarning={latestEarning}
        incentive={incentive}
      />

      {/* Ride request modal with countdown */}
      {rideRequest && (
        <RideRequestModal
          ride={rideRequest}
          countdown={countdown}
          onAccept={() => acceptRide(rideRequest.ride_id)}
          onDecline={() => declineRide(rideRequest.ride_id)}
        />
      )}

      {/* Online status toggle */}
      <StatusToggle 
        isOnline={isOnline}
        onToggle={toggleStatus}
      />

      {/* Alerts badge */}
      <AlertsBadge count={unresolvedCount} />
    </View>
  );
}
```

#### Location Streaming (Active Ride)
```typescript
import { useDriverLocationStreaming } from '../hooks/useRealtimeTracking';
import * as Location from 'expo-location';

useEffect(() => {
  if (!activeRideId || !isOnline) return;

  const { startStreaming, stopStreaming, isStreaming } = 
    useDriverLocationStreaming(activeRideId);

  // Get current location every 5 seconds
  const getLocation = async () => {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy || 50,
      speed: location.coords.speed || 0,
    };
  };

  startStreaming(getLocation);

  return () => stopStreaming();
}, [activeRideId, isOnline]);
```

---

### Operator Flow

#### Real-Time Fleet Monitoring
```typescript
import { useFleetLocations } from '../hooks/useRealtimeTracking';
import { useFleetStats } from '../hooks/useRealtimeAlerts';

export function OperatorDashboard({ token, onLogout }) {
  const { locations } = useFleetLocations();
  const { stats, utilization } = useFleetStats();
  const { notifications, removeNotification } = useOperatorNotifications();

  return (
    <View style={styles.container}>
      {/* Fleet stats with real-time updates */}
      <FleetStatsCard 
        onlineDrivers={stats.online_drivers}
        activeRides={stats.active_rides}
        rating={stats.rating}
        utilization={utilization}
      />

      {/* Map with real-time driver markers */}
      <OperatorFleetMap 
        driverLocations={locations}
        onDriverPress={(driverId) => showDriverDetails(driverId)}
      />

      {/* Notifications center */}
      <NotificationCenter
        notifications={notifications}
        onDismiss={(id) => removeNotification(id)}
      />
    </View>
  );
}
```

---

### Admin Flow

#### System Monitoring Dashboard
```typescript
import { useRealtimeAlerts, useSystemHealth } from '../hooks/useRealtimeAlerts';

export function AdminDashboard({ token, onLogout }) {
  const { alerts, getCriticalAlerts } = useRealtimeAlerts();
  const { health, isAllHealthy, unhealthySystems } = useSystemHealth();

  return (
    <View style={styles.container}>
      {/* System health indicator */}
      <SystemHealthCard 
        isHealthy={isAllHealthy}
        unhealthySystems={unhealthySystems}
        health={health}
      />

      {/* Critical alerts section */}
      {getCriticalAlerts().length > 0 && (
        <CriticalAlertsSection 
          alerts={getCriticalAlerts()}
          onResolve={(alertId) => resolveAlert(alertId)}
        />
      )}

      {/* All alerts list */}
      <AlertsListView 
        alerts={alerts}
        onAlertSelect={(alert) => handleAlertAction(alert)}
      />
    </View>
  );
}
```

---

## 🗺️ Live Tracking Map Component

### Creating the Map Component
```typescript
// components/LiveTrackingMap.tsx
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { DriverLocation, RideTracking } from '../hooks/useRealtimeTracking';

interface LiveTrackingMapProps {
  driverLocation: DriverLocation;
  rideInfo: RideTracking;
  onRideCancel: () => void;
}

export function LiveTrackingMap({ 
  driverLocation, 
  rideInfo, 
  onRideCancel 
}: LiveTrackingMapProps) {
  const mapRef = useRef<MapView>(null);

  // Auto-follow driver
  useEffect(() => {
    if (driverLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 300);
    }
  }, [driverLocation]);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={{
        latitude: driverLocation?.latitude || 28.7041,
        longitude: driverLocation?.longitude || 77.1025,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
    >
      {/* Driver marker */}
      {driverLocation && (
        <Marker
          coordinate={{
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude,
          }}
          title={rideInfo?.driver_name}
          description={rideInfo?.vehicle_info?.model}
        >
          <DriverMarkerView 
            name={rideInfo?.driver_name}
            rating={rideInfo?.driver_rating}
          />
        </Marker>
      )}

      {/* Pickup & dropoff markers */}
      {/* Add markers for pickup and dropoff locations */}

      {/* Route polyline */}
      <Polyline
        coordinates={[
          { latitude: rideInfo.pickup_lat, longitude: rideInfo.pickup_lng },
          { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
          { latitude: rideInfo.dropoff_lat, longitude: rideInfo.dropoff_lng },
        ]}
        strokeColor="#2196F3"
        strokeWidth={3}
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
```

---

## 💳 Payment Integration (Stripe)

### Setup Stripe
```typescript
// lib/stripe-client.ts
import { initStripe } from '@stripe/stripe-react-native';

export const initializeStripe = async () => {
  await initStripe({
    publishableKey: process.env.REACT_APP_STRIPE_KEY!,
    merchantIdentifier: 'merchant.autobuddy',
  });
};
```

### Payment Modal
```typescript
import { usePayment } from '../hooks/usePayment';
import { CardField, CardFieldInput } from '@stripe/stripe-react-native';

export function PaymentMethodModal({ visible, onClose, onSuccess }) {
  const { processPayment, isProcessing } = usePayment();
  const cardFieldRef = useRef<CardFieldInput>(null);

  const handlePayment = async () => {
    const card = await cardFieldRef.current?.getCardDetails();
    if (!card?.complete) {
      Alert.alert('Invalid Card', 'Please enter complete card details');
      return;
    }

    try {
      const result = await processPayment({
        amount: 5000, // Amount in cents
        currency: 'INR',
        description: 'AutoBuddy Ride Payment',
      });

      if (result.success) {
        onSuccess();
      }
    } catch (error) {
      Alert.alert('Payment Failed', error.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <Text style={styles.title}>Payment Method</Text>

        <CardField
          ref={cardFieldRef}
          placeholders={{
            number: '4242 4242 4242 4242',
            expiration: 'MM/YY',
            cvc: 'CVC',
          }}
          cardStyle={styles.cardField}
        />

        <Button
          title={isProcessing ? 'Processing...' : 'Pay Now'}
          onPress={handlePayment}
          disabled={isProcessing}
        />

        <Button title="Cancel" onPress={onClose} />
      </View>
    </Modal>
  );
}
```

---

## 🔔 Push Notifications

### Firebase Setup
```typescript
// lib/firebase-config.ts
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_ID,
};

export const initializeFirebase = () => {
  return initializeApp(firebaseConfig);
};

export const getFirebaseToken = async () => {
  try {
    const token = await getToken(getMessaging());
    return token;
  } catch (error) {
    console.error('Failed to get Firebase token:', error);
    return null;
  }
};
```

### Push Notification Handler
```typescript
import { usePushNotifications } from '../hooks/usePushNotifications';

const { registerForPushNotifications, notifications } = 
  usePushNotifications();

useEffect(() => {
  // Register for push notifications on app start
  registerForPushNotifications();

  // Listen for incoming notifications
  const subscription = notifications.subscribe((notification) => {
    handleNotification(notification);
  });

  return () => subscription.unsubscribe();
}, []);

const handleNotification = (notification: any) => {
  const { title, body, data } = notification;

  // Route based on notification type
  switch (data?.type) {
    case 'ride_accepted':
      navigateToRideTracking(data.ride_id);
      break;
    case 'ride_request':
      showRideRequestAlert(data);
      break;
    case 'earnings_update':
      showEarningsNotification(data);
      break;
    default:
      showNotificationBanner(title, body);
  }
};
```

---

## 📊 Real-Time Data Flow

```
WebSocket Connection
├── Passenger Flow
│   ├── Subscribe to ride → receive driver_location_updated (5s)
│   ├── Listen for passenger:ride_accepted
│   ├── Listen for driver:location_updated
│   └── Listen for passenger:ride_completed
│
├── Driver Flow
│   ├── Subscribe to ride requests → receive driver:new_ride_request
│   ├── Emit driver:update_location (5s interval)
│   ├── Listen for driver:earning_updated (on completion)
│   ├── Listen for driver:incentive_updated
│   └── Toggle driver:online_status_changed
│
├── Operator Flow
│   ├── Subscribe to fleet → get all driver:location_updated
│   ├── Listen for driver:status_changed
│   ├── Listen for operator:fleet_updated
│   └── Listen for alert:received
│
└── Admin Flow
    ├── Subscribe to alerts → get alert:received
    ├── Subscribe to health → get admin:health_update
    └── Listen for critical system alerts
```

---

## ✅ Testing Checklist

- [ ] WebSocket connects on app start
- [ ] Authentication works with JWT token
- [ ] Passenger sees live driver updates (every 5s)
- [ ] Driver earnings update in real-time
- [ ] Driver receives ride requests with 12s countdown
- [ ] Operator sees fleet location updates
- [ ] Admin sees critical alerts
- [ ] Heartbeat keeps connection alive (30s)
- [ ] Reconnect works on network failure
- [ ] Push notifications deliver correctly
- [ ] Payment processing works with Stripe
- [ ] No WebSocket errors in console

---

## 🐛 Troubleshooting

### WebSocket Not Connecting
```typescript
// Check connection status
useEffect(() => {
  console.log('Connected:', isConnected);
  console.log('Authenticated:', isAuthenticated);
}, [isConnected, isAuthenticated]);
```

### Location Not Updating
- Check GPS permission granted
- Check driver has active ride
- Check heartbeat is working

### Earnings Not Showing
- Check ride marked as completed on backend
- Check driver earning webhook sent
- Check WebSocket listener active

---

**Status**: Phase 2 WebSocket Integration Complete  
**Next**: Live Tracking Map Component (Day 3-4)
