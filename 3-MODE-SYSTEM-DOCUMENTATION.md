---
title: 3-Mode Feature Segmentation System Documentation
description: Complete guide to implementing and using the Simple/Smart/Pro mode system in AutoBuddy
---

# 3-Mode Feature Segmentation System

## Overview

The 3-Mode system organizes AutoBuddy's 500+ features into three user-friendly tiers:

- **Simple Mode** (Free): Basic ride booking, scheduling, and tracking
- **Smart Mode** (₹199/month): AI suggestions, family assistant, voice booking
- **Pro Mode** (Custom): Fleet management, analytics, corporate billing

This system **reduces UI/UX complexity** while enabling **monetization**.

---

## Architecture

### Backend Components

#### 1. Models (`app/models/user_mode.py`)

```python
# User's mode profile
UserModeProfile
├── user_id
├── current_mode (simple/smart/pro)
├── previous_mode
├── mode_upgraded_at
└── feature_preferences (ai_suggestions, voice_commands, etc.)

# Feature registry
FeatureDefinition
├── name (unique identifier)
├── access_mode (simple/smart/pro/all)
├── component_path
├── router_name
└── metadata
```

#### 2. Service (`app/services/feature_service.py`)

Main business logic:

```python
FeatureService
├── get_or_create_user_mode(user_id) → UserModeProfile
├── set_user_mode(user_id, mode) → Update mode
├── is_feature_accessible(user_id, feature) → bool
├── get_accessible_features(user_id) → List[Feature]
├── start_pro_trial(user_id, days) → Trial
├── upgrade_to_pro(user_id, days) → Subscription
└── bootstrap_features(db) → Initialize defaults
```

#### 3. API Routes (`app/routers/user_mode.py`)

```
GET    /api/v1/user-mode/{user_id}
PUT    /api/v1/user-mode/{user_id}/mode
POST   /api/v1/user-mode/{user_id}/trial
POST   /api/v1/user-mode/{user_id}/upgrade
PUT    /api/v1/user-mode/{user_id}/feature/{name}
GET    /api/v1/modes/summary
POST   /api/v1/modes/features/register
POST   /api/v1/modes/bootstrap-features
```

---

### Frontend Components

#### 1. Context (`src/contexts/UserModeContext.tsx`)

Global state management for user mode:

```typescript
useUserMode() → {
  currentMode: UserMode
  modeProfile: UserModeProfile
  isFeatureAccessible(featureName: string) → bool
  setUserMode(mode: UserMode) → Promise
  startProTrial(days?: number) → Promise
  upgradeToProSubscription(days?: number) → Promise
}
```

#### 2. Utilities (`src/utils/featureAccess.ts`)

Feature registry and helper functions:

```typescript
FEATURES = {
  BOOK_RIDE: { name, level, title, description, screen },
  AI_SUGGESTIONS: { ... },
  FLEET_MANAGEMENT: { ... },
  // ... all 50+ features
}

canAccessFeature(level, userMode) → bool
getFeaturesForMode(mode) → Feature[]
getModeDescription(mode) → string
getModeSummary(mode) → { name, badge, features, price }
```

#### 3. Hooks (`src/hooks/useFeatureAccess.ts`)

Custom hooks for feature access:

```typescript
useFeatureAccess(featureName) → { hasAccess, currentMode, canUpgrade }
useAccessibleFeatures() → { features, count, currentMode }
useModeUpgrade() → { upgradeToSmart, upgradeToProWithTrial, ... }
useModeMetadata() → { mode, isProTrial, trialRemainingDays, ... }
```

#### 4. Screens (`src/screens/ModeSelectionScreen.tsx`)

User-friendly mode selection UI with:
- Mode cards with feature lists
- Feature comparison table
- Trial/subscription modals
- Current mode indicator

---

## Usage Guide

### Backend Integration

#### 1. Initialize Database

```python
from app.services.feature_service import bootstrap_features

# In your bootstrap/startup code:
db = get_session()
bootstrap_features(db)
```

#### 2. Check Feature Access

```python
from app.services.feature_service import FeatureService

@app.get("/rides")
def get_rides(user_id: str, db: Session = Depends(get_db)):
    # Check if user can access ride booking
    if not FeatureService.is_feature_accessible(db, user_id, "book_ride"):
        raise HTTPException(
            status_code=403,
            detail="Feature not accessible in your current mode"
        )
    
    return get_user_rides(user_id)
```

#### 3. Middleware for Feature-Gated Endpoints

```python
from app.middleware.feature_middleware import FeatureGateMiddleware

app.add_middleware(
    FeatureGateMiddleware,
    protected_routes={
        "/api/v1/rides": "book_ride",
        "/api/v1/ai-suggestions": "ai_suggestions",
        "/api/v1/fleet": "fleet_management",
    }
)
```

#### 4. Register New Features

```python
from app.services.feature_service import FeatureService, FeatureAccessMode

# In admin panel or CLI:
FeatureService.register_feature(
    db=db,
    name="new_feature",
    access_mode=FeatureAccessMode.SMART,
    description="New awesome feature",
    component_path="screens/NewFeatureScreen",
    router_name="NewFeature",
    version="1.0.0"
)
```

### Frontend Integration

#### 1. Wrap App with Provider

```typescript
// In App.tsx or App.jsx
import { UserModeProvider } from './contexts/UserModeContext';

export default function App() {
  return (
    <UserModeProvider userId={userId}>
      <RootNavigator />
    </UserModeProvider>
  );
}
```

#### 2. Conditional Rendering

```typescript
// Using hook
import { useFeatureAccess } from '../hooks/useFeatureAccess';

function BookRideButton() {
  const { hasAccess, currentMode, canUpgrade } = useFeatureAccess('ai_suggestions');
  
  if (!hasAccess) {
    return (
      <View>
        <Text>AI Suggestions available in {currentMode} mode only</Text>
        {canUpgrade && <UpgradeButton />}
      </View>
    );
  }
  
  return <AISuggestionsComponent />;
}
```

#### 3. Feature-Gated Navigation

```typescript
// In navigation setup
import { useUserMode } from '../contexts/UserModeContext';
import { getModeNavigation } from '../utils/featureAccess';

function RootNavigator() {
  const { currentMode } = useUserMode();
  const routes = getModeNavigation(currentMode);
  
  return (
    <BottomTab.Navigator>
      {routes.map(route => (
        <BottomTab.Screen
          key={route.name}
          name={route.name}
          component={screenMap[route.name]}
          options={{ title: route.title, icon: route.icon }}
        />
      ))}
    </BottomTab.Navigator>
  );
}
```

#### 4. Mode Selection Screen

```typescript
import { ModeSelectionScreen } from '../screens/ModeSelectionScreen';

// Use in settings or onboarding
function SettingsScreen() {
  return (
    <ScrollView>
      <Text>Settings</Text>
      <ModeSelectionScreen />
    </ScrollView>
  );
}
```

#### 5. Custom Feature Gate Component

```typescript
// Reusable wrapper component
function FeatureGate({ feature, children, fallback }) {
  const { hasAccess } = useFeatureAccess(feature);
  
  if (!hasAccess) {
    return fallback || <Text>This feature is not available in your mode</Text>;
  }
  
  return children;
}

// Usage
<FeatureGate 
  feature="fleet_management"
  fallback={<Text>Upgrade to Pro Mode to access Fleet Management</Text>}
>
  <FleetManagementScreen />
</FeatureGate>
```

---

## Example: Adding New Features

### Scenario: Add "Schedule Ride Recurring"

#### Backend

1. **Register Feature**
   ```python
   FeatureService.register_feature(
       db=db,
       name="schedule_ride_recurring",
       access_mode=FeatureAccessMode.SMART,
       description="Schedule recurring rides",
       component_path="screens/ScheduleRecurringScreen",
       router_name="ScheduleRecurring"
   )
   ```

2. **Protect Endpoint**
   ```python
   @app.post("/api/v1/rides/schedule/recurring")
   def create_recurring_ride(
       user_id: str,
       ride_data: RideData,
       db: Session = Depends(get_db)
   ):
       if not FeatureService.is_feature_accessible(
           db, user_id, "schedule_ride_recurring"
       ):
           raise HTTPException(status_code=403, detail="Upgrade to Smart Mode")
       
       # Create recurring ride
   ```

#### Frontend

1. **Add to Feature Registry** (`featureAccess.ts`)
   ```typescript
   SCHEDULE_RIDE_RECURRING: {
     name: 'schedule_ride_recurring',
     level: FEATURE_LEVELS.SMART,
     title: 'Recurring Rides',
     description: 'Schedule recurring rides',
     screen: 'ScheduleRecurringScreen',
   }
   ```

2. **Create Component**
   ```typescript
   function ScheduleRecurringScreen() {
     const { hasAccess } = useFeatureAccess('schedule_ride_recurring');
     
     if (!hasAccess) return <UpgradePrompt />;
     
     return <ScheduleRecurringForm />;
   }
   ```

3. **Add to Navigation**
   ```typescript
   // Conditional screen based on mode
   {currentMode !== 'simple' && (
     <Stack.Screen name="ScheduleRecurring" component={ScheduleRecurringScreen} />
   )}
   ```

---

## Feature Flags / Toggles

### Per-User Feature Preferences

Users can enable/disable specific features within their mode:

```typescript
// Enable/disable a feature
await fetch(`/api/v1/user-mode/${userId}/feature/voice_commands`, {
  method: 'PUT',
  body: JSON.stringify({ enabled: true })
});

// Check preference
const profile = modeProfile;
if (profile.voice_commands_enabled) {
  showVoiceButton();
}
```

### Experimental Features

Mark features as experimental:

```python
# Backend
feature = FeatureDefinition(
    name="ai_predict_destination",
    is_experimental=True,
    access_mode=FeatureAccessMode.SMART
)
```

```typescript
// Frontend
if (feature.is_experimental) {
  showBadge("BETA");
}
```

---

## Analytics & Monitoring

### Track Mode Adoption

```python
# Log mode changes
event_data = {
    "event": "mode_changed",
    "user_id": user_id,
    "old_mode": profile.previous_mode,
    "new_mode": profile.current_mode,
    "timestamp": get_ist_now()
}
send_to_analytics(event_data)
```

### Monitor Trial Conversions

```python
# Calculate conversion rate
trial_users = db.query(UserModeProfile).filter(
    UserModeProfile.is_pro_trial == True
).count()

converted = db.query(UserModeProfile).filter(
    UserModeProfile.is_pro_subscriber == True
).count()

conversion_rate = (converted / trial_users) * 100 if trial_users > 0 else 0
```

---

## Database Schema

### Migration

```sql
-- User Mode Profiles
CREATE TABLE user_mode_profiles (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR UNIQUE NOT NULL,
    current_mode VARCHAR NOT NULL, -- simple, smart, pro
    previous_mode VARCHAR,
    mode_upgraded_at TIMESTAMP,
    ai_suggestions_enabled BOOLEAN DEFAULT TRUE,
    voice_commands_enabled BOOLEAN DEFAULT TRUE,
    family_assistant_enabled BOOLEAN DEFAULT FALSE,
    fleet_management_enabled BOOLEAN DEFAULT FALSE,
    analytics_dashboard_enabled BOOLEAN DEFAULT FALSE,
    corporate_billing_enabled BOOLEAN DEFAULT FALSE,
    is_pro_trial BOOLEAN DEFAULT FALSE,
    pro_trial_expires_at TIMESTAMP,
    is_pro_subscriber BOOLEAN DEFAULT FALSE,
    pro_subscription_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Feature Definitions
CREATE TABLE feature_definitions (
    id VARCHAR PRIMARY KEY,
    name VARCHAR UNIQUE NOT NULL,
    description TEXT,
    access_mode VARCHAR NOT NULL, -- simple, smart, pro, all
    component_path VARCHAR,
    router_name VARCHAR,
    is_experimental BOOLEAN DEFAULT FALSE,
    is_deprecated BOOLEAN DEFAULT FALSE,
    introduced_in_version VARCHAR,
    deprecated_in_version VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_mode_user_id ON user_mode_profiles(user_id);
CREATE INDEX idx_feature_name ON feature_definitions(name);
```

---

## Testing

### Backend Tests

```python
def test_feature_access():
    # Create test user profile
    profile = UserModeProfile(
        id="test-1",
        user_id="user-123",
        current_mode=UserModeEnum.SMART
    )
    
    # Assert access
    assert FeatureService.is_feature_accessible(
        db, "user-123", "ai_suggestions"
    ) == True
    
    assert FeatureService.is_feature_accessible(
        db, "user-123", "fleet_management"
    ) == False

def test_mode_upgrade():
    FeatureService.upgrade_to_pro(db, "user-123", 30)
    profile = FeatureService.get_or_create_user_mode(db, "user-123")
    
    assert profile.current_mode == UserModeEnum.PRO
    assert profile.is_pro_subscriber == True
```

### Frontend Tests

```typescript
// Mock hook
jest.mock('../hooks/useFeatureAccess', () => ({
  useFeatureAccess: () => ({
    hasAccess: true,
    currentMode: 'smart'
  })
}));

test('renders component when feature accessible', () => {
  const { getByText } = render(<AISuggestionsComponent />);
  expect(getByText('AI Suggestions')).toBeVisible();
});
```

---

## Migration Strategy

### Phase 1: Backend Setup
- Create models and database tables
- Deploy feature service
- Register default features
- Deploy API endpoints

### Phase 2: Frontend Setup
- Create UserModeContext
- Add feature utilities and hooks
- Update navigation
- Deploy ModeSelectionScreen

### Phase 3: Feature Gating
- Wrap existing components
- Add feature checks to screens
- Update navigation stacks
- Deploy gradual rollout

### Phase 4: Monetization
- Integrate payment gateway
- Configure trial periods
- Set up subscription management
- Enable Pro mode features

---

## Troubleshooting

### User can't access Smart features

1. Check mode: `GET /api/v1/user-mode/{user_id}`
2. Verify feature is registered: Check `feature_definitions` table
3. Check feature permissions in profile
4. Clear cache and retry

### Trial not expiring

1. Check `pro_trial_expires_at` timestamp
2. Verify `check_trial_expiry()` is called on login
3. Check timezone (IST)
4. Manually downgrade if needed: `PUT /api/v1/user-mode/{user_id}/mode`

### Feature not showing in navigation

1. Check if feature is accessible in current mode
2. Verify component path exists
3. Check route registration
4. Check conditional rendering logic

---

## Next Steps

1. **Deploy**: Follow migration strategy phase by phase
2. **Monitor**: Track adoption metrics and conversion rates
3. **Iterate**: Gather user feedback and adjust features
4. **Scale**: Add more features and premium offerings

---

For questions or issues, refer to the implementation files or contact the dev team.
