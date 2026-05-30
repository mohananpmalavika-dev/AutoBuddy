# 🔌 DRIVER DASHBOARD INTEGRATION GUIDE

**Guide for:** Integrating 5 new driver safety/earnings features  
**Components:** SOS Button, Passenger Ratings, Photo Verification, Heatmap, Traffic Alerts  
**Time to Integrate:** ~30 minutes

---

## Step 1: Add Imports to DriverDashboard.native.js

```typescript
// Add these imports at the top with other component imports (around line 45-70)

import DriverSOSButton from '../components/DriverSOSButton';
import PassengerSafetyRatingsPanel from '../components/PassengerSafetyRatingsPanel';
import DriverPhotoVerificationPanel from '../components/DriverPhotoVerificationPanel';
import DemandHeatmapIntegration from '../components/DemandHeatmapIntegration';
import TrafficAlerts from '../components/TrafficAlerts';

// Also add new API groups
import { driverSafetyAPI, demandTrafficAPI } from '../services/apiClient';
```

---

## Step 2: Add State Variables

```typescript
// Add to component state (around line 80-150)

const [sosActive, setSosActive] = useState(false);
const [sosError, setSosError] = useState('');
const [currentPassengerId, setCurrentPassengerId] = useState(null);
const [driverPhotoVerified, setDriverPhotoVerified] = useState(false);
const [selectedHotspot, setSelectedHotspot] = useState(null);
const [trafficAlertsActive, setTrafficAlertsActive] = useState(false);
```

---

## Step 3: Add Handler Functions

```typescript
// Add these handlers around line 300-400

const handleTriggerSOS = useCallback(async () => {
  try {
    const response = await driverSafetyAPI.triggerSOS({
      driver_id: driverId,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      timestamp: new Date().toISOString(),
    });
    setSosActive(true);
    
    // Emit Socket.IO event
    getSocket()?.emit('driver_sos_triggered', {
      driver_id: driverId,
      location: currentLocation,
      timestamp: new Date().toISOString(),
    });
    
    Alert.alert('✅ SOS Activated', 'Authorities and support have been notified');
    return true;
  } catch (error) {
    setSosError(error?.message || 'Failed to send SOS');
    return false;
  }
}, [driverId, currentLocation]);

const handleCancelSOS = useCallback(async () => {
  try {
    await driverSafetyAPI.cancelSOS();
    setSosActive(false);
    setSosError('');
    
    // Emit Socket.IO event
    getSocket()?.emit('driver_sos_cancelled', {
      driver_id: driverId,
      timestamp: new Date().toISOString(),
    });
    
    Alert.alert('ℹ️ SOS Cancelled', 'Emergency alert has been ended');
  } catch (error) {
    setSosError(error?.message || 'Failed to cancel SOS');
  }
}, [driverId]);

const handleNavigateToHotspot = useCallback((hotspot) => {
  setSelectedHotspot(hotspot);
  
  // In real app, trigger navigation to hotspot coordinates
  // openMapsApp(hotspot.latitude, hotspot.longitude);
  
  Alert.alert('📍 Navigate to Hotspot', `Navigating to ${hotspot.name}`);
}, []);

const handleRouteChange = useCallback((route) => {
  // Update navigation with selected route
  Alert.alert('🚦 Route Updated', `Now using: ${route.name}`);
}, []);

const handlePhotoVerificationComplete = useCallback((result) => {
  if (result.status === 'VERIFIED') {
    setDriverPhotoVerified(true);
    Alert.alert('✅ Verification Complete', 'Your identity has been verified');
  }
}, []);
```

---

## Step 4: Add JSX Components to Render

Find the main render/return section and add these components:

### In Top Header Section:
```jsx
{/* SOS Button - Top Right Corner */}
<View style={styles.sosButtonContainer}>
  <DriverSOSButton
    onTriggerSOS={handleTriggerSOS}
    onCancelSOS={handleCancelSOS}
    sosActive={sosActive}
    sosError={sosError}
    compact={true}
  />
</View>
```

### In Main Content ScrollView:
```jsx
{/* Photo Verification - If not verified */}
{!driverPhotoVerified && (
  <DriverPhotoVerificationPanel
    onVerificationComplete={handlePhotoVerificationComplete}
    driverId={driverId}
    isVerified={driverPhotoVerified}
  />
)}

{/* Demand Heatmap - Earnings Optimization */}
<DemandHeatmapIntegration
  onNavigateToHotspot={handleNavigateToHotspot}
  currentLocation={currentLocation}
/>

{/* Traffic Alerts - Route Optimization */}
<TrafficAlerts
  currentLocation={currentLocation}
  destinationLocation={currentRideDestination}
  onRouteChange={handleRouteChange}
/>
```

### In Booking Details Section:
```jsx
{/* Passenger Safety Rating - Before Accepting Ride */}
{currentRide && (
  <PassengerSafetyRatingsPanel
    passengerId={currentRide.passenger_id}
    onLoad={(data) => {
      // Handle rating loaded
    }}
  />
)}
```

---

## Step 5: Add Socket.IO Event Listeners

```typescript
// Add to component useEffect (around line 500+)

useEffect(() => {
  const socket = getSocket();
  if (!socket) return;

  // Listen for SOS emergency broadcasts
  socket.on('sos_alert_received', (data) => {
    console.log('SOS alert received:', data);
    // Handle SOS from other driver
  });

  // Listen for traffic updates
  socket.on('traffic_alert_updated', (data) => {
    console.log('Traffic alert updated:', data);
    setTrafficAlertsActive(true);
  });

  // Cleanup
  return () => {
    socket.off('sos_alert_received');
    socket.off('traffic_alert_updated');
  };
}, []);
```

---

## Step 6: Add StyleSheet Entries

```typescript
// Add to StyleSheet.create({...}) at bottom of file

sosButtonContainer: {
  position: 'absolute',
  top: 16,
  right: 16,
  zIndex: 100,
  minWidth: 100,
},

safetyPanel: {
  marginVertical: 12,
  marginHorizontal: 16,
},

heatmapPanel: {
  marginVertical: 12,
  marginHorizontal: 16,
},

trafficPanel: {
  marginVertical: 12,
  marginHorizontal: 16,
},
```

---

## Step 7: Backend Integration Points

### When Passenger Books (BookingDetailsScreen.js):
```typescript
// Before accepting booking, load passenger safety rating
useEffect(() => {
  if (bookingDetails?.passenger_id) {
    driverSafetyAPI.getPassengerSafetyRating(bookingDetails.passenger_id)
      .then(response => {
        // Display passenger safety rating
      });
  }
}, [bookingDetails?.passenger_id]);
```

### When Driver Goes Online:
```typescript
// Check if photo verification is required
useEffect(() => {
  if (driverIsGoingOnline) {
    driverSafetyAPI.getPhotoVerificationStatus()
      .then(response => {
        if (response.status !== 'VERIFIED') {
          // Show photo verification panel
          setShowPhotoVerification(true);
        }
      });
  }
}, [driverIsGoingOnline]);
```

### Periodic Heatmap & Traffic Updates:
```typescript
// Refresh heatmap every 5 minutes
useEffect(() => {
  const interval = setInterval(() => {
    demandTrafficAPI.getDemandHeatmap(
      currentLocation.latitude,
      currentLocation.longitude
    ).then(data => {
      // Update heatmap
    });
  }, 5 * 60 * 1000);

  return () => clearInterval(interval);
}, [currentLocation]);
```

---

## Step 8: Navigation Integration

### Add to TabBar/QuickActions:
```typescript
// In DriverTabBar or QuickActionsMenu

const quickActions = [
  {
    id: 'heatmap',
    label: 'High Demand',
    icon: '📍',
    onPress: () => scrollToHeatmap(),
  },
  {
    id: 'traffic',
    label: 'Route Info',
    icon: '🚦',
    onPress: () => scrollToTraffic(),
  },
  {
    id: 'safety',
    label: 'SOS',
    icon: '🆘',
    onPress: () => handleTriggerSOS(),
  },
];
```

---

## Step 9: Testing Checklist

Before deployment, verify:

```
□ SOS Button appears in top right
□ Clicking SOS shows confirmation modal
□ Cancelling modal doesn't send alert
□ Confirming sends SOS alert + Socket.IO event
□ SOS button turns red when active
□ Cancel button appears when SOS active
□ Passenger safety rating loads before ride acceptance
□ Photo verification modal opens correctly
□ Camera modal captures selfie
□ Demand heatmap loads with hotspot data
□ Clicking hotspot navigates to location
□ Traffic alerts appear with multiple options
□ Route selection updates navigation
□ All components display without errors
□ Loading states work correctly
□ Error handling displays properly
□ Socket.IO receives all events
□ Real-time updates work (2-5 min intervals)
```

---

## Step 10: Optional Enhancements

```typescript
// Add haptic feedback for SOS
import { Haptics } from 'expo';

const handleTriggerSOS = async () => {
  await Haptics.impactAsync(Haptics.ImpactStyle.Heavy);
  // ... rest of handler
};

// Add analytics tracking
const trackSOSEvent = () => {
  analytics.logEvent('driver_sos_triggered', {
    driver_id: driverId,
    timestamp: new Date().toISOString(),
  });
};

// Add notifications for alerts
const showTrafficNotification = (alert) => {
  notificationManager.sendNotification({
    title: `🚦 ${alert.title}`,
    body: alert.description,
    priority: alert.severity === 'HIGH' ? 'high' : 'normal',
  });
};
```

---

## Component File Paths

| Component | File Path |
|-----------|-----------|
| SOS Button | `src/components/DriverSOSButton.js` |
| Passenger Ratings | `src/components/PassengerSafetyRatingsPanel.tsx` |
| Photo Verification | `src/components/DriverPhotoVerificationPanel.tsx` |
| Demand Heatmap | `src/components/DemandHeatmapIntegration.tsx` |
| Traffic Alerts | `src/components/TrafficAlerts.tsx` |

---

## API Endpoints Required

Backend team needs to implement these 12 endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/drivers/safety/sos` | POST | Trigger SOS |
| `/api/drivers/safety/sos/cancel` | POST | Cancel SOS |
| `/api/drivers/safety/sos/status` | GET | Get SOS status |
| `/api/drivers/verification/photo` | POST | Submit photo |
| `/api/drivers/verification/photo/status` | GET | Check verification |
| `/api/drivers/passenger-safety-rating/{id}` | GET | Get passenger rating |
| `/api/drivers/safety/report-passenger/{id}` | POST | Report passenger |
| `/api/drivers/demand-heatmap` | GET | Get hotspots |
| `/api/drivers/traffic-alerts` | POST | Get traffic/routes |
| `/api/drivers/route-optimization` | POST | Get optimized routes |
| `/api/drivers/traffic-report` | POST | Report incident |
| `/api/drivers/earnings-forecast` | GET | Get forecast |

---

**Integration Time:** 30-45 minutes  
**Complexity:** Medium  
**Testing Time:** 1 hour  

Ready to integrate! 🚀

