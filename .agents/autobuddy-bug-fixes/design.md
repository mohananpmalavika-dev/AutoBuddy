# AutoBuddy Bug Fixes - Design Document

## Overview
This document provides detailed solutions for all 24 bugs identified in the requirements document. Each solution includes specific code changes, patterns to adopt, and implementation guidance.

## Design Principles

### 1. Defensive Programming
- Always validate inputs before use
- Check for null/undefined before accessing properties
- Provide fallback values
- Fail gracefully with user-friendly messages

### 2. Consistent Error Handling
- All async operations wrapped in try-catch
- Standard error response format
- User-friendly error messages
- Errors logged for debugging

### 3. Type Safety
- Runtime validation for external data
- No unsafe type assertions
- Proper TypeScript interfaces with required fields
- Use type guards for discriminated unions

### 4. Memory Management
- All useEffect hooks have cleanup functions
- Cancel pending operations on unmount
- Clear timers and intervals
- Remove event listeners

### 5. State Management
- Prevent race conditions with flags/mutexes
- Debounce user actions
- Atomic state updates
- Validate state transitions

---

## Architecture Changes

### New Patterns to Adopt

#### 1. Standard Error Response Interface
```typescript
interface APIError {
  message: string;
  code: string;
  status: number;
  details?: any;
  userMessage: string;  // Always user-friendly
}
```

#### 2. API Response Wrapper
```typescript
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
}
```

#### 3. Validation Utility
```typescript
// New file: src/utils/validation.ts
export const validate = {
  isValidPhone: (phone: string): boolean => { },
  isValidCoordinates: (lat: number, lon: number): boolean => { },
  isValidFare: (fare: number): boolean => { },
  isValidDate: (date: any): boolean => { }
};
```

#### 4. Safe Access Utility
```typescript
// New file: src/utils/safeAccess.ts
export function safeGet<T>(obj: any, path: string, defaultValue: T): T {
  // Safe nested property access
}
```

---

## Critical Bugs (Priority 1)

### BUG-001: User Object Null Access

**Solution Design**:


#### Problem
Direct property access on user object after API response without validation.

#### Root Cause
No validation that API response contains expected user object structure.

#### Solution Approach
1. Create user validator function
2. Validate before storing in AsyncStorage
3. Show specific error if validation fails
4. Use type guards for user object

#### Implementation

**Step 1: Create User Validator**
```typescript
// New file: src/utils/userValidator.ts
interface ValidatedUser {
  id: string;
  role: 'passenger' | 'driver' | 'operator';
  name?: string;
  email?: string;
  phone: string;
  photo?: string;
}

export function validateUser(userData: any): ValidatedUser | null {
  // Check required fields exist
  if (!userData) {
    return null;
  }
  
  if (!userData.id || typeof userData.id !== 'string') {
    console.error('[Auth] Invalid user: missing or invalid id');
    return null;
  }
  
  if (!userData.role || !['passenger', 'driver', 'operator'].includes(userData.role)) {
    console.error('[Auth] Invalid user: missing or invalid role');
    return null;
  }
  
  if (!userData.phone || typeof userData.phone !== 'string') {
    console.error('[Auth] Invalid user: missing phone');
    return null;
  }
  
  // Return validated user object
  return {
    id: userData.id,
    role: userData.role,
    name: userData.name || '',
    email: userData.email || '',
    phone: userData.phone,
    photo: userData.photo || '',
  };
}
```

**Step 2: Update Login Handler in App.tsx**
```typescript
// BEFORE (Line 97-125)
const response = await post<any>('/api/auth/login', credentials);

if (response.status === 'success' && response.data) {
  const { access_token, user } = response.data;
  await AsyncStorage.setItem('authToken', access_token);
  await AsyncStorage.setItem('userId', user.id);  // ❌ UNSAFE
  // ...
}

// AFTER (with validation)
const response = await post<any>('/api/auth/login', credentials);

if (response.status === 'success' && response.data) {
  const { access_token, user: rawUser } = response.data;
  
  // Validate user object
  const user = validateUser(rawUser);
  
  if (!user) {
    throw new Error('Invalid user data received from server. Please contact support.');
  }
  
  // Now safe to use
  try {
    await AsyncStorage.setItem('authToken', access_token);
    await AsyncStorage.setItem('userId', user.id);
    await AsyncStorage.setItem('userRole', user.role);
    await AsyncStorage.setItem('userName', user.name || user.phone);
    await AsyncStorage.setItem('userEmail', user.email || '');
    await AsyncStorage.setItem('userPhone', user.phone);
  } catch (storageError) {
    console.error('[Auth] Failed to save user data:', storageError);
    throw new Error('Failed to save login session. Please check device storage.');
  }
  
  // Rest of login flow...
}
```

**Step 3: Apply Same Pattern to Signup**
```typescript
// Line 141-173 - Same validation pattern
const response = await post<any>('/api/auth/signup', data);

if (response.status === 'success' && response.data) {
  const { access_token, user: rawUser } = response.data;
  
  const user = validateUser(rawUser);
  if (!user) {
    throw new Error('Invalid user data received. Please try again.');
  }
  
  // Safe to proceed...
}
```

#### Testing Requirements
- ✅ Test with valid user object
- ✅ Test with null user
- ✅ Test with missing id field
- ✅ Test with missing role field  
- ✅ Test with invalid role value
- ✅ Test with missing phone
- ✅ Verify error messages are user-friendly

#### Success Criteria
- No crashes on login with invalid data
- Clear error message shown to user
- Error logged for debugging
- All user fields validated before use

---

### BUG-004: API Error Handling Gaps

**Solution Design**:

#### Problem
API interceptor only handles 401, 429, network errors. Other errors reach UI as raw axios errors.

#### Root Cause
Incomplete error handling in response interceptor.

#### Solution Approach
1. Handle all HTTP status codes explicitly
2. Create user-friendly messages for each error type
3. Implement retry logic for appropriate errors
4. Standardize error format

#### Implementation

**Step 1: Define Error Messages**
```typescript
// New file: src/utils/errorMessages.ts
export const ERROR_MESSAGES = {
  // 4xx Client Errors
  400: 'Invalid request. Please check your input and try again.',
  401: 'Your session has expired. Please log in again.',
  403: 'You don\'t have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'This action conflicts with existing data. Please refresh and try again.',
  422: 'The data provided is invalid. Please check and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
  
  // 5xx Server Errors
  500: 'Something went wrong on our end. Please try again in a moment.',
  502: 'Service temporarily unavailable. Please try again shortly.',
  503: 'Service is under maintenance. Please try again later.',
  504: 'Request timed out. Please check your connection and try again.',
  
  // Network Errors
  NETWORK_ERROR: 'No internet connection. Please check your network and try again.',
  TIMEOUT: 'Request took too long. Please try again.',
  
  // Generic
  UNKNOWN: 'An unexpected error occurred. Please try again.',
};

export function getErrorMessage(status?: number, code?: string): string {
  if (code === 'NETWORK_ERROR') return ERROR_MESSAGES.NETWORK_ERROR;
  if (code === 'TIMEOUT') return ERROR_MESSAGES.TIMEOUT;
  if (status && ERROR_MESSAGES[status]) return ERROR_MESSAGES[status];
  return ERROR_MESSAGES.UNKNOWN;
}
```

**Step 2: Update API Client Interceptor**
```typescript
// src/services/apiClient.ts - Response interceptor
rawAxiosInstance.interceptors.response.use(
  async (response: AxiosResponse) => {
    // Success path unchanged
    const headers = response.config?.headers as Record<string, unknown> | undefined;
    const authorization = headers?.Authorization || headers?.authorization;
    if (authorization) {
      await extendSessionExpiry();
    }
    return attachLegacyDataAlias(response.data) as AxiosResponse;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const errorData = error.response?.data as AnyRecord | string | undefined;
    
    // Extract backend message if available
    let backendMessage = '';
    if (typeof errorData === 'string') {
      backendMessage = errorData;
    } else if (errorData && typeof errorData === 'object') {
      backendMessage = errorData?.error?.message || errorData?.message || '';
    }
    
    // Handle specific status codes
    
    // 401 Unauthorized - existing logic enhanced
    if (status === 401) {
      if (await shouldPreserveStoredAuth()) {
        const message = backendMessage || SESSION_RECONNECT_MESSAGE;
        return Promise.reject({
          message,
          userMessage: message,
          code: 'AUTH_RETRY_REQUIRED',
          status: 401,
          originalError: error,
        });
      }
      
      await clearStoredAuth();
      redirectToLoginIfWeb();
      return Promise.reject({
        message: backendMessage || ERROR_MESSAGES[401],
        userMessage: ERROR_MESSAGES[401],
        code: 'AUTH_EXPIRED',
        status: 401,
        originalError: error,
      });
    }
    
    // 403 Forbidden
    if (status === 403) {
      return Promise.reject({
        message: backendMessage || ERROR_MESSAGES[403],
        userMessage: ERROR_MESSAGES[403],
        code: 'FORBIDDEN',
        status: 403,
        originalError: error,
      });
    }
    
    // 404 Not Found
    if (status === 404) {
      return Promise.reject({
        message: backendMessage || ERROR_MESSAGES[404],
        userMessage: ERROR_MESSAGES[404],
        code: 'NOT_FOUND',
        status: 404,
        originalError: error,
      });
    }
    
    // 429 Too Many Requests - existing retry logic enhanced
    if (status === 429 && retryCount < MAX_RETRIES) {
      retryCount++;
      const delayMs = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return rawAxiosInstance(error.config!);
    }
    
    // 5xx Server Errors - retry with backoff
    if (status && status >= 500 && status < 600) {
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        const delayMs = Math.pow(2, retryCount) * 1000;
        console.log(`[API] Server error ${status}, retrying in ${delayMs}ms (attempt ${retryCount}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return rawAxiosInstance(error.config!);
      }
      
      // Max retries exceeded
      return Promise.reject({
        message: backendMessage || getErrorMessage(status),
        userMessage: getErrorMessage(status),
        code: 'SERVER_ERROR',
        status,
        originalError: error,
      });
    }
    
    // Network errors (no response) - retry once
    if (!error.response && retryCount < 1) {
      retryCount++;
      console.log('[API] Network error, retrying...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return rawAxiosInstance(error.config!);
    }
    
    // Network error - no retries left
    if (!error.response) {
      return Promise.reject({
        message: 'No internet connection',
        userMessage: ERROR_MESSAGES.NETWORK_ERROR,
        code: 'NETWORK_ERROR',
        status: 0,
        originalError: error,
      });
    }
    
    // All other errors (400, 409, 422, etc.)
    return Promise.reject({
      message: backendMessage || getErrorMessage(status),
      userMessage: getErrorMessage(status),
      code: errorData?.error?.code || 'UNKNOWN_ERROR',
      status: status || 0,
      details: errorData?.error?.details,
      originalError: error,
    });
  }
);
```

#### Testing Requirements
- ✅ Test each HTTP status code (400, 401, 403, 404, 429, 500, 502, 503, 504)
- ✅ Test network errors (no connection)
- ✅ Test timeout scenarios
- ✅ Test retry logic (should retry 5xx, not 4xx)
- ✅ Test max retries exceeded
- ✅ Verify user sees friendly messages

#### Success Criteria
- All HTTP errors handled with user-friendly messages
- Automatic retry for transient errors (5xx, network)
- No raw axios errors reach the UI
- Errors logged for debugging

---

### BUG-011: Duplicate Booking Race Condition

**Solution Design**:

#### Problem
User can click "Book Ride" multiple times, creating duplicate bookings.

#### Root Cause
No flag to prevent duplicate submissions while API request is pending.

#### Solution Approach
1. Add "submitting" state flag
2. Disable button during submission
3. Show loading indicator
4. Only re-enable after response or error

#### Implementation

**Step 1: Add Submission State**
```typescript
// In PassengerDashboard.tsx or booking component
const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
```

**Step 2: Update handleBookRide**
```typescript
// BEFORE (Line ~140)
const handleBookRide = (rideData: any) => {
  if (!rideData || !rideData.destination || !rideData.destination.trim()) {
    Alert.alert('Destination Required', 'Please enter your destination');
    return;
  }
  setBookingDestination(rideData.destination);
  setBookingRideType(rideData.rideType);
  bookRide('Current Location', rideData.destination, rideData.rideType, rideData.fare || 150);
};

// AFTER (with race condition prevention)
const handleBookRide = async (rideData: any) => {
  // Prevent duplicate submissions
  if (isSubmittingBooking) {
    console.log('[Booking] Submission already in progress, ignoring duplicate click');
    return;
  }
  
  // Validate input
  if (!rideData || !rideData.destination || !rideData.destination.trim()) {
    Alert.alert('Destination Required', 'Please enter your destination');
    return;
  }
  
  // Set submitting flag
  setIsSubmittingBooking(true);
  
  try {
    setBookingDestination(rideData.destination);
    setBookingRideType(rideData.rideType);
    
    // Call booking API
    await bookRide(
      'Current Location',
      rideData.destination,
      rideData.rideType,
      rideData.fare || 150
    );
    
    // Success - flag will be cleared by bookRide completing
  } catch (error) {
    // Error - show message and re-enable
    console.error('[Booking] Failed:', error);
    Alert.alert(
      'Booking Failed',
      error?.userMessage || 'Unable to create booking. Please try again.'
    );
  } finally {
    // Always clear the flag
    setIsSubmittingBooking(false);
  }
};
```

**Step 3: Update UI Button**
```typescript
// In render/JSX:
<Pressable
  style={[
    styles.bookButton,
    isSubmittingBooking && styles.bookButtonDisabled
  ]}
  onPress={() => handleBookRide(rideData)}
  disabled={isSubmittingBooking}
>
  {isSubmittingBooking ? (
    <ActivityIndicator color="#fff" />
  ) : (
    <Text style={styles.bookButtonText}>Book Ride</Text>
  )}
</Pressable>

// Add to styles:
bookButtonDisabled: {
  opacity: 0.5,
  backgroundColor: '#ccc',
},
```

**Step 4: Also Debounce for Extra Safety**
```typescript
// New utility: src/utils/debounce.ts
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]) as T;
}

// Use in component:
const debouncedBookRide = useDebounce(handleBookRide, 300);
```

#### Testing Requirements
- ✅ Test single click → booking created
- ✅ Test double click rapidly → only one booking
- ✅ Test button disabled during submission
- ✅ Test loading indicator shows
- ✅ Test button re-enabled after success
- ✅ Test button re-enabled after error
- ✅ Test with slow network (3G simulation)

#### Success Criteria
- Impossible to create duplicate bookings
- Clear visual feedback during submission
- Button re-enables after completion
- Works on slow networks

---

### BUG-021: SQL Injection Audit

**Solution Design**:

#### Problem
Potential SQL injection if raw queries use string concatenation with user input.

#### Root Cause
Unknown - need to audit backend code.

#### Solution Approach
1. Audit all database queries
2. Ensure parameterized queries used everywhere
3. Use ORM features (SQLAlchemy) properly
4. Add input sanitization layer

#### Implementation

**Step 1: Code Audit Checklist**
```python
# Search backend for these patterns:
# ❌ DANGEROUS:
query = f"SELECT * FROM users WHERE phone = '{phone}'"
query = "SELECT * FROM rides WHERE id = " + ride_id
cursor.execute("DELETE FROM bookings WHERE user_id = '%s'" % user_id)

# ✅ SAFE:
query = "SELECT * FROM users WHERE phone = ?"
cursor.execute(query, (phone,))

# Or with SQLAlchemy:
session.query(User).filter(User.phone == phone).first()
```

**Step 2: Create Safe Query Wrapper** (if raw queries exist)
```python
# backend/app/utils/db_safe.py
from typing import Any, List, Tuple
import re

def sanitize_sql_identifier(identifier: str) -> str:
    """
    Sanitize SQL identifiers (table/column names).
    Only allows alphanumeric and underscore.
    """
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', identifier):
        raise ValueError(f"Invalid SQL identifier: {identifier}")
    return identifier

def execute_safe_query(
    cursor: Any,
    query: str,
    params: Tuple[Any, ...] = ()
) -> Any:
    """
    Execute query with parameterization.
    Never use string formatting with user input.
    """
    # Log for audit
    print(f"[DB] Executing: {query[:100]}... with params: {len(params)}")
    
    # Execute with parameters
    return cursor.execute(query, params)
```

**Step 3: Replace Unsafe Patterns**
```python
# BEFORE (if found):
def get_user_by_phone(phone: str):
    query = f"SELECT * FROM users WHERE phone = '{phone}'"  # ❌ DANGEROUS
    return db.execute(query)

# AFTER:
def get_user_by_phone(phone: str):
    query = "SELECT * FROM users WHERE phone = ?"
    return db.execute(query, (phone,))

# Or better with SQLAlchemy:
def get_user_by_phone(phone: str):
    from app.models import User
    return session.query(User).filter(User.phone == phone).first()
```

**Step 4: Add Input Validation**
```python
# backend/app/utils/validators.py
import re
from typing import Optional

def validate_phone(phone: str) -> Optional[str]:
    """Validate and sanitize phone number."""
    # Remove all non-digit characters
    cleaned = re.sub(r'\D', '', phone)
    
    # Check length (10 digits for India)
    if len(cleaned) != 10:
        return None
    
    return cleaned

def validate_booking_id(booking_id: str) -> bool:
    """Validate booking ID format."""
    # Should be UUID or specific format
    return bool(re.match(r'^[a-f0-9-]{36}$', booking_id))
```

#### Audit Process
1. **Search codebase** for:
   - `f"SELECT` or `f'SELECT`
   - `.execute("` with `+` or `%`
   - String concatenation in queries
   
2. **Review files**:
   - All files in `backend/app/routers/`
   - All files in `backend/app/models/`
   - Any direct database query files
   
3. **Test with SQLMap**:
   ```bash
   # Test endpoints for SQL injection
   sqlmap -u "http://localhost:8000/api/users?phone=test" --batch
   ```

#### Success Criteria
- No string concatenation in SQL queries
- All user inputs parameterized
- Input validation in place
- SQLMap tests pass

---

## High Priority Bugs (Priority 2)

### BUG-002: Booking Object Null Checks

**Solution Design**:

#### Problem
Components access `booking` properties without checking if booking exists.

#### Solution Approach
Use optional chaining consistently throughout components.

#### Implementation

**Pattern to Apply Everywhere**:
```typescript
// BEFORE:
<Text>{booking.destination}</Text>
<Text>{booking.fare}</Text>

// AFTER:
<Text>{booking?.destination || 'Not set'}</Text>
<Text>{booking?.fare ? `₹${booking.fare}` : 'Calculating...'}</Text>

// Or with conditional rendering:
{booking ? (
  <View>
    <Text>{booking.destination}</Text>
    <Text>₹{booking.fare}</Text>
  </View>
) : (
  <Text>No active booking</Text>
)}
```

**Create Safe Booking Hook**:
```typescript
// src/hooks/useSafeBooking.ts
export function useSafeBooking(booking: Booking | null) {
  return {
    hasBooking: booking !== null,
    destination: booking?.destination || '',
    origin: booking?.origin || '',
    fare: booking?.fare || 0,
    status: booking?.status || 'unknown',
    driver: booking?.driver || null,
    rideType: booking?.rideType || 'economy',
  };
}

// Usage:
const safeBooking = useSafeBooking(booking);
<Text>{safeBooking.destination}</Text>  // Always safe
```

---

### BUG-005: Missing Try-Catch Blocks

**Solution Design**:

#### Problem
Async function calls in components not wrapped in try-catch.

#### Solution Approach
Create wrapper hooks that handle errors automatically.

#### Implementation

**Create Safe Async Hook**:
```typescript
// src/hooks/useSafeAsync.ts
export function useSafeAsync<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  errorMessage: string = 'An error occurred'
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const execute = useCallback(async (...args: Args): Promise<T | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await asyncFn(...args);
      return result;
    } catch (err: any) {
      const message = err?.userMessage || err?.message || errorMessage;
      setError(message);
      console.error('[SafeAsync] Error:', err);
      
      // Show user-friendly alert
      Alert.alert('Error', message);
      
      return null;
    } finally {
      setLoading(false);
    }
  }, [asyncFn, errorMessage]);
  
  return { execute, loading, error };
}

// Usage in component:
const { execute: getSuggestions, loading, error } = useSafeAsync(
  travelIntentService.getSuggestions,
  'Failed to load suggestions'
);

const handleSearch = async (query: string) => {
  const suggestions = await getSuggestions(query, lat, lon);
  if (suggestions) {
    setSuggestions(suggestions);
  }
};
```

---

## Summary of Design Patterns

### 1. Validation First
```typescript
// Always validate external data
const user = validateUser(apiResponse.user);
if (!user) {
  throw new Error('Invalid data');
}
// Now safe to use
```

### 2. Optional Chaining Everywhere
```typescript
// Never: obj.prop.subprop
// Always: obj?.prop?.subprop || defaultValue
```

### 3. Try-Catch All Async
```typescript
async function apiCall() {
  try {
    const data = await fetch();
    return data;
  } catch (error) {
    console.error('[Component] Error:', error);
    showErrorMessage(error?.userMessage);
    return null;
  }
}
```

### 4. Cleanup in useEffect
```typescript
useEffect(() => {
  let mounted = true;
  const interval = setInterval(pollData, 5000);
  
  return () => {
    mounted = false;
    clearInterval(interval);
  };
}, []);
```

### 5. Race Condition Prevention
```typescript
const [submitting, setSubmitting] = useState(false);

async function submit() {
  if (submitting) return;
  setSubmitting(true);
  try {
    await api.post();
  } finally {
    setSubmitting(false);
  }
}
```

---

## Next Steps

This design document covers the critical and high-priority bugs in detail. The remaining bugs (medium and low priority) follow similar patterns:

- **Memory Leaks**: Add cleanup to all useEffect hooks
- **Input Validation**: Use validation utilities consistently
- **Type Safety**: Add runtime checks for type assertions
- **Performance**: React.memo, useMemo, lazy loading

Would you like me to:
1. **Continue with full design** for all 24 bugs
2. **Create tasks.md** to break down implementation
3. **Start implementing** the critical fixes

Let me know how you'd like to proceed!
