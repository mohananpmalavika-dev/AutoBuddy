# 📱 Cross-Platform Build & Testing Plan

**Date:** May 27, 2026  
**Status:** ⏳ READY FOR EXECUTION  
**Scope:** Web, Android, iOS Build & Validation

---

## 🏗️ Build Strategy

### Web Platform ✅ COMPLETE
```bash
Status: ✅ Build successful
Command: npm run export:web
Output: dist/ (ready for deployment)
Size: 5.36 MB
Time: 4.8 seconds
Errors: 0
```

**Deployment Ready:** Yes  
**URL:** http://localhost:8081 (dev) or deploy to production

---

## 📱 Native Android Build

### Prerequisites
- [ ] EAS Account (setup at https://expo.dev)
- [ ] Google Play Console account (for distribution)
- [ ] app.json configured with android block
- [ ] eas.json configured

### EAS Build Command
```bash
# First-time setup (if needed)
eas build --platform android --profile preview

# Recommended: Development build
eas build --platform android --profile development

# For production release
eas build --platform android --profile production
```

### Build Profiles (from eas.json)
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "aab"
      }
    }
  }
}
```

### Expected Build Time
- **APK (Preview/Development):** 10-15 minutes
- **AAB (Production):** 12-18 minutes

### Build Output
- **APK:** Installable directly on Android devices
- **AAB:** Upload to Google Play Store

### Testing on Android
```bash
# 1. Get build download link from EAS
# 2. Download APK
# 3. Install on device/emulator
adb install app-release.apk

# 4. Run app
# 5. Test all features from QA matrix
# 6. Check console logs
adb logcat | grep "ReactNativeJS\|error"
```

### Android Device Requirements
- **Minimum SDK:** 21 (Android 5.0)
- **Target SDK:** 34 (Android 14)
- **RAM:** 2GB minimum
- **Screen Size:** 4.5" - 6.5" optimal

### Android Test Scenarios
- [ ] App installs without errors
- [ ] Splash screen displays
- [ ] Login screen renders
- [ ] Tab navigation works (4 tabs)
- [ ] RideCard renders with data
- [ ] Map loads correctly
- [ ] EarningsPanel displays metrics
- [ ] ProfileDrawer opens smoothly
- [ ] Error messages display correctly
- [ ] Network error handling works
- [ ] Back button behavior correct
- [ ] Keyboard hides after input
- [ ] Orientation change handled
- [ ] Memory usage acceptable
- [ ] No ANR (Application Not Responding)

---

## 🍎 Native iOS Build

### Prerequisites
- [ ] Apple Developer Account (paid membership)
- [ ] Xcode 14+ installed
- [ ] iOS provisioning profiles set up
- [ ] EAS Account with Apple integration

### EAS Build Command
```bash
# Setup Apple account (first time)
eas credentials

# Development build
eas build --platform ios --profile development

# Production (TestFlight/App Store)
eas build --platform ios --profile production
```

### Build Profiles (from eas.json)
```json
{
  "build": {
    "development": {
      "ios": {
        "buildType": "development"
      }
    },
    "production": {
      "ios": {
        "buildType": "app-store"
      }
    }
  }
}
```

### Expected Build Time
- **Development Build:** 15-20 minutes
- **App Store Build:** 15-25 minutes

### Build Output
- **Development:** .ipa file for TestFlight or Ad Hoc distribution
- **Production:** Signed for App Store submission

### Testing on iOS
```bash
# 1. Get build download link from EAS
# 2. Download .ipa file
# 3. Install via TestFlight or Xcode

# Option A: TestFlight
# - Share link with testers
# - Testers install via TestFlight app

# Option B: Xcode
open -a Xcode app.ipa

# 4. Run app and test
# 5. Check console in Xcode device logs
```

### iOS Device Requirements
- **Minimum iOS:** 12.0
- **Target iOS:** 17.0+
- **Device Models:** iPhone XS or newer (for notch support)
- **RAM:** 2GB minimum

### iOS Test Scenarios
- [ ] App installs without errors
- [ ] Splash screen displays
- [ ] Safe area respected (notch/home indicator)
- [ ] Login screen renders
- [ ] Tab navigation works (4 tabs)
- [ ] RideCard renders with data
- [ ] Map loads correctly
- [ ] EarningsPanel displays metrics
- [ ] ProfileDrawer slides in smoothly
- [ ] Error messages display correctly
- [ ] Network error handling works
- [ ] Status bar visibility correct
- [ ] Keyboard handling correct
- [ ] Orientation change handled
- [ ] Memory usage acceptable
- [ ] Performance smooth

---

## 🧪 Cross-Platform Testing Matrix

### Test Environment Setup

| Platform | Environment | Status |
|----------|-------------|--------|
| **Web** | localhost:8081 | ✅ Ready |
| **Web** | Production URL | ⏳ Pending |
| **Android** | Device/Emulator | ⏳ Pending Build |
| **Android** | Google Play Staging | ⏳ Pending |
| **iOS** | Device | ⏳ Pending Build |
| **iOS** | TestFlight | ⏳ Pending Build |

### Core Features Testing

#### Tab Navigation (All Platforms)
```
Test: Click each tab sequentially
┌─────────────────────────┐
│ [Requests] [Earnings]   │
│ [Actions] [Settings]    │
└─────────────────────────┘

Expected per platform:
- Web: Tabs in horizontal row at top/side
- Android: Tabs in horizontal scroll
- iOS: Tabs with indicator animation
```

#### RideCard Rendering (All Platforms)
```
Test: Display active ride card
┌─────────────────────────┐
│ Passenger Name          │
│ Status: Accepted        │
│ ⭐ 4.8 rating          │
│ 📍 Location info        │
│ [Expand Button]         │
└─────────────────────────┘

Expected: Consistent layout across platforms
```

#### EarningsPanel Display (All Platforms)
```
Test: Show earnings metrics
┌─────────────────────────┐
│ Today: ₹2,450           │
│ Weekly: ₹14,200         │
│ Monthly: ₹55,000        │
│ Hourly: ₹308.75         │
│ [Full Report] [Withdraw]│
└─────────────────────────┘

Expected: Calculations accurate, formatting consistent
```

#### Error Handling (All Platforms)
```
Test: Simulate network error
┌─────────────────────────┐
│ ⚠️ Network Error       │
│ Failed to load data     │
│ [Retry] [Support]       │
│ Retrying in 5s...       │
└─────────────────────────┘

Expected: Error shown, retry works
```

### Performance Metrics (Targets)

| Metric | Web | Android | iOS |
|--------|-----|---------|-----|
| **App Load** | < 3s | < 3s | < 3s |
| **Tab Switch** | < 200ms | < 300ms | < 300ms |
| **Component Render** | < 300ms | < 400ms | < 400ms |
| **Map Load** | < 2s | < 2s | < 2s |
| **Memory** | < 100MB | < 150MB | < 150MB |
| **Bundle Size** | 2.62MB | ~45MB | ~50MB |

---

## 📋 Build Verification Checklist

### Pre-Build
- [ ] All code committed to git
- [ ] Latest dependencies installed (`npm install`)
- [ ] Environment variables configured (.env)
- [ ] App version bumped (if needed)
- [ ] Assets optimized

### Build Process
- [ ] Web export completes without errors
- [ ] Android build completes without errors
- [ ] iOS build completes without errors
- [ ] All builds have zero compilation warnings

### Post-Build
- [ ] Web bundle loads in browser
- [ ] Android APK installs on device
- [ ] iOS .ipa installs on device
- [ ] No runtime errors in console
- [ ] All features accessible

### Quality Checks
- [ ] Bundle sizes within acceptable range
- [ ] No console errors or warnings
- [ ] Networking requests working
- [ ] Animations smooth (60fps target)
- [ ] No memory leaks detected

---

## 🚀 Build Execution Timeline

### Immediate (Today)
```
✅ 1. Web export: 4.8s - COMPLETE
⏳ 2. Start web server: Ready
⏳ 3. Browser testing: Pending manual
```

### Short-term (This Week)
```
⏳ 1. Android build via EAS: 10-15 min
⏳ 2. iOS build via EAS: 15-20 min
⏳ 3. Device testing: 30-60 min per platform
⏳ 4. QA sign-off: Pending results
```

### Integration (Next Week)
```
⏳ 1. Backend integration testing
⏳ 2. Real-time data validation
⏳ 3. Error scenario testing
⏳ 4. Performance profiling
```

### Production (Week After)
```
⏳ 1. Final security audit
⏳ 2. Production deployment prep
⏳ 3. User notification
⏳ 4. Launch and monitoring
```

---

## 📊 Build & Test Report Template

### Build Report
```
Platform: [Web/Android/iOS]
Date: [Date]
Build Command: [Command used]
Build Time: [Time taken]
Build Size: [Output size]
Errors: [Number of errors]
Warnings: [Number of warnings]
Status: [PASS/FAIL]
```

### Test Report
```
Feature: [Feature name]
Platform: [Platform tested]
Test Case: [Test ID]
Result: [PASS/FAIL/BLOCKED]
Time: [Timestamp]
Tester: [Name]
Notes: [Observations]
```

---

## 🔐 Security Pre-Deployment

- [ ] Code review completed
- [ ] Secrets not hardcoded in source
- [ ] API credentials in environment variables only
- [ ] HTTPS enforced (web)
- [ ] Deep links validated
- [ ] Permissions requested appropriately
- [ ] Data privacy compliance checked

---

## 📞 Support & Rollback

### Known Issues
- Shadow style props deprecation warning (non-breaking)
- Backend API connection required for full functionality

### Rollback Plan
```
If issues found:
1. Revert to previous stable build
2. Hotfix in development
3. Rebuild and test
4. Deploy new version
```

### Support Contacts
- **Build Issues:** Check EAS build logs
- **Runtime Issues:** Check console/logcat/device logs
- **Backend Issues:** Contact API team
- **Deployment Issues:** Contact DevOps team

---

**Document Status:** Ready for Build Execution  
**Last Updated:** May 27, 2026 2:00 PM  
**Next Review:** After builds complete
