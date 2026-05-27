/**
 * POST-RIDE RATING INTEGRATION GUIDE
 * 
 * This file contains the code snippets needed to integrate post-ride rating
 * into PassengerMap.web.js. Copy and adapt these sections to your component.
 * 
 * INTEGRATION STEPS:
 * 1. Import PostRideRatingModal at top of PassengerMap.web.js
 * 2. Add state variables for post-ride rating modal management
 * 3. Add effect to detect when ride completes
 * 4. Add rating modal component to render
 * 5. Update history rendering to include rating buttons
 * 6. Replace PassengerRatingsPanel import to use enhanced version
 */

// ==================== IMPORT STATEMENTS ====================
// Add this to top of PassengerMap.web.js with other imports:

import PostRideRatingModal from './PostRideRatingModal';
import PassengerRatingsPanel from './PassengerRatingsPanel_Enhanced'; // Use enhanced version


// ==================== STATE VARIABLES ====================
// Add these to your PassengerMap.web.js useState declarations:

// Inside the component, add:
const [showPostRideRatingModal, setShowPostRideRatingModal] = useState(false);
const [postRideRatingBooking, setPostRideRatingBooking] = useState(null);
const [rideCompletionTime, setRideCompletionTime] = useState(null);


// ==================== EFFECT TO DETECT RIDE COMPLETION ====================
// Add this useEffect to detect when activeBooking status changes to 'completed':

useEffect(() => {
  if (activeBooking && activeBookingStatus === 'completed') {
    // Check if this is a new completion (not already handled)
    const now = Date.now();
    if (!rideCompletionTime || now - rideCompletionTime > 5000) {
      setRideCompletionTime(now);
      setPostRideRatingBooking(activeBooking);
      // Auto-open rating modal after 2 seconds
      const timer = setTimeout(() => {
        setShowPostRideRatingModal(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }
}, [activeBooking, activeBookingStatus, rideCompletionTime]);


// ==================== POST-RIDE RATING MODAL RENDER ====================
// Add this component to your render return (alongside other modals):

<PostRideRatingModal
  visible={showPostRideRatingModal}
  booking={postRideRatingBooking}
  token={token}
  onClose={() => {
    setShowPostRideRatingModal(false);
    setPostRideRatingBooking(null);
  }}
  onRatingSubmitted={(rating) => {
    // Optional: Show success message or update UI
    console.log('Rating submitted:', rating);
  }}
/>


// ==================== HISTORY VIEW WITH RATING BUTTONS ====================
// Replace the history rendering section (around line 2311) with this enhanced version:

{activePassengerMenu === 'history' && (
  <View style={styles.infoBlock}>
    <View style={styles.driverHeaderRow}>
      <Text style={styles.infoTitle}>{t.rideHistory}</Text>
      <TouchableOpacity
        style={styles.driverChip}
        onPress={() => refreshPassengerBookings({ silent: false })}
        disabled={loading}>
        <Text style={styles.driverChipText}>{t.refresh}</Text>
      </TouchableOpacity>
    </View>
    {passengerBookings.length === 0 ? (
      <PremiumEmptyState
        title={t.noRidesYet}
        subtitle={t.ridesHistorySubtitle}
        malayalam={t.ridesHistorySubtitle}
      />
    ) : (
      passengerBookings.slice(0, 20).map((booking) => (
        <View 
          key={booking.id} 
          style={[
            styles.historyCard, 
            { borderLeftColor: booking.status === 'completed' ? '#4CAF50' : booking.status === 'cancelled' ? '#F44336' : '#2196F3', borderLeftWidth: 4 }
          ]}>
          <View style={styles.historyCardRow}>
            <Text style={styles.historyCardStatus}>{booking.status.toUpperCase()}</Text>
            <Text style={styles.historyCardId}>{booking.id.substring(0, 8)}</Text>
          </View>
          <View style={styles.historyCardRow}>
            <Text style={styles.historyCardDriver}>{booking.driver_name || t.driverNotAssigned}</Text>
            <Text style={styles.historyCardFare}>INR {booking.estimated_fare}</Text>
          </View>
          {!!booking.pickup_location && !!booking.drop_location && (
            <Text style={styles.historyCardRoute} numberOfLines={1}>
              {normalizeLocation(booking.pickup_location)?.address || 'Pickup'} → {normalizeLocation(booking.drop_location)?.address || 'Drop'}
            </Text>
          )}
          {booking.status === 'completed' && (
            <TouchableOpacity 
              style={styles.rateRideButton}
              onPress={() => {
                setActivePassengerMenu('ratings');
                // Optional: Pass ride ID to ratings panel to pre-select it
              }}>
              <Text style={styles.rateRideButtonText}>⭐ Rate This Ride</Text>
            </TouchableOpacity>
          )}
        </View>
      ))
    )}
  </View>
)}


// ==================== STYLESHEET ADDITIONS ====================
// Add these styles to your StyleSheet.create() in PassengerMap.web.js:

historyCard: {
  borderWidth: 1,
  borderColor: '#E0E0E0',
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  marginBottom: 8,
  backgroundColor: '#FAFAFA',
},
rateRideButton: {
  marginTop: 10,
  backgroundColor: '#FFD700',
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 6,
  alignItems: 'center',
},
rateRideButtonText: {
  fontSize: 12,
  fontWeight: '700',
  color: '#333333',
},


// ==================== RATINGS MENU PANEL INTEGRATION ====================
// Update the ratings menu panel rendering (around line 2300+) to use the enhanced component:

{activePassengerMenu === 'ratings' && (
  <PassengerRatingsPanel 
    token={token}
    onRideSelected={(rideId) => {
      // Optional: Callback when a ride is selected for rating
      console.log('Rating ride:', rideId);
    }}
  />
)}


// ==================== LOCALIZATION STRINGS ====================
// If using localization, add these strings to your locale files:

// In EN section of passengerDashboard.js:
rideHistory: 'Ride History',
rateThisRide: 'Rate This Ride',
ratingSubmitted: 'Rating submitted successfully',

// In ML section of passengerDashboard.js:
rideHistory: 'യാത്ര ചരിത്രം',
rateThisRide: 'ഈ യാത്ര മൂല്യനിർണ്ണയം ചെയ്യുക',
ratingSubmitted: 'മൂല്യനിർണ്ണയം വിജയകരമായി സമർപ്പിച്ചു',
