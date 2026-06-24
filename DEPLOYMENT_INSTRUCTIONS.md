# Deployment Instructions for Ride Selection Fix

## Problem
The ride selection modal changes have been made to the code but need to be deployed for them to appear on the live website at `auto-buddy.in/app`.

## What Was Changed
File: `/autobuddy-mobile/src/components/PassengerSingleScreenBooking.tsx`

1. **Added modal state sync** (Lines 116-122) - Syncs modal selection with main ride type
2. **Updated handleRideDetailsConfirm** (Lines 373-383) - Directly commits modal selection to main state
3. **Enhanced fare display** (Lines 553-600) - Shows loading state while calculating

## How to Deploy

### Step 1: Install Dependencies
```bash
cd C:\Users\Dhanya\Documents\AutoBuddy\autobuddy-mobile
npm install
```

### Step 2: Build the App
```bash
npm run export:web
```

This creates a `dist/` folder with the built web app.

### Step 3: Deploy to Vercel (if connected)
The `autobuddy-mobile` has a `vercel.json` config, so you can:
```bash
npx vercel deploy
```

Or push to your git repository and Vercel will auto-deploy.

### Step 4: Or Deploy Manually
If you have direct server access:
1. Copy the contents of `dist/` to your web server's public directory
2. Or upload to your hosting provider

## Verification After Deployment

1. Open `https://auto-buddy.in/app` in a browser
2. **Hard refresh** to clear cache: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
3. Enter a destination
4. Click a ride type (e.g., "Taxi")
5. Click "Done" in the modal
6. **Observe:**
   - ✅ Ride type updates immediately
   - ✅ "Calculating fare..." shows briefly
   - ✅ Distance is calculated
   - ✅ Fare updates

## If Changes Still Don't Appear

### Check 1: Browser Cache
- Open DevTools (F12)
- Go to Application → Cache Storage
- Clear all caches
- Hard refresh (Ctrl+Shift+R)

### Check 2: Verify Build
```bash
npm run export:web
```
Check if `dist/` folder was created with new files.

### Check 3: Check Deployment
Verify the new version is actually deployed to the server by:
- Checking the timestamp of files on the server
- Looking at CloudFront/CDN cache headers
- Checking your deployment logs (Vercel, etc.)

## Current Git Status

To see what changes are pending:
```bash
cd C:\Users\Dhanya\Documents\AutoBuddy\autobuddy-mobile
git status
git diff src/components/PassengerSingleScreenBooking.tsx
```

## Next Steps

After deployment, the ride selection should work correctly:
- Select "Taxi" → "Done" → Ride type updates to "Taxi"
- "Calculating fare..." appears while API call is made
- Fare updates with new ride type's pricing
- Distance recalculates

## Support

If issues persist after deployment:
1. Check browser console (F12 → Console) for JavaScript errors
2. Check Network tab to see if API calls are being made
3. Check if backend API `/api/passengers/rides/estimate-fare` is responding correctly
npm run export:web
