# AutoBuddy UX Developer Quick Reference

## 🚀 Quick Start

### New Context Usage
```typescript
// OLD - Don't use anymore
import { NotificationProvider } from '@/contexts/NotificationContext';
import { RatingsProvider } from '@/contexts/RatingsContext';
// ... 7 more imports and nesting

// NEW - Single import!
import { AppStateProvider } from '@/contexts/AppStateProvider';

// In component:
<AppStateProvider>
  <YourApp />
</AppStateProvider>
```

### Session Usage
```typescript
// OLD - Don't use anymore
import { loadSession, saveSession } from '@/lib/session';
import { 
  loadSession as loadPersistentSession,
  saveSession as savePersistentSession,
  // ... more duplicate functions
} from '@/lib/persistentSessionManager';

// NEW - Single source
import { 
  loadSession, 
  saveSession, 
  clearSession, 
  subscribeSession,
  extendSessionExpiry,
  isSessionValid 
} from '@/lib/persistentSessionManager';
```

---

## 📋 Common Tasks

### Load User Session
```typescript
import { loadSession } from '@/lib/persistentSessionManager';

async function getUser() {
  const session = await loadSession();
  if (!session?.token) {
    // User not logged in
    return null;
  }
  return session.user;
}
```

### Save After Auth
```typescript
import { saveSession, extendSessionExpiry } from '@/lib/persistentSessionManager';

async function handleLogin(sessionData) {
  await saveSession(sessionData);
  await extendSessionExpiry(); // Slide the 30-day window
}
```

### Monitor Session Changes
```typescript
import { subscribeSession } from '@/lib/persistentSessionManager';

useEffect(() => {
  const unsubscribe = subscribeSession((session) => {
    if (session?.token) {
      setUser(session.user);
    } else {
      setUser(null);
    }
  });
  
  return () => unsubscribe();
}, []);
```

### Logout
```typescript
import { clearSession } from '@/lib/persistentSessionManager';

async function handleLogout() {
  await clearSession(); // Clears everything
  // Also disconnect sockets, etc
}
```

---

## 🎯 Loading States - Best Practices

### Good Progress Messages
```typescript
// DON'T
"Loading..."
"Please wait..."
"Processing..."

// DO
"Preparing secure ride experience..."
"Finalizing your setup..."
"Verifying subscription plan..."
"Connecting to nearby drivers..."
```

### Pattern for Long Operations
```typescript
const [status, setStatus] = useState('idle'); // idle | loading | error | success

if (status === 'loading') {
  return (
    <View>
      <ActivityIndicator />
      <Text>Connecting to servers...</Text>
    </View>
  );
}

if (status === 'error') {
  return (
    <View>
      <Text>Connection failed. Check internet.</Text>
      <Button onPress={retry}>Try Again</Button>
    </View>
  );
}
```

---

## 🔧 Context Architecture

### Current Provider Tree
```
RootView
└── ThemeProvider
    └── AppStateProvider (✨ New - Single entry point)
        ├── NotificationProvider
        ├── RatingsProvider
        ├── SavedPlacesProvider
        ├── PreferencesProvider
        ├── ScheduledRidesProvider
        ├── PaymentMethodsProvider
        ├── FavoritesProvider
        ├── PromoCodesProvider
        ├── SupportProvider
        └── AccessibilityProvider
```

### Adding a New Context
1. Create context in `src/contexts/YourContext.tsx`
2. Add provider to `src/contexts/AppStateProvider.tsx`
3. Use it throughout app - no deep nesting!

---

## ✅ Validation Checklist

### Before Committing Session Changes
- [ ] Can login successfully
- [ ] Session persists on app restart
- [ ] Logout clears session
- [ ] Token refresh works
- [ ] No old session.js imports
- [ ] All tests pass

### Before Committing Context Changes
- [ ] All 9 contexts still available
- [ ] No console errors
- [ ] Features work (notifications, ratings, etc)
- [ ] No performance issues
- [ ] Tests pass

### Before Deploying to Production
- [ ] Staging tested for 2 hours
- [ ] Error rate same or lower
- [ ] Session handling works for 30 days
- [ ] Mobile and web both work
- [ ] Rollback plan ready

---

## 🐛 Debugging Tips

### Session Not Loading?
```typescript
// Check what's in storage
import { loadSession } from '@/lib/persistentSessionManager';
const session = await loadSession();
console.log('Session:', session);

// Check expiry
import AsyncStorage from '@react-native-async-storage/async-storage';
const expiry = await AsyncStorage.getItem('autobuddy_session_expiry_v1');
console.log('Expiry:', new Date(parseInt(expiry)));
```

### Context Values Not Updating?
```typescript
// Make sure you're in AppStateProvider
import { useContext } from 'react';
import { SomeContext } from '@/contexts/SomeContext';

export function MyComponent() {
  const value = useContext(SomeContext);
  // If undefined, component is outside AppStateProvider
}
```

### Loading State Stuck?
```typescript
// Check if state updates are working
const [loading, setLoading] = useState(false);

useEffect(() => {
  async function load() {
    setLoading(true); // Should see UI change
    try {
      const data = await fetchData();
      setData(data);
    } finally {
      setLoading(false); // Should see loading stop
    }
  }
  load();
}, []);
```

---

## 📚 Related Files

| File | Purpose | Last Updated |
|------|---------|--------------|
| `src/contexts/AppStateProvider.tsx` | Main context wrapper | Jun 19, 2026 |
| `src/lib/persistentSessionManager.js` | Session management | Jun 19, 2026 |
| `src/app/_layout.tsx` | Root layout | Jun 19, 2026 |
| `src/app/index.tsx` | Home screen | Jun 19, 2026 |
| `UX_IMPLEMENTATION_GUIDE.md` | Full guide | Jun 19, 2026 |
| `GETTING_STARTED_GUIDE.md` | User guide | Jun 19, 2026 |

---

## 🆘 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "session is undefined" | Outside AppStateProvider | Wrap in AppStateProvider |
| Session clears on close | Old session.js logic | Use persistentSessionManager |
| Two home buttons | Not removed yet | Use single button in shell |
| Deep context nesting errors | Still using old imports | Use AppStateProvider |
| Loading state stuck | No finally block | Add try/catch/finally |

---

## 🎓 Learning Resources

1. **Session Management**: See `persistentSessionManager.js` - Well commented
2. **Context Best Practices**: Check `AppStateProvider.tsx` - Simple pattern
3. **Loading States**: Review `index.tsx` - Good examples
4. **UX Guidelines**: Read `UX_FLOW_AUDIT_AND_IMPROVEMENTS.md`

---

## 🔗 External Links

- [React Context Docs](https://react.dev/reference/react/useContext)
- [React Native AsyncStorage](https://react-native-async-storage.github.io/async-storage/)
- [Expo Router](https://expo.dev/router)

---

**Last Updated**: June 19, 2026  
**Next Review**: July 3, 2026

