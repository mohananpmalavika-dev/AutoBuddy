# Family Assistant Frontend - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Mobile (React Native/Expo)

#### 1. Copy Files
```bash
# Files already in autobuddy-mobile project:
src/services/familyAssistantService.ts
src/hooks/useFamilyAssistant.ts
src/screens/FamilyAssistantDashboard.tsx
src/components/QuickActionBookingModal.tsx
```

#### 2. Add to Navigation
```tsx
// In your navigation setup (e.g., App.tsx or RootNavigator.tsx)
import { FamilyAssistantDashboard } from './screens/FamilyAssistantDashboard';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="FamilyAssistant"
        component={FamilyAssistantDashboard}
        options={{ title: 'Family Assistant' }}
      />
    </Stack.Navigator>
  );
}
```

#### 3. Test It
```tsx
// In your component
<FamilyAssistantDashboard
  userId="user123"
  token={authToken}
  userType="passenger"
/>
```

#### 4. Check API Base URL
```bash
# In your apiClient.ts, make sure backend URL is set correctly:
const API_BASE_URL = 'http://localhost:8000'; // or your production URL
```

---

### Web (React)

#### 1. Copy Files
```bash
src/hooks/useFamilyAssistantWeb.ts
src/components/FamilyAssistantDashboardWeb.tsx
src/services/familyAssistantService.ts  # Shared with mobile
```

#### 2. Set Environment Variable
```env
# .env or .env.local
REACT_APP_API_URL=http://localhost:8000
```

#### 3. Add Route
```tsx
// In your router (e.g., App.tsx or routes.tsx)
import { FamilyAssistantDashboard } from './components/FamilyAssistantDashboardWeb';

function App() {
  return (
    <Routes>
      <Route 
        path="/family-assistant" 
        element={<FamilyAssistantDashboard userId={userId} token={token} />} 
      />
    </Routes>
  );
}
```

#### 4. Test It
```bash
npm start
# Navigate to http://localhost:3000/family-assistant
```

---

## 📋 Pre-Requisites Checklist

- [ ] Backend API is running on `http://localhost:8000` (or update URL)
- [ ] User has valid authentication token
- [ ] Database has family_assistant tables created
- [ ] API endpoints `/api/family/*` are accessible
- [ ] User ID is available from authentication context

---

## 🔌 Connect to Your Auth System

### Mobile Example
```tsx
import { useAuth } from './contexts/AuthContext'; // Your auth context

export function MyScreen() {
  const { user, token } = useAuth();

  return (
    <FamilyAssistantDashboard
      userId={user.id}
      token={token}
      userType={user.type}
    />
  );
}
```

### Web Example
```tsx
import { useAuthContext } from './hooks/useAuthContext'; // Your auth hook

export function FamilyPage() {
  const { user, token } = useAuthContext();

  return (
    <FamilyAssistantDashboard
      userId={user.id}
      token={token}
    />
  );
}
```

---

## ⚡ Quick Hook Usage

### Basic Pattern
```tsx
import { useFamilyAssistant } from '../hooks/useFamilyAssistant'; // Mobile
// or
import { useFamilyAssistantWeb } from '../hooks/useFamilyAssistantWeb'; // Web

function MyComponent({ userId }) {
  const {
    familyMembers,
    upcomingAppointments,
    notifications,
    addFamilyMember,
    quickBookRide,
    loading,
    error,
  } = useFamilyAssistant(userId); // or useFamilyAssistantWeb(userId, token)

  // Use the data and methods
  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      {/* Your UI */}
    </div>
  );
}
```

### Add Family Member
```tsx
const handleAddMember = async () => {
  try {
    await addFamilyMember({
      name: 'Mom',
      email: 'mom@example.com',
      phone: '9876543210',
      relation: 'parent',
      is_active: true,
      calendar_synced: false,
      emergency_contact: false,
    });
    console.log('Member added!');
  } catch (error) {
    console.error('Failed:', error);
  }
};
```

### One-Click Booking
```tsx
const handleQuickBook = async (appointment) => {
  try {
    const response = await quickBookRide({
      member_id: appointment.member_id,
      appointment_id: appointment.id,
      vehicle_type: 'economy',
    });
    console.log('Ride booked:', response.ride_id);
  } catch (error) {
    console.error('Booking failed:', error);
  }
};
```

---

## 🧪 Testing

### Check API Connection
```bash
# Test if backend is running
curl http://localhost:8000/api/family/members/list \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
# [{ id: "...", name: "...", ...}]
```

### Check Component Renders
```tsx
// Add this to see if component loads
<FamilyAssistantDashboard
  userId="test-user"
  token="test-token"
  userType="passenger"
/>

// Look for:
// 1. "Family Assistant" heading
// 2. Stats cards (Upcoming Rides, Appointments, Family Members)
// 3. Family members section
// 4. Add Member button
```

---

## 🐛 Common Issues & Fixes

### Issue: "Cannot find module" Error
**Solution**: Make sure files are in correct paths:
```
Mobile: src/hooks/useFamilyAssistant.ts
Web: src/hooks/useFamilyAssistantWeb.ts
Service: src/services/familyAssistantService.ts
```

### Issue: "API URL not found" Error
**Solution**: Update API base URL:
```tsx
// In apiClient.ts or familyAssistantService.ts
const API_BASE_URL = 'http://localhost:8000'; // ← Set this correctly
```

### Issue: "401 Unauthorized" Error
**Solution**: Check authentication token:
```tsx
// Make sure token is valid and being passed:
<FamilyAssistantDashboard
  userId={userId}
  token={validAuthToken}  // ← Ensure this is valid
  userType="passenger"
/>
```

### Issue: "Cannot read property 'split' of undefined"
**Solution**: Ensure dates are strings:
```tsx
// Make sure appointment dates are ISO strings
{
  start_time: "2024-01-15T10:00:00Z",  // ✓ Correct
  // NOT: new Date(...)
}
```

### Issue: Empty Appointment List
**Solution**: Make sure family members are added first:
```tsx
// 1. Add family member
await addFamilyMember({ name: 'Mom', ... });

// 2. Then add appointments for that member
await addAppointment(memberId, { 
  title: 'Doctor appointment',
  ...
});
```

---

## 📱 Mobile-Specific Tips

### Handling Navigation
```tsx
import { useNavigation } from '@react-navigation/native';

export function MyScreen() {
  const navigation = useNavigation();

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('FamilyAssistant')}
    >
      <Text>Open Family Assistant</Text>
    </TouchableOpacity>
  );
}
```

### Permission Handling
```tsx
// For calendar access, add to app.json:
{
  "plugins": [
    ["expo-calendar"]
  ]
}

// Request permission before syncing:
const { status } = await Calendar.requestCalendarPermissionsAsync();
if (status === 'granted') {
  await syncCalendar(memberId);
}
```

---

## 🌐 Web-Specific Tips

### Using with Next.js
```tsx
// pages/family-assistant.tsx
import { FamilyAssistantDashboard } from '../components/FamilyAssistantDashboardWeb';
import { useAuth } from '../hooks/useAuth';

export default function FamilyPage() {
  const { user, token } = useAuth();
  
  if (!user) return <div>Loading...</div>;

  return <FamilyAssistantDashboard userId={user.id} token={token} />;
}
```

### Styling Integration
```tsx
// To integrate with your CSS framework:
// 1. Extract inline styles to CSS modules
// 2. Or modify component prop to accept className

// Example CSS module:
// FamilyAssistant.module.css
.dashboard { /* ... */ }
.statCard { /* ... */ }
```

### Environment Setup
```env
# .env.local
REACT_APP_API_URL=http://localhost:8000
REACT_APP_ENVIRONMENT=development
```

---

## 📊 Features Quick Reference

### Available Methods

| Feature | Hook Method | Description |
|---------|------------|-------------|
| Add Member | `addFamilyMember(data)` | Add new family member |
| Remove Member | `removeFamilyMember(id)` | Remove family member |
| List Members | `familyMembers` | Get all family members |
| Add Appointment | `addAppointment(memberId, data)` | Add appointment |
| Get Appointments | `appointments` | Get all appointments |
| Quick Book | `quickBookRide(request)` | One-click booking |
| Notifications | `notifications` | Get all notifications |
| Mark Read | `markNotificationRead(id)` | Mark notification read |
| Dashboard | `dashboardData` | Get dashboard stats |
| Sync Calendar | `syncCalendar(memberId)` | Manual calendar sync |

---

## 🎯 Implementation Checklist

- [ ] Copy files to correct directories
- [ ] Update API base URL
- [ ] Connect to authentication system
- [ ] Test API connection
- [ ] Add to navigation/routing
- [ ] Test component rendering
- [ ] Test add family member flow
- [ ] Test appointment creation
- [ ] Test quick booking (if ride booking is integrated)
- [ ] Handle error cases
- [ ] Add proper error logging
- [ ] Test on actual device (mobile) / browser (web)

---

## 🔗 Related Documentation

- Full Implementation Guide: `FAMILY_ASSISTANT_FRONTEND_IMPLEMENTATION.md`
- Summary: `FAMILY_ASSISTANT_FRONTEND_SUMMARY.md`
- Backend Guide: `FAMILY_ASSISTANT_GUIDE.md`
- API Reference: `FAMILY_ASSISTANT_IMPLEMENTATION.md`

---

## 💬 Support

For issues or questions:

1. Check the **Troubleshooting** section above
2. Review **FAMILY_ASSISTANT_FRONTEND_IMPLEMENTATION.md** for detailed patterns
3. Check backend API endpoints are working: `curl http://localhost:8000/api/family/members/list`
4. Verify authentication token is valid
5. Check browser/device console for error messages

---

## 🎉 You're Ready!

The Family Assistant feature is now ready to use. Start with the component rendering in your app and gradually integrate the features you need.

**Happy coding! 🚀**
