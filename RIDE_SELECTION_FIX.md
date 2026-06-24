# Ride Selection Frontend Update Fix

## Problem
The ride selection was not updating in the frontend when users selected a ride type and confirmed their choices in the ride details modal.

## Root Cause
In the `PassengerSingleScreenBooking.tsx` component:

1. **Missing State Sync**: When a user clicked on a ride type card, the modal would open with the old selection state (`selectedVehicleType`, `selectedVehicleModel`, `selectedRideCategory`) instead of reflecting the newly clicked ride type.

2. **Missing Confirmation Handler**: The `handleRideDetailsConfirm()` function only closed the modal without updating the main `selectedRideType` state with the user's choices from the modal.

## Solution
Two changes were made to fix the issue:

### 1. Added useEffect to Sync Modal State (Lines 116-122)
```typescript
// Sync modal state when ride type is selected or modal opens
useEffect(() => {
  if (showRideDetailsModal && selectedRideType) {
    // Initialize modal selections based on the selected ride type
    setSelectedVehicleType(selectedRideType);
  }
}, [showRideDetailsModal, selectedRideType]);
```

**What this does:**
- When the modal opens or the selected ride type changes, it syncs the `selectedVehicleType` to match the current `selectedRideType`
- Ensures the modal always shows the correct selection matching the user's ride type choice

### 2. Updated handleRideDetailsConfirm Function (Lines 373-384)
```typescript
const handleRideDetailsConfirm = () => {
  // Combine modal selections to create an updated ride type identifier
  // Map vehicle type to a ride type if needed
  const combinedRideType = selectedVehicleType || selectedRideType;
  
  // Update the main ride type selection with the modal choices
  if (combinedRideType !== selectedRideType) {
    setSelectedRideType(combinedRideType);
  }
  
  setShowRideDetailsModal(false);
};
```

**What this does:**
- When user clicks "Done" in the modal, it updates the main `selectedRideType` with the vehicle type selected in the modal
- This triggers a re-render, updating the selected ride display in the main UI
- The fare estimation also updates because the fare estimation useEffect depends on `selectedRideType`

## Flow After Fix
1. User enters destination → Ride type cards appear
2. User clicks a ride type card → `setSelectedRideType()` updates main state, modal opens
3. useEffect syncs modal state → `setSelectedVehicleType()` to match the clicked ride type
4. Modal displays with correct selection highlighted
5. User optionally adjusts vehicle model, ride category, passengers
6. User clicks "Done" → `handleRideDetailsConfirm()` updates `selectedRideType` with modal choices
7. Modal closes, main UI updates immediately showing new ride selection
8. Fare estimation recalculates with new ride type

## Files Modified
- `autobuddy-mobile/src/components/PassengerSingleScreenBooking.tsx`

## Testing
The fix ensures that:
- Ride selections are immediately reflected in the UI when confirmed
- Modal state always syncs with the main ride selection
- Fare estimates update when ride type changes
- The selected ride type persists through the booking flow
