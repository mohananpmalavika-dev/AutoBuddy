# AutoBuddy Production Setup Guide

## Phase 1: Beta Testing (Now → June 1st, 2026)

### Objective
Deploy AutoBuddy to production at `auto-buddy.in` for user testing before Play Store launch.

---

## Step 1: Update Configuration Files

### 1.1 Update `vercel.json`
```json
{
  "buildCommand": "node ./node_modules/expo/bin/cli export --platform web",
  "outputDirectory": "dist",
  "routes": [
    { "src": "^/$", "dest": "/index.html" },
    { "src": "^/app(/.*)$", "dest": "/dist/index.html" },
    { "src": "/(.*)", "dest": "/dist/$1" }
  ],
  "env": {
    "EXPO_PUBLIC_API_BASE_URL": "https://api.auto-buddy.in/api"
  }
}
```

### 1.2 Update `app.json` with deep linking
Replace your `app.json` with the updated version (includes iOS bundleIdentifier and Android package name + intent filters).

**Key additions:**
- iOS: `bundleIdentifier` and `associatedDomains` for Universal Links
- Android: `package` and `intentFilters` for App Links

### 1.3 Create Android App Links certificate file
Get your SHA256 signing certificate fingerprint and update `.well-known/assetlinks.json`:

```bash
# Get your certificate SHA256 (replace path to your keystore)
keytool -list -v -keystore your-keystore.jks
```

---

## Step 2: Deploy to Vercel

### 2.1 Connect Domain
1. Go to Vercel dashboard
2. Add domain: `auto-buddy.in`
3. Configure DNS records:
   - CNAME: `cname.vercel-dns.com`
   - Or follow Vercel's DNS setup

### 2.2 Deploy
```bash
cd autobuddy-mobile
vercel --prod
```

This will:
- Build the web version
- Deploy to `auto-buddy.in`
- Show landing page at root (`/`)
- Serve web app at `/app`

---

## Step 3: Testing Before June 1st

### 3.1 Landing Page Test
- Desktop: https://auto-buddy.in → Shows landing page
- Android: https://auto-buddy.in → Shows "Get Android APK" button
- iOS: https://auto-buddy.in → Shows (waiting for iOS build)

### 3.2 Web App Testing
- https://auto-buddy.in/app → Web version of app

### 3.3 Share APK with Users
- Generate APK: `eas build --platform android --profile preview`
- Host on auto-buddy.in or provide download link
- Users can scan QR code or click download button

---

## Phase 2: Play Store Launch (June 1st, 2026 onwards)

### Objective
When Play Store apps go live, auto-buddy.in automatically redirects mobile users to app stores.

### Automatic Redirect Logic
The landing page script automatically:
1. **Before June 1st:** Shows download options, beta message
2. **After June 1st:** 
   - Android users → Auto-redirect to Play Store
   - iOS users → Auto-redirect to App Store
   - Web users → Show Try Web Version button

### No code changes needed!
The JavaScript in `public/index.html` handles the date check:
```javascript
const PLAY_STORE_LAUNCH_DATE = new Date('2026-06-01');
const IS_AFTER_LAUNCH = NOW >= PLAY_STORE_LAUNCH_DATE;
```

---

## Step 4: Deploy Backend API

### 4.1 Backend Deployment
Deploy FastAPI backend to `api.auto-buddy.in`:
```bash
# Option 1: Fly.io (configured in fly.toml)
fly deploy

# Option 2: Vercel Serverless Functions
# Option 3: Azure App Service
# Option 4: Railway, Render, etc.
```

### 4.2 Environment Variables
Set on production:
```
EXPO_PUBLIC_API_BASE_URL=https://api.auto-buddy.in/api
MONGO_URL=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority
# DATABASE_URL is also accepted as a fallback alias for MONGO_URL
JWT_SECRET=<strong-random-secret-min-32-chars>
JWT_REFRESH_SECRET=<second-strong-random-secret-min-32-chars>
FERNET_SECRET=<run: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
ENVIRONMENT=production
ALLOWED_ORIGINS=https://auto-buddy.in,https://www.auto-buddy.in
# Optional but recommended:
REDIS_URL=redis://<host>:<port>/0
# Optional strict mode:
# REQUIRE_REDIS_IN_PRODUCTION=true
```

---

## Step 5: iOS Build & Submission (After June 1st)

### 5.1 Create iOS App
```bash
eas build --platform ios --profile production
```

### 5.2 Submit to App Store
- Upload to App Store Connect
- Configure App Links (Domains & Email Domains)
- Add `apple-app-site-association` file:
  ```json
  {
    "applinks": {
      "apps": [],
      "details": [
        {
          "appID": "YOUR_TEAM_ID.com.autobuddy.mobile",
          "paths": ["/", "/app"]
        }
      ]
    }
  }
  ```

---

## Step 6: Android Build & Submission (Before June 1st)

### 6.1 Create Release Build
```bash
eas build --platform android --profile production
```

### 6.2 Submit to Play Store
- Upload AAB to Google Play Console
- Create release notes
- Set launch date to June 1st

### 6.3 Verify App Links
- Google Play Console → Setup → App Signing
- Get SHA256 certificate
- Update `.well-known/assetlinks.json` with correct SHA256

---

## Troubleshooting

### Landing page not loading
- Check Vercel deployment logs
- Verify `public/index.html` exists
- Check routing in `vercel.json`

### Deep links not working
- Verify certificate SHA256 in `assetlinks.json`
- Wait 24-48 hours for link verification
- Test with: `adb shell am start -W -a android.intent.action.VIEW -d "https://auto-buddy.in" com.autobuddy.mobile`

### Backend API not connecting
- Verify `EXPO_PUBLIC_API_BASE_URL` is correct
- Check CORS settings in FastAPI backend
- Test API at `https://api.auto-buddy.in/api/health`

---

## Deployment Checklist

- [ ] Update `vercel.json` with routes
- [ ] Update `app.json` with deep linking config
- [ ] Create `.well-known/assetlinks.json` with correct SHA256
- [ ] Deploy web version to Vercel
- [ ] Connect `auto-buddy.in` domain
- [ ] Deploy backend API to production
- [ ] Generate and test APK
- [ ] Build iOS app (after June 1st)
- [ ] Submit Android app to Play Store (before June 1st)
- [ ] Submit iOS app to App Store (after June 1st)
- [ ] Test landing page on multiple devices
- [ ] Test deep linking (after June 1st)
- [ ] Monitor app store reviews

---

## Post-Launch Monitoring

- Monitor app store ratings & reviews
- Check backend API logs for errors
- Track user feedback
- Prepare updates based on feedback

