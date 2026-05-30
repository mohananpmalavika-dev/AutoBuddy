# 💻 MISSING CODE - EXACT IMPLEMENTATION GUIDE

**For**: Fixing critical missing functionality
**Target**: Monday 6/3/2026 Launch
**Time**: 6-10 hours

---

## FIX #1: API Error Handling (1 hour)

### 🎯 Goal
Add retry logic, token refresh, and error messages to API calls

### 📍 File: `autobuddy-mobile/src/services/apiClient.ts`

**Current State** (incomplete):
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',
  timeout: 10000,
});

export default api;
```

**Add This Code**:
```typescript
import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',
  timeout: 30000,
});

// Store for token management
let authToken = null;

// ✅ NEW: Request interceptor for adding token
api.interceptors.request.use(
  async (config) => {
    if (!authToken) {
      authToken = await AsyncStorage.getItem('auth_token');
    }
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ NEW: Response interceptor for handling 401 (token refresh)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    // Handle 401 - Token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refresh_token');
        if (refreshToken) {
          const { data } = await axios.post(`${api.defaults.baseURL}/api/auth/refresh`, {
            refresh_token: refreshToken,
          });
          authToken = data.access_token;
          await AsyncStorage.setItem('auth_token', authToken);
          originalRequest.headers.Authorization = `Bearer ${authToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed - logout user
        await AsyncStorage.removeItem('auth_token');
        await AsyncStorage.removeItem('refresh_token');
        // Trigger logout event
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ✅ NEW: Error parser for user-friendly messages
export const getErrorMessage = (error: any): string => {
  if (axios.isAxiosError(error)) {
    // Network error
    if (!error.response) {
      return 'Network error. Please check your connection.';
    }

    // Server error
    const status = error.response.status;
    const data = error.response.data as any;

    switch (status) {
      case 400:
        return data.message || 'Invalid request';
      case 401:
        return 'Session expired. Please log in again.';
      case 403:
        return 'You do not have permission for this action.';
      case 404:
        return 'Resource not found.';
      case 409:
        return data.message || 'This resource already exists.';
      case 422:
        return data.detail?.[0]?.msg || 'Invalid input data.';
      case 429:
        return 'Too many requests. Please try again later.';
      case 500:
        return 'Server error. Please try again later.';
      case 503:
        return 'Service unavailable. Please try again later.';
      default:
        return data.message || 'An unexpected error occurred.';
    }
  }

  return 'An unexpected error occurred.';
};

export default api;
```

### 🧪 Test It
```typescript
// In a component:
import api, { getErrorMessage } from './services/apiClient';

async function handleLogin(email: string, password: string) {
  try {
    const { data } = await api.post('/api/auth/login', { email, password });
    // Success
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(message); // "Invalid email or password"
  }
}
```

---

## FIX #2: WebSocket Real-Time Tracking (1-2 hours)

### 🎯 Goal
Connect frontend to backend WebSocket for live location updates

### 📍 File: `autobuddy-mobile/src/services/socketClient.ts`

**Create New File** with:
```typescript
import { io, Socket } from 'socket.io-client';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:8000';

let socket: Socket | null = null;
let locationSubscription: Location.LocationSubscription | null = null;

// ✅ Initialize WebSocket connection
export async function connectRideTracking(rideId: string) {
  try {
    const token = await AsyncStorage.getItem('auth_token');

    socket = io(`${SOCKET_URL}/api/v3/tracking/ws/${rideId}`, {
      auth: {
        token: token || '',
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Connected to ride tracking');
      startLocationTracking(rideId);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      stopLocationTracking();
    });

    // Listen for location updates from other users (driver/passenger)
    socket.on('location_received', (data: any) => {
      console.log('📍 Location update:', data);
      // Update map with new location
      // Trigger: setDriverLocation(data.location)
    });

    // Listen for ride events
    socket.on('ride_event', (event: any) => {
      console.log('Event:', event);
    });

    return socket;
  } catch (error) {
    console.error('Failed to connect:', error);
  }
}

// ✅ Start sending location updates
async function startLocationTracking(rideId: string) {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.error('Location permission denied');
      return;
    }

    // Get location updates every 5 seconds
    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10, // 10 meters
      },
      (location) => {
        if (socket?.connected) {
          socket.emit('location_update', {
            ride_id: rideId,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            timestamp: new Date().toISOString(),
          });
        }
      }
    );
  } catch (error) {
    console.error('Location tracking error:', error);
  }
}

// ✅ Stop tracking
export function stopLocationTracking() {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
}

// ✅ Disconnect socket
export function disconnectRideTracking() {
  stopLocationTracking();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ✅ Send custom event
export function emitEvent(eventName: string, data: any) {
  if (socket?.connected) {
    socket.emit(eventName, data);
  }
}

// ✅ Listen for event
export function onEvent(eventName: string, callback: (data: any) => void) {
  if (socket) {
    socket.on(eventName, callback);
  }
}
```

### 🧪 Test It
```typescript
// In a screen component:
import { useEffect } from 'react';
import { connectRideTracking, disconnectRideTracking } from './services/socketClient';

export function LiveTrackingScreen({ rideId }) {
  useEffect(() => {
    // Connect when screen loads
    connectRideTracking(rideId);

    return () => {
      // Disconnect when leaving
      disconnectRideTracking();
    };
  }, [rideId]);

  return <MapView>...</MapView>;
}
```

---

## FIX #3: Payment Flow UI (2-3 hours)

### 🎯 Goal
Create payment method entry and confirmation screens

### 📍 File: `autobuddy-mobile/src/screens/PaymentScreen.tsx`

**Create New File** with:
```typescript
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import api, { getErrorMessage } from '../services/apiClient';

interface PaymentScreenProps {
  bookingId: string;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PaymentScreen({
  bookingId,
  amount,
  onSuccess,
  onCancel,
}: PaymentScreenProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateCard = (): boolean => {
    if (cardNumber.replace(/\s/g, '').length !== 16) {
      setError('Card number must be 16 digits');
      return false;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      setError('Expiry must be MM/YY');
      return false;
    }
    if (cvv.length !== 3) {
      setError('CVV must be 3 digits');
      return false;
    }
    return true;
  };

  const handlePayment = async () => {
    setError(null);
    if (!validateCard()) return;

    setIsProcessing(true);
    try {
      // Step 1: Create payment intent
      const { data: intentData } = await api.post('/api/payments/intent', {
        booking_id: bookingId,
        amount: amount,
        currency: 'USD',
      });

      // Step 2: Confirm payment (in real app, use Stripe SDK)
      // For MVP: Send card details to backend
      const { data: paymentData } = await api.post('/api/payments/confirm', {
        client_secret: intentData.client_secret,
        card: {
          number: cardNumber.replace(/\s/g, ''),
          exp_month: parseInt(expiry.split('/')[0]),
          exp_year: parseInt('20' + expiry.split('/')[1]),
          cvc: cvv,
        },
      });

      // Step 3: Success
      if (paymentData.status === 'succeeded') {
        console.log('✅ Payment successful');
        onSuccess();
      } else {
        setError('Payment failed: ' + paymentData.error);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={{ padding: 20, flex: 1 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        Pay ₹{amount}
      </Text>

      {error && <Text style={{ color: 'red', marginBottom: 10 }}>{error}</Text>}

      <TextInput
        placeholder="Card Number"
        value={cardNumber}
        onChangeText={(text) => {
          // Format: XXXX XXXX XXXX XXXX
          const cleaned = text.replace(/\s/g, '');
          const formatted = cleaned
            .match(/.{1,4}/g)
            ?.join(' ')
            .slice(0, 19);
          setCardNumber(formatted || '');
        }}
        maxLength={19}
        keyboardType="numeric"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 12,
          marginBottom: 12,
          borderRadius: 8,
        }}
      />

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <TextInput
          placeholder="MM/YY"
          value={expiry}
          onChangeText={(text) => {
            const cleaned = text.replace(/\D/g, '');
            if (cleaned.length >= 2) {
              setExpiry(`${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`);
            } else {
              setExpiry(cleaned);
            }
          }}
          maxLength={5}
          keyboardType="numeric"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#ccc',
            padding: 12,
            borderRadius: 8,
          }}
        />
        <TextInput
          placeholder="CVV"
          value={cvv}
          onChangeText={setCvv}
          maxLength={3}
          keyboardType="numeric"
          secureTextEntry
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#ccc',
            padding: 12,
            borderRadius: 8,
          }}
        />
      </View>

      <TouchableOpacity
        disabled={isProcessing}
        onPress={handlePayment}
        style={{
          backgroundColor: isProcessing ? '#ccc' : '#007AFF',
          padding: 15,
          borderRadius: 8,
          marginBottom: 10,
        }}
      >
        {isProcessing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
            Pay ₹{amount}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onCancel}
        style={{
          borderWidth: 1,
          borderColor: '#007AFF',
          padding: 15,
          borderRadius: 8,
        }}
      >
        <Text style={{ color: '#007AFF', textAlign: 'center', fontWeight: 'bold' }}>
          Cancel
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

### 🧪 Integration
```typescript
// In RideCompletionScreen or PaymentFlow:
import { PaymentScreen } from './PaymentScreen';

export function RideCompletionFlow() {
  const [showPayment, setShowPayment] = useState(true);

  return showPayment ? (
    <PaymentScreen
      bookingId="ride_123"
      amount={250}
      onSuccess={() => {
        setShowPayment(false);
        // Show receipt/success screen
      }}
      onCancel={() => {
        // Go back
      }}
    />
  ) : (
    <ReceiptScreen />
  );
}
```

---

## FIX #4: Environment Configuration (30 min)

### 🎯 Goal
Set up production environment variables

### 📍 Files: Create new files

**File 1: `backend/.env.production`**
```bash
# Database
DATABASE_URL=postgresql://prod_user:SecurePassword123@prod-db.example.com:5432/autobuddy_prod
REDIS_URL=redis://:password@prod-redis.example.com:6379/0

# JWT & Security
JWT_SECRET=generate_strong_random_string_256_chars_minimum_here_xxxxx
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# API
API_BASE_URL=https://api.yourdomain.com
ENVIRONMENT=production

# Stripe Payment Gateway
STRIPE_PUBLIC_KEY=pk_live_YOUR_STRIPE_PUBLIC_KEY_HERE
STRIPE_SECRET_KEY=sk_live_YOUR_STRIPE_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# AWS S3 (for document uploads)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_BUCKET_NAME=autobuddy-uploads-prod
AWS_REGION=us-east-1

# Google OAuth
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_secret_here

# Monitoring
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
LOG_LEVEL=INFO

# SMS/Email Services
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_token_here
SENDGRID_API_KEY=SG.your_sendgrid_key_here
```

**File 2: `autobuddy-mobile/.env.production`**
```bash
# API Configuration
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
EXPO_PUBLIC_SOCKET_URL=https://yourdomain.com
EXPO_PUBLIC_STRIPE_PUBLIC_KEY=pk_live_YOUR_STRIPE_PUBLIC_KEY_HERE
EXPO_PUBLIC_GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
EXPO_PUBLIC_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0

# Feature flags
EXPO_PUBLIC_FEATURE_PAYMENT_ENABLED=true
EXPO_PUBLIC_FEATURE_TRACKING_ENABLED=true
EXPO_PUBLIC_FEATURE_POOLING_ENABLED=true
EXPO_PUBLIC_FEATURE_AIRPORT_ENABLED=true
```

### 📍 Deployment Platform Instructions

**For Render Backend**:
```
1. Go to render.com dashboard
2. Select "autobuddy-backend" service
3. Click "Environment" tab
4. Add each variable from .env.production
5. Don't commit secrets to GitHub!
```

**For Vercel Frontend**:
```
1. Go to vercel.com dashboard
2. Select "autobuddy-mobile" project
3. Go to Settings → Environment Variables
4. Add each EXPO_PUBLIC_* variable
5. Don't commit secrets to GitHub!
```

---

## FIX #5: Error Messages & Validation (1 hour)

### 🎯 Goal
Show users friendly error messages

### 📍 File: `autobuddy-mobile/src/components/ErrorBoundary.tsx`

**Create New File** with:
```typescript
import React, { ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught:', error, errorInfo);
    // Send to monitoring service
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#f5f5f5',
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
            Oops! Something went wrong
          </Text>
          <Text
            style={{
              color: '#666',
              marginBottom: 20,
              textAlign: 'center',
              paddingHorizontal: 20,
            }}
          >
            {this.state.error?.message}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{
              backgroundColor: '#007AFF',
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}
```

### 📍 File: `autobuddy-mobile/src/components/ErrorToast.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Text, View, Animated } from 'react-native';

interface ErrorToastProps {
  message: string;
  duration?: number;
  onDismiss?: () => void;
}

export function ErrorToast({ message, duration = 3000, onDismiss }: ErrorToastProps) {
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Fade out after duration
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onDismiss?.());
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        backgroundColor: '#ff4444',
        padding: 15,
        borderRadius: 8,
        marginHorizontal: 15,
        marginTop: 20,
      }}
    >
      <Text style={{ color: 'white', fontWeight: 'bold' }}>{message}</Text>
    </Animated.View>
  );
}
```

### 🧪 Usage
```typescript
// In a screen component:
import { useState } from 'react';
import { ErrorToast } from './components/ErrorToast';
import { ErrorBoundary } from './components/ErrorBoundary';

export function BookingScreen() {
  const [error, setError] = useState<string | null>(null);

  const handleBookRide = async () => {
    try {
      await api.post('/api/bookings', { /* ... */ });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
    }
  };

  return (
    <ErrorBoundary>
      <View>
        {/* Your UI */}
        {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
      </View>
    </ErrorBoundary>
  );
}
```

---

## QUICK IMPLEMENTATION CHECKLIST

- [ ] **Fix #1**: Copy apiClient error handling code (30 min)
- [ ] **Fix #2**: Create socketClient with location tracking (45 min)
- [ ] **Fix #3**: Create PaymentScreen component (1 hour)
- [ ] **Fix #4**: Configure production environment variables (30 min)
- [ ] **Fix #5**: Add ErrorBoundary and ErrorToast components (15 min)

**Total Time: 3 hours implementation + 1 hour testing + 1 hour integration = ~5-6 hours**

---

**Status**: All code ready to copy-paste
**Next**: Deploy and test in production environment
