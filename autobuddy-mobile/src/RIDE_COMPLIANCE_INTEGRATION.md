# Ride Compliance & Rules Display - Integration Guide

## Overview
The Ride Compliance & Rules Display feature provides comprehensive compliance rules, safety guidelines, and real-time compliance alerts for both passengers and drivers in the AutoBuddy platform.

## Components

### 1. Hook: `useRideComplianceRules`
**Location:** `src/hooks/useRideComplianceRules.ts`

Manages compliance rules, safety guidelines, and compliance alerts.

**Key Features:**
- Passenger, driver, and general compliance rules
- Safety guidelines with tips and advice
- Compliance alerts (policy updates, guidelines, violations)
- Alert acknowledgment system
- Rule filtering by category and severity

**Usage Example:**
```typescript
import { useRideComplianceRules } from '../hooks/useRideComplianceRules';

export const MyComponent = () => {
  const {
    complianceRules,
    safetyGuidelines,
    alerts,
    unacknowledgedCount,
    acknowledgeAlert,
  } = useRideComplianceRules(token, 'passenger');

  return (
    <View>
      <Text>Unacknowledged Alerts: {unacknowledgedCount}</Text>
    </View>
  );
};
```

### 2. Hook: `useComplianceNotifications`
**Location:** `src/hooks/useComplianceNotifications.ts`

Manages delivery of compliance notifications with various triggers.

**Key Features:**
- Rule violation alerts
- Guideline reminders
- Policy update notifications
- Document expiry warnings
- Batch notification delivery
- Recurring reminder scheduling

**Usage Example:**
```typescript
import { useComplianceNotifications } from '../hooks/useComplianceNotifications';

export const NotificationManager = () => {
  const {
    triggerRuleViolationAlert,
    triggerGuidelineReminder,
    triggerPolicyUpdate,
    getCriticalNotifications,
  } = useComplianceNotifications(token, userId);

  const handleRuleViolation = () => {
    triggerRuleViolationAlert(
      'Seatbelt Requirement',
      'Passengers must wear seatbelts at all times'
    );
  };

  return (
    <Pressable onPress={handleRuleViolation}>
      <Text>Report Violation</Text>
    </Pressable>
  );
};
```

### 3. Screen: `RideComplianceRulesScreen`
**Location:** `src/screens/RideComplianceRulesScreen.tsx`

Comprehensive UI for displaying rules, safety guidelines, and alerts.

**Features:**
- Three-tab interface (Alerts, Rules, Safety)
- Real-time alert notifications with acknowledgment
- Detailed modal views for rules and guidelines
- Color-coded severity levels (critical, warning, info)
- Refresh functionality
- Empty states with helpful messaging

**Usage Example:**
```typescript
import { RideComplianceRulesScreen } from '../screens/RideComplianceRulesScreen';

export const AppStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="RideCompliance"
        component={RideComplianceRulesScreen}
        initialParams={{ 
          token: authToken, 
          userId: currentUserId,
          userType: 'passenger'
        }}
      />
    </Stack.Navigator>
  );
};
```

## Integration Steps

### Step 1: Add to Navigation
Update your navigation file to include the compliance screen:

```typescript
// In CorporatePortalNavigation.tsx or your main navigation
import { RideComplianceRulesScreen } from '../screens/RideComplianceRulesScreen';

const Stack = createNativeStackNavigator();

export const ComplianceStackNavigator = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="RideComplianceRules"
      component={RideComplianceRulesScreen}
      options={{
        title: 'Compliance & Safety',
        headerShown: false,
      }}
    />
  </Stack.Navigator>
);
```

### Step 2: Add to App Context/Dashboard
Include compliance alerts in your main app dashboard or home screen:

```typescript
import { useComplianceNotifications } from '../hooks/useComplianceNotifications';

export const PassengerDashboard = ({ token, userId }) => {
  const { unacknowledgedCount } = useComplianceNotifications(token, userId);

  return (
    <ScrollView>
      {unacknowledgedCount > 0 && (
        <Pressable 
          onPress={() => navigation.navigate('RideComplianceRules')}
          style={styles.complianceAlert}
        >
          <MaterialIcons name="warning" size={20} color="#FF9800" />
          <Text style={styles.alertText}>
            {unacknowledgedCount} compliance alert{unacknowledgedCount !== 1 ? 's' : ''}
          </Text>
          <MaterialIcons name="arrow_forward" size={20} color="#FF9800" />
        </Pressable>
      )}
      {/* Rest of dashboard */}
    </ScrollView>
  );
};
```

### Step 3: Integrate Compliance Checks in Ride Flow
Add compliance checks at key ride points:

```typescript
import { useComplianceNotifications } from '../hooks/useComplianceNotifications';

export const RideAcceptanceFlow = ({ token, userId, driverId }) => {
  const { triggerGuidelineReminder, triggerRuleViolationAlert } = 
    useComplianceNotifications(token, userId);

  const handleRideAccepted = () => {
    // Show safety guideline reminder
    triggerGuidelineReminder(
      'During Your Ride',
      'Keep doors locked and stay aware of surroundings'
    );
  };

  const handleComplianceViolation = (violationType: string) => {
    triggerRuleViolationAlert(
      violationType,
      'Please review the compliance rules in your app'
    );
  };

  return (
    // Your ride acceptance UI
  );
};
```

### Step 4: Add Notification Badges to Tab Navigation
Show compliance alerts in your tab bar:

```typescript
// In your main navigation/tab bar
import { useComplianceNotifications } from '../hooks/useComplianceNotifications';

const TabNavigator = ({ token, userId }) => {
  const { getCriticalNotifications } = useComplianceNotifications(token, userId);
  const criticalNotifs = getCriticalNotifications();

  return (
    <BottomTabNavigator>
      <BottomTab.Screen
        name="Compliance"
        component={RideComplianceRulesScreen}
        options={{
          tabBarBadge: criticalNotifs.length > 0 ? criticalNotifs.length : null,
          tabBarLabel: 'Compliance',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="security" size={size} color={color} />
          ),
        }}
      />
    </BottomTabNavigator>
  );
};
```

## Data Models

### ComplianceRule
```typescript
interface ComplianceRule {
  id: string;
  title: string;
  description: string;
  category: 'passenger' | 'driver' | 'general';
  severity: 'critical' | 'warning' | 'info';
  icon: string;
  details?: string[];
}
```

### SafetyGuideline
```typescript
interface SafetyGuideline {
  id: string;
  title: string;
  content: string;
  tips: string[];
  icon: string;
  priority: number;
}
```

### ComplianceAlert
```typescript
interface ComplianceAlert {
  id: string;
  type: 'rule_violation' | 'guideline_reminder' | 'policy_update';
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  acknowledged: boolean;
  actionRequired: boolean;
}
```

### ComplianceNotification
```typescript
interface ComplianceNotification {
  id: string;
  type: 'rule_violation' | 'guideline_reminder' | 'policy_update' | 'expiry_warning';
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  delivered: boolean;
  deliveredAt?: string;
  expiresAt?: string;
}
```

## Compliance Rules Overview

### Passenger Rules
1. **Seat Belt Requirement** - Critical
   - Fasten seat belt before vehicle moves
   - Keep seat belt fastened throughout journey
   - Children must use appropriate child seats

2. **Behavior & Conduct** - Warning
   - Be respectful to driver and other passengers
   - No smoking, vaping, or drinking alcohol
   - Keep noise levels reasonable

3. **Door Safety** - Critical
   - Wait for driver to unlock doors
   - Exit only when vehicle is fully stopped
   - Close doors gently and completely

4. **Item Security** - Info
   - Keep valuables with you at all times
   - Do not leave items in the vehicle

5. **Emergency Procedures** - Critical
   - Follow driver instructions in emergencies
   - Exit vehicle only when safe
   - Call emergency services if needed

### Driver Rules
1. **Vehicle Maintenance** - Critical
2. **Driving Standards** - Critical
3. **Professional Conduct** - Warning
4. **Documentation & Compliance** - Critical
5. **Route & Navigation** - Info

### General Rules
1. **Payment Compliance** - Critical
2. **Rating & Feedback** - Info

## Safety Guidelines
1. **Before You Ride** - Prepare for safe experience
2. **During Your Ride** - Stay alert and follow practices
3. **Emergency Situations** - Know how to respond
4. **Personal Security** - Protect information and belongings

## Testing

### Manual Testing Checklist
- [ ] Verify all compliance rules display correctly
- [ ] Test alert acknowledgment functionality
- [ ] Verify tab switching works smoothly
- [ ] Test rule/guideline detail modals
- [ ] Verify refresh functionality
- [ ] Test on different device sizes
- [ ] Check empty states display correctly
- [ ] Verify badge counts are accurate
- [ ] Test notification triggers
- [ ] Verify color coding by severity

### Automated Testing
```typescript
describe('RideComplianceRulesScreen', () => {
  it('should display all compliance rules', () => {
    // Test rule loading
  });

  it('should acknowledge alerts', () => {
    // Test alert acknowledgment
  });

  it('should switch tabs correctly', () => {
    // Test tab navigation
  });
});
```

## API Integration

For production, integrate with your backend API:

```typescript
// Example backend endpoints to add
POST   /api/compliance/alerts          - Get user's compliance alerts
POST   /api/compliance/alerts/{id}/ack - Acknowledge an alert
GET    /api/compliance/rules           - Get compliance rules
GET    /api/compliance/guidelines      - Get safety guidelines
POST   /api/compliance/violations      - Report a violation
GET    /api/compliance/score           - Get compliance score
```

## Customization

### Updating Compliance Rules
Edit the rule arrays in `useRideComplianceRules.ts`:

```typescript
const PASSENGER_RULES: ComplianceRule[] = [
  {
    id: 'p1',
    title: 'Your Custom Rule',
    description: 'Description here',
    category: 'passenger',
    severity: 'critical',
    icon: 'icon_name',
    details: ['Detail 1', 'Detail 2'],
  },
  // Add more rules
];
```

### Customizing Colors and Styling
Edit the `styles` object in `RideComplianceRulesScreen.tsx`:

```typescript
const styles = StyleSheet.create({
  // Customize colors
  alertCard: {
    backgroundColor: '#YOUR_COLOR',
    borderLeftColor: '#YOUR_COLOR',
  },
  // Update other styles as needed
});
```

## Future Enhancements

1. **Backend Integration** - Fetch rules from API
2. **Localization** - Support multiple languages
3. **Document Verification** - Verify document expiry dates
4. **Analytics** - Track compliance metrics
5. **Push Notifications** - Send system notifications
6. **A/B Testing** - Test different rule presentations
7. **Machine Learning** - Predict compliance issues
8. **Accessibility** - Screen reader support

## Support & Troubleshooting

### Common Issues

**Issue:** Alerts not showing
- **Solution:** Verify `useComplianceNotifications` is initialized with valid token and userId

**Issue:** Rules displaying incorrectly
- **Solution:** Check `userType` prop is set correctly ('passenger' or 'driver')

**Issue:** Performance issues with many rules
- **Solution:** Implement pagination or lazy loading for rules list

## File Structure
```
src/
├── hooks/
│   ├── useRideComplianceRules.ts      (New)
│   └── useComplianceNotifications.ts  (New)
├── screens/
│   └── RideComplianceRulesScreen.tsx  (New)
└── navigation/
    └── [Update to include new screen]
```

---

**Feature Status:** ✅ Complete
**Last Updated:** 2026-06-21
**Version:** 1.0
