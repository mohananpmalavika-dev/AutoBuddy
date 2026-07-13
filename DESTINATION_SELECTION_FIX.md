# Destination Selection Button Fix

## Problem
After selecting a destination, the confirm button was showing "Select destination" again instead of "Confirm Ride". This happened when re-selecting a destination or changing it.

## Root Cause
The issue was in the state update sequence in `PassengerMap.native.js`:

1. **Old sequence**: When a destination was selected, the code would:
   - Clear fare immediately
   - Then update route preview locations
   - Then calculate distance
   
2. **Problem**: This caused a brief moment where:
   - `fare` = null (cleared)
   - `routePreviewDistanceKm` = 0 (not updated yet)
   - `directTripDistanceKm` = 0 (locations not updated yet)
   - Result: `resolvedTripDistanceKm` = 0 → `quickBookingReady` = false → Button shows "Select destination"

3. **Secondary issue**: The `quickBookingStep` logic was overly complex and would reset to step 1 or 2 even when both locations were selected.

## Solution

### Fix 1: Reordered State Updates (Line ~867)
```javascript
// BEFORE: Clear fare first, then update locations
setFare(null);
setRoutePreviewLocations({ ... });
setRoutePreviewDistanceKm(distance);

// AFTER: Update locations and distance FIRST, then clear fare
const directDistance = calculateDirectDistanceKm(nextPickupLocation, nextDropoffLocation);
setRoutePreviewLocations({
  pickup: nextPickupLocation || null,
  dropoff: nextDropoffLocation || null,
});
setRoutePreviewDistanceKm(directDistance);

// Clear fare AFTER route preview is set
setFare(null);
```

**Why this works**: Even when fare is cleared, `routePreviewDistanceKm` now has the correct distance value, so `resolvedTripDistanceKm` remains > 0.

### Fix 2: Improved Button Logic (Line ~1129)
```javascript
// BEFORE: Complex logic that could reset
const quickBookingStep = !effectiveDropoffLocation 
  ? 1 
  : quickBookingReady && !fare && autoFetchingTripData 
    ? 2 
    : 3;

// AFTER: Simplified logic based on location state
const quickBookingStep = !effectiveDropoffLocation 
  ? 1 
  : !effectivePickupLocation 
    ? 1
    : resolvedTripDistanceKm > 0 
      ? 3 
      : 2;
```

**Why this works**: The step is determined purely by whether locations exist and distance is calculated, not by fare loading state.

### Fix 3: Faster Response Time
```javascript
// Reduced timeout from 120ms to 50ms
setTimeout(() => {
  refreshDriverDiscoveryRef.current?.({ silent: false, force: true });
}, 50); // Was 120ms
```

## Testing Checklist
- [x] Select pickup location
- [x] Select destination → Button should show "Confirm Ride"
- [x] Change destination → Button should still show "Confirm Ride" (not revert to "Select destination")
- [x] Clear and re-select destination → Button updates correctly
- [x] Distance and fare display correctly during the flow

## Files Modified
- `autobuddy-mobile/src/screens/PassengerMap.native.js`
  - Line ~867: `setLocationForPoint()` function - reordered state updates
  - Line ~1129: `quickBookingStep` calculation - simplified logic
  - Line ~1139: `quickBookingReady` determination - clearer comments

## Impact
- **User Experience**: Button now shows correct state immediately after destination selection
- **Performance**: Slightly faster response (50ms vs 120ms timeout)
- **Reliability**: State updates are synchronized properly, preventing UI flicker

## Technical Notes
The fix ensures that:
1. Route preview locations are always updated before fare is cleared
2. Distance calculation happens synchronously with location updates
3. Button state depends on location + distance, not on fare loading status
4. The booking is considered "ready" as soon as both locations exist with a valid distance, even if fare is still loading

This maintains the user's confidence that their selection was registered while the fare calculation happens in the background.
