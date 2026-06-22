---
title: 3-Mode System - Quick Reference
description: Fast reference for developers implementing the 3-mode system
---

# 3-Mode System - Quick Reference

## One-Minute Overview

```
SimpleMode    → Free basic features (Book, Schedule, Track)
SmartMode     → ₹199/month AI features (Suggestions, Family, Voice)
ProMode       → Custom pricing enterprise features (Fleet, Analytics)
```

---

## Files Created

### Backend Files

```
backend/
├── app/
│   ├── models/
│   │   └── user_mode.py                    # Models
│   ├── services/
│   │   └── feature_service.py              # Business logic
│   └── routers/
│       └── user_mode.py                    # API endpoints
```

### Frontend Files

```
autobuddy-mobile/src/
├── contexts/
│   └── UserModeContext.tsx                 # Global state
├── utils/
│   └── featureAccess.ts                    # Feature registry & utilities
├── hooks/
│   └── useFeatureAccess.ts                 # Custom hooks
└── screens/
    └── ModeSelectionScreen.tsx             # Mode selection UI
```

### Documentation

```
3-MODE-SYSTEM-DOCUMENTATION.md              # Full guide
3-MODE-SYSTEM-QUICKREF.md                   # This file
```

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/user-mode/{user_id}` | Get mode profile & features |
| PUT | `/api/v1/user-mode/{user_id}/mode` | Switch mode |
| POST | `/api/v1/user-mode/{user_id}/trial` | Start 7-day trial |
| POST | `/api/v1/user-mode/{user_id}/upgrade` | Upgrade to Pro |
| PUT | `/api/v1/user-mode/{user_id}/feature/{name}` | Toggle feature |
| GET | `/api/v1/modes/summary` | Get all modes |
| POST | `/api/v1/modes/bootstrap-features` | Initialize features |

---

## Feature Registry

### Simple Mode Features (Free)

- `book_ride` - Book ride immediately
- `schedule_ride` - Schedule for future
- `track_ride` - Real-time tracking

### Smart Mode Features (₹199/month)

- `ai_suggestions` - AI recommendations
- `family_assistant` - Family management
- `voice_booking` - Voice commands

### Pro Mode Features (Custom)

- `fleet_management` - Fleet operations
- `analytics_dashboard` - Advanced analytics
- `corporate_billing` - Corporate accounts

---

## Backend: Check Feature Access

### Simple Check

```python
from app.services.feature_service import FeatureService

accessible = FeatureService.is_feature_accessible(
    db, user_id, "ai_suggestions"
)
if not accessible:
    raise HTTPException(403, "Upgrade to Smart Mode")
```

### Get All Features

```python
features = FeatureService.get_accessible_features(db, user_id)
# Returns: [Feature1, Feature2, ...]
```

### Register New Feature

```python
FeatureService.register_feature(
    db=db,
    name="my_new_feature",
    access_mode=FeatureAccessMode.SMART,
    description="Does something cool",
    component_path="screens/MyScreen",
    router_name="MyFeature"
)
```

### Start Trial / Upgrade

```python
# Trial (7 days)
FeatureService.start_pro_trial(db, user_id, trial_days=7)

# Paid subscription (30 days)
FeatureService.upgrade_to_pro(db, user_id, subscription_days=30)
```

---

## Frontend: Hook Usage

### Check If Feature Accessible

```typescript
import { useFeatureAccess } from '../hooks/useFeatureAccess';

function MyComponent() {
  const { hasAccess } = useFeatureAccess('ai_suggestions');
  
  if (!hasAccess) return <Text>Upgrade to Smart Mode</Text>;
  return <AISuggestionsFeature />;
}
```

### Get Accessible Features

```typescript
import { useAccessibleFeatures } from '../hooks/useFeatureAccess';

function FeatureList() {
  const { features, count, currentMode } = useAccessibleFeatures();
  
  return (
    <View>
      <Text>Your mode: {currentMode}</Text>
      <Text>Features: {count}</Text>
      {features.map(f => <Text key={f.id}>{f.name}</Text>)}
    </View>
  );
}
```

### Upgrade User

```typescript
import { useModeUpgrade } from '../hooks/useFeatureAccess';

function UpgradeButton() {
  const { upgradeToSmart, upgradeToProWithTrial, loading } = useModeUpgrade();
  
  const handleUpgrade = async () => {
    const result = await upgradeToProWithTrial(7);
    if (result.success) Alert.alert('Success', 'Trial started!');
  };
  
  return (
    <TouchableOpacity onPress={handleUpgrade} disabled={loading}>
      <Text>Start Pro Trial</Text>
    </TouchableOpacity>
  );
}
```

### Get Current Mode Info

```typescript
import { useModeMetadata } from '../hooks/useFeatureAccess';

function ModeInfo() {
  const { mode, isProTrial, trialRemainingDays } = useModeMetadata();
  
  return (
    <View>
      <Text>Mode: {mode}</Text>
      {isProTrial && <Text>Trial expires in {trialRemainingDays} days</Text>}
    </View>
  );
}
```

---

## Frontend: Conditional Rendering

### Using Context Directly

```typescript
import { useUserMode } from '../contexts/UserModeContext';

function MyScreen() {
  const { currentMode, isFeatureAccessible } = useUserMode();
  
  return (
    <View>
      {currentMode === 'simple' && <BasicFeatures />}
      {isFeatureAccessible('ai_suggestions') && <AIFeatures />}
      {currentMode === 'pro' && <FleetManagement />}
    </View>
  );
}
```

### Conditional Navigation

```typescript
import { getModeNavigation } from '../utils/featureAccess';

function BottomTabs() {
  const { currentMode } = useUserMode();
  const routes = getModeNavigation(currentMode);
  
  return (
    <Tab.Navigator>
      {routes.map(route => (
        <Tab.Screen
          key={route.name}
          name={route.name}
          component={screenMap[route.name]}
        />
      ))}
    </Tab.Navigator>
  );
}
```

### Feature Comparison

```typescript
import { getModeSummary } from '../utils/featureAccess';

function ModesComparison() {
  const modes = ['simple', 'smart', 'pro'];
  
  return (
    <View>
      {modes.map(mode => {
        const summary = getModeSummary(mode);
        return (
          <View key={mode}>
            <Text>{summary.name}</Text>
            <Text>{summary.price}</Text>
            {summary.features.map(f => <Text key={f}>• {f}</Text>)}
          </View>
        );
      })}
    </View>
  );
}
```

---

## Setup Steps

### 1. Backend Setup (5 minutes)

```bash
# Files are already created, just ensure they're integrated

# In your main app file (server.py or main.py), add:
from app.routers.user_mode import router as user_mode_router
app.include_router(user_mode_router)

# Bootstrap features on startup:
from app.services.feature_service import bootstrap_features
bootstrap_features(db)
```

### 2. Database Migration

```bash
# Run migration to create tables
# Files: user_mode_profiles, feature_definitions tables
# See 3-MODE-SYSTEM-DOCUMENTATION.md for SQL
```

### 3. Frontend Setup (5 minutes)

```typescript
// In App.tsx or App.jsx
import { UserModeProvider } from './contexts/UserModeContext';

export default function App() {
  const userId = getCurrentUserId(); // Your auth logic
  
  return (
    <UserModeProvider userId={userId}>
      <RootNavigator />
    </UserModeProvider>
  );
}
```

### 4. Add Mode Selection Screen

```typescript
// In Settings or Onboarding
import { ModeSelectionScreen } from './screens/ModeSelectionScreen';

function SettingsScreen() {
  return (
    <ScrollView>
      <ModeSelectionScreen />
    </ScrollView>
  );
}
```

### 5. Wrap Features

```typescript
// Example: AI Suggestions Screen
import { useFeatureAccess } from '../hooks/useFeatureAccess';

function AISuggestionsScreen() {
  const { hasAccess } = useFeatureAccess('ai_suggestions');
  
  if (!hasAccess) {
    return <UpgradePrompt feature="ai_suggestions" mode="smart" />;
  }
  
  return <AISuggestionsContent />;
}
```

---

## Common Tasks

### Allow Only Pro Users to Access Fleet Management

**Backend:**
```python
@app.get("/api/v1/fleet")
def get_fleet(user_id: str, db: Session = Depends(get_db)):
    if not FeatureService.is_feature_accessible(db, user_id, "fleet_management"):
        raise HTTPException(403, "Pro mode required")
    return get_fleet_data(user_id)
```

**Frontend:**
```typescript
function FleetScreen() {
  const { hasAccess } = useFeatureAccess('fleet_management');
  
  if (!hasAccess) return <ProUpgradePrompt />;
  
  return <FleetManagement />;
}
```

### Show Different UI Based on Mode

```typescript
function RideCard() {
  const { currentMode } = useUserMode();
  
  return (
    <View>
      <BasicRideInfo />
      
      {(currentMode === 'smart' || currentMode === 'pro') && (
        <AIInsightsSection />
      )}
      
      {currentMode === 'pro' && (
        <CorporateOptions />
      )}
    </View>
  );
}
```

### Hide Pro Features from Smart Users

```typescript
function SettingsScreen() {
  const { currentMode } = useUserMode();
  
  return (
    <ScrollView>
      <SettingsGroup title="Basic">
        <SettingItem name="Language" />
        <SettingItem name="Notifications" />
      </SettingsGroup>
      
      {currentMode === 'pro' && (
        <SettingsGroup title="Enterprise">
          <SettingItem name="Fleet" />
          <SettingItem name="Corporate Billing" />
        </SettingsGroup>
      )}
    </ScrollView>
  );
}
```

### Track Trial Expiry

```typescript
function ProfileScreen() {
  const { isProTrial, trialRemainingDays, isProSubscriber } = useModeMetadata();
  
  if (isProTrial && trialRemainingDays <= 3) {
    return (
      <Banner>
        <Text>Trial expires in {trialRemainingDays} days. Upgrade now!</Text>
      </Banner>
    );
  }
  
  if (isProSubscriber) {
    return <Text>Pro subscriber - all features unlocked</Text>;
  }
}
```

---

## Environment Variables

Add to `.env`:

```bash
# Feature System
FEATURE_BOOTSTRAP_ON_START=true
PRO_TRIAL_DAYS=7
PRO_SUBSCRIPTION_DAYS=30

# Monetization
STRIPE_API_KEY=sk_test_...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

---

## Testing Checklist

- [ ] User starts in Simple mode
- [ ] Simple features visible to all modes
- [ ] Smart features hidden from Simple users
- [ ] Pro features only visible to Pro users
- [ ] Trial modal shows when accessing Pro
- [ ] Mode switches correctly
- [ ] Trial counts down
- [ ] Subscription persists after payment
- [ ] Features toggle correctly
- [ ] Navigation updates based on mode

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Features not loading | Call bootstrap endpoint: `POST /api/v1/modes/bootstrap-features` |
| Mode not persisting | Check database connection, verify user_id is correct |
| Features always hidden | Check feature name matches registry exactly |
| Trial not counting down | Check system timezone (using IST) |
| Context undefined error | Wrap app with `<UserModeProvider>` |
| Can't access Pro features after upgrade | Verify `is_pro_subscriber=true` in DB |

---

## Performance Tips

- Cache feature list in Redux/Context (done with `useAccessibleFeatures`)
- Use `React.memo` for feature-gated components
- Lazy load Pro/Smart mode screens
- Batch feature checks in single API call (done with `get_mode_summary`)

---

## Future Enhancements

1. **A/B Testing**: Test different feature bundles
2. **Freemium to Premium**: Track conversion metrics
3. **Feature Analytics**: Log which features drive engagement
4. **Tiered Pricing**: Add more modes (Starter, Plus, Enterprise)
5. **Team Accounts**: Pro mode supports multiple team members
6. **API Keys**: Generate for corporate integrations

---

## Contact & Support

- Documentation: `3-MODE-SYSTEM-DOCUMENTATION.md`
- Issues: File a GitHub issue with label `feature-system`
- Questions: Ask in #autobuddy-dev Slack channel
