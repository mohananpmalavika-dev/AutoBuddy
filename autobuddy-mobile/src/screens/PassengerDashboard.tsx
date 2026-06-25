import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SingleScreenBooking } from '../components/PassengerSingleScreenBooking';
import { ScheduleRideModal } from '../components/ScheduleRideModal';
import { DriverInfoCard } from '../components/DriverInfoCard';
import { ComplianceAlertBanner } from '../components/ComplianceAlertBanner';
import { AIInsightsScreen, AIInsightsWidget } from '../screens/AIInsightsScreen';
import GuardianModeScreen from './GuardianModeScreen';
import {
  usePassengerBooking,
  usePassengerRideTracking,
  usePassengerPayment,
  usePassengerProfile,
  usePassengerHistory,
  usePassengerSchedule,
} from '../hooks/usePassengerBooking';
import { useVoiceBooking } from '../hooks/useVoiceBooking';
import VoiceBookingOverlay from '../components/VoiceBookingOverlay';
import VoiceFloatingButton from '../components/VoiceFloatingButton';
import PredictiveBookingCard from '../components/PredictiveBookingCard';
import PredictiveDestinationCard from '../components/PredictiveDestinationCard';
import { usePredictiveBooking } from '../hooks/usePredictiveBooking';
import CalendarBookingScreen from './scheduled/CalendarBookingScreen';
import { ModeSelectionScreen } from './ModeSelectionScreen';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

const formatDateTimeSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : 'Unknown';
};

interface PassengerDashboardProps {
  token: string;
  user: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    [key: string]: unknown;
  };
  onLogout: () => void;
}

type DashboardTab = 'home' | 'active' | 'history' | 'calendar' | 'travel' | 'profile' | 'mode';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PassengerDashboard({
  token,
  user,
  onLogout,
}: PassengerDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('home');
  const [guardianModeVisible, setGuardianModeVisible] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [bookingDestination, setBookingDestination] = useState('');
  const [bookingRideType, setBookingRideType] = useState('economy');
  const [voiceOverlayVisible, setVoiceOverlayVisible] = useState(false);

  // Standard booking hooks
  const { booking, loading: bookingLoading, bookRide, cancelBooking } =
    usePassengerBooking(token);
  const { tracking } = usePassengerRideTracking(token, booking?.id);
  const { methods: paymentMethods } = usePassengerPayment(token);
  const { profile } = usePassengerProfile(token);
  const { rides, hasMore, loadMore: loadMoreRides } = usePassengerHistory(token);
  const { scheduled } = usePassengerSchedule(token);

  // Voice booking hook – WhatsApp-style persistent mic
  const lastIntentRef = useRef<any>(null);
  const {
    voiceState,
    transcript,
    lastIntent,
    errorMessage: voiceError,
    isVoiceAvailable,
    startListening,
    stopListening,
    confirmAndBook,
    reset: resetVoice,
  } = useVoiceBooking({
    onIntentParsed: () => {
      // Auto-show overlay when intent is parsed
      setVoiceOverlayVisible(true);
    },
    onBookingComplete: () => {
      // Stay in overlay for 1.5s showing success then close
      setTimeout(() => {
        setVoiceOverlayVisible(false);
      }, 1500);
    },
    onError: () => {
      // Keep overlay open so user can retry
    },
    onStateChange: (state) => {
      // If we're not in overlay and voice goes to confirming, show overlay
      if (state === 'confirming' && !voiceOverlayVisible) {
        setVoiceOverlayVisible(true);
      }
    },
  });
  // Keep latest intent accessible in callbacks
  lastIntentRef.current = lastIntent;

  const handleBookRide = (rideData: any) => {
    if (!rideData || !rideData.destination || !rideData.destination.trim()) {
      Alert.alert('Destination Required', 'Please enter your destination');
      return;
    }
    setBookingDestination(rideData.destination);
    setBookingRideType(rideData.rideType);
    bookRide('Current Location', rideData.destination, rideData.rideType, rideData.fare || 150);
  };

  const handleScheduleClick = () => {
    setScheduleModalVisible(true);
  };

  const handleScheduleConfirm = (scheduleData: any) => {
    setScheduleModalVisible(false);
    Alert.alert('Success', 'Ride scheduled successfully!');
  };

  const mockSavedLocations = [
    {
      latitude: 13.0827,
      longitude: 80.2707,
      address: '123 MG Road, Bangalore',
      name: 'Home',
    },
    {
      latitude: 13.1939,
      longitude: 80.1829,
      address: '456 Indiranagar, Bangalore',
      name: 'Work',
    },
  ];

  // Predictive morning booking — one-tap commute suggestion
  const predictiveBooking = usePredictiveBooking(
    token,
    ((profile?.name ?? user?.name ?? '')?.split(' ') || []).filter(Boolean)?.[0] || 'there'
  );

  // -------------------------------------------------------------------------
  // Voice booking handlers – WhatsApp flow
  // -------------------------------------------------------------------------
  const handleVoicePress = useCallback(() => {
    // WhatsApp-style: tap mic to start/stop recording
    if (voiceState === 'idle' || voiceState === 'error') {
      resetVoice();
      setTimeout(() => startListening(), 200);
    } else if (voiceState === 'listening') {
      stopListening();
    }
  }, [voiceState, resetVoice, startListening, stopListening]);

  const handleVoiceConfirm = useCallback(async () => {
    await confirmAndBook(token || undefined);
  }, [confirmAndBook, token]);

  const handleOpenVoice = useCallback(() => {
    resetVoice();
    setVoiceOverlayVisible(true);
    setTimeout(() => startListening(), 400);
  }, [resetVoice, startListening]);

  const handleCloseVoice = useCallback(() => {
    stopListening();
    resetVoice();
    setVoiceOverlayVisible(false);
  }, [stopListening, resetVoice]);

  const handleRetryVoice = useCallback(() => {
    resetVoice();
    setTimeout(() => startListening(), 300);
  }, [resetVoice, startListening]);

  // -------------------------------------------------------------------------
  // Tab renderers
  // -------------------------------------------------------------------------
  const renderHomeTab = () => (
    <View style={styles.tabContent}>
      {booking && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Active Ride</Text>
          {tracking && (
            <DriverInfoCard
              driver={{
                id: tracking.driverId || '',
                name: tracking.driverName || 'Driver',
                photo: tracking.driverPhoto || '',
                rating: tracking.driverRating || 5,
                rideCount: 45,
                vehicle: {
                  make: 'Toyota',
                  model: 'Innova',
                  licensePlate: 'KA01AB1234',
                  color: tracking.vehicleType || 'White',
                },
                eta: tracking.eta || 5,
              }}
              onCall={() => Alert.alert('Calling driver...')}
              onMessage={() => Alert.alert('Opening message...')}
              showEta
            />
          )}
          <Pressable
            style={styles.cancelButton}
            onPress={() => { if (booking.id) {cancelBooking(booking.id);} }}
          >
            <MaterialIcons name="close" size={18} color="#D32F2F" />
            <Text style={styles.cancelButtonText}>Cancel Ride</Text>
          </Pressable>
        </View>
      )}

      {!booking && (
        <View style={styles.bookingSection}>
          <SingleScreenBooking
            savedLocations={mockSavedLocations}
            onBookRide={handleBookRide}
            onScheduleClick={handleScheduleClick}
            loading={bookingLoading}
          />

          {/* WhatsApp-style voice booking widget - always visible */}
          {isVoiceAvailable && (
            <View style={styles.voiceBookingWidget}>
              <View style={styles.voiceBookingDivider}>
                <View style={styles.dividerLine} />
                <Text style={styles.voiceBookingOr}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.voiceBookingRow}>
                <View style={styles.voiceBookingContent}>
                  <Text style={styles.voiceBookingTitle}>
                    Book with your voice
                  </Text>
                  <Text style={styles.voiceBookingSubtitle}>
                    Say "Book an auto to Kollam station"
                  </Text>
                </View>

                <VoiceFloatingButton
                  onPress={handleVoicePress}
                  isAvailable={true}
                  isListening={voiceState === 'listening'}
                />
              </View>
            </View>
          )}

          {/* AI Insights Widget */}
          <AIInsightsWidget 
            userId={user?.id || ''}
            onQuickBook={(destination) => {
              setBookingDestination(`${destination.lat},${destination.lng}`);
              setBookingRideType('economy');
            }}
            onViewAll={() => setActiveTab('travel')}
          />
        </View>
      )}

      {scheduled.length > 0 && !booking && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Upcoming Rides ({scheduled.length})
          </Text>
          {scheduled.slice(0, 2).map(ride => (
            <View key={ride.id} style={styles.scheduledRideCard}>
              <View style={styles.scheduledRideIcon}>
                <MaterialIcons name="schedule" size={24} color="#2196F3" />
              </View>
              <View style={styles.scheduledRideContent}>
                <Text style={styles.scheduledRideDestination}>
                  {ride.destination}
                </Text>
                <Text style={styles.scheduledRideTime}>
                  {formatDateTimeSafely(ride.scheduledAt) !== 'Unknown' ? formatDateTimeSafely(ride.scheduledAt) : 'Time TBD'}
                </Text>
                {ride.discount > 0 && (
                  <Text style={styles.scheduledRideDiscount}>
                    Save 10% • {ride.discount}₹ discount
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderActiveTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Active Rides</Text>
      {booking ? (
        <View style={styles.activeRideCard}>
          <MaterialIcons name="directions-car" size={48} color="#4CAF50" />
          <Text style={styles.activeRideText}>
            Ride to {booking.destination}
          </Text>
          <Text style={styles.activeRideStatus}>
            Status: {booking.status}
          </Text>
          <Text style={styles.activeRideFare}>₹{booking.fare}</Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="local-taxi" size={64} color="#ccc" />
          <Text style={styles.emptyStateTitle}>No active rides</Text>
          <Text style={styles.emptyStateSubtitle}>
            Book a ride to get started
          </Text>
        </View>
      )}
    </View>
  );

  const renderHistoryTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Ride History</Text>
      {rides.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="history" size={64} color="#ccc" />
          <Text style={styles.emptyStateTitle}>No rides yet</Text>
          <Text style={styles.emptyStateSubtitle}>
            Your ride history will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={item => item.id}
          onEndReached={hasMore ? loadMoreRides : undefined}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <View style={styles.historyCard}>
              <View style={styles.historyCardHeader}>
                <MaterialIcons name="directions-car" size={20} color="#2196F3" />
                <Text style={styles.historyDriverName}>
                  {item.driverName}
                </Text>
                <Text style={styles.historyFare}>₹{item.fare}</Text>
              </View>
              <View style={styles.historyRoute}>
                <Text style={styles.historyText}>
                  {item.origin} → {item.destination}
                </Text>
              </View>
              <Text style={styles.historyDate}>
                {item.date && !isNaN(new Date(item.date).getTime())
                  ? new Date(item.date).toLocaleDateString()
                  : 'Date unknown'
                }
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );

  const renderProfileTab = () => {
    const p = profile;
    return (
      <ScrollView style={styles.tabContent}>
        <View style={styles.profileHeader}>
          <View style={styles.profileAvatar}>
            <MaterialIcons name="person" size={48} color="#2196F3" />
          </View>
          <Text style={styles.profileName}>
            {p?.name || user?.name || 'Passenger'}
          </Text>
          <Text style={styles.profileEmail}>
            {p?.email || user?.email || ''}
          </Text>
          <Text style={styles.profilePhone}>
            {p?.phone || user?.phone || ''}
          </Text>
        </View>

        <View style={styles.profileStats}>
          <View style={styles.profileStatItem}>
            <Text style={styles.profileStatValue}>
              {p?.totalRides || 0}
            </Text>
            <Text style={styles.profileStatLabel}>Rides</Text>
          </View>
          <View style={styles.profileStatDivider} />
          <View style={styles.profileStatItem}>
            <Text style={styles.profileStatValue}>
              {p?.rating ? p.rating.toFixed(1) : '—'}
            </Text>
            <Text style={styles.profileStatLabel}>Rating</Text>
          </View>
          <View style={styles.profileStatDivider} />
          <View style={styles.profileStatItem}>
            <Text style={styles.profileStatValue}>
              {paymentMethods.length}
            </Text>
            <Text style={styles.profileStatLabel}>Payments</Text>
          </View>
        </View>

        <Pressable style={styles.modeSelectionButton} onPress={() => setActiveTab('mode')}>
          <MaterialIcons name="tune" size={20} color="#2196F3" />
          <Text style={styles.modeSelectionButtonText}>Mode Selection</Text>
          <MaterialIcons name="chevron-right" size={20} color="#2196F3" />
        </Pressable>

        <Pressable
          style={[styles.modeSelectionButton, styles.guardianLaunchButton]}
          onPress={() => setGuardianModeVisible(true)}
        >
          <MaterialIcons name="shield" size={20} color="#047857" />
          <Text style={[styles.modeSelectionButtonText, { color: '#047857' }]}>Guardian Mode</Text>
          <MaterialIcons name="chevron-right" size={20} color="#047857" />
        </Pressable>

        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <MaterialIcons name="logout" size={20} color="#D32F2F" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </Pressable>
      </ScrollView>
    );
  };

  const renderTravelTab = () => {
    return (
      <ScrollView style={styles.tabContent}>
        <AIInsightsScreen
          userId={user?.id || ''}
          onQuickBook={(destination) => {
            setBookingDestination(`${destination.lat},${destination.lng}`);
            setBookingRideType('economy');
            setActiveTab('home');
          }}
        />
      </ScrollView>
    );
  };

  // Voice state indicator that appears during active voice session
  const renderVoiceIndicator = () => {
    if (voiceState === 'idle' || voiceState === 'done') {return null;}
    if (voiceOverlayVisible) {return null;}

    return (
      <Pressable
        style={styles.voiceIndicator}
        onPress={() => setVoiceOverlayVisible(true)}
      >
        <View style={styles.voiceIndicatorContent}>
          <MaterialIcons
            name={voiceState === 'listening' ? 'graphic-eq' : 'mic'}
            size={20}
            color="#fff"
          />
          <Text style={styles.voiceIndicatorText}>
            {voiceState === 'listening'
              ? 'Listening...'
              : voiceState === 'processing'
                ? 'Processing...'
                : 'Voice active'}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#fff" />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ComplianceAlertBanner token={token} userId={user?.id || ''} />
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hello, {((profile?.name ?? user?.name ?? '')?.split(' ') || []).filter(Boolean)?.[0] || 'there'}
          </Text>
          <Text style={styles.headerSubtitle}>Where are you headed?</Text>
        </View>

        {/* Notification bell */}
        <Pressable style={styles.notifButton}>
          <MaterialIcons name="notifications-none" size={24} color="#333" />
        </Pressable>
      </View>

      {/* Main content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'home' && renderHomeTab()}
        {activeTab === 'active' && renderActiveTab()}
        {activeTab === 'history' && renderHistoryTab()}
        {activeTab === 'calendar' && (
          <CalendarBookingScreen token={token} userId={user?.id || ''} />
        )}
        {activeTab === 'travel' && renderTravelTab()}
        {activeTab === 'profile' && renderProfileTab()}
        {activeTab === 'mode' && <ModeSelectionScreen onLaunchGuardianMode={() => setGuardianModeVisible(true)} />}
      </ScrollView>

      {/* Guardian Mode overlay */}
      {guardianModeVisible && (
        <GuardianModeScreen onClose={() => setGuardianModeVisible(false)} />
      )}

      {/* AI Predictive Destination Card */}
      <PredictiveDestinationCard
        token={token}
        userId={user?.id || ''}
        onQuickBook={(destination) => {
          setBookingDestination(`${destination.latitude},${destination.longitude}`);
          setBookingRideType('economy');
          setActiveTab('home');
        }}
      />

      {/* Predictive morning booking card */}
      <PredictiveBookingCard
        state={{
          greeting: predictiveBooking.greeting,
          origin: predictiveBooking.origin,
          destination: predictiveBooking.destination,
          isMorningWindow: predictiveBooking.isMorningWindow,
          rideOptions: predictiveBooking.rideOptions,
          selectedOptionId: predictiveBooking.selectedOptionId,
          bookingStatus: predictiveBooking.bookingStatus,
          bookingResult: predictiveBooking.bookingResult,
          errorMessage: predictiveBooking.errorMessage,
        }}
        onSelectOption={predictiveBooking.selectOption}
        onBook={predictiveBooking.bookRide}
        onDismiss={predictiveBooking.dismiss}
      />

      {/* Voice indicator pill (shows when voice is active but overlay is closed) */}
      {renderVoiceIndicator()}

      {/* WhatsApp-style Voice Booking Overlay */}
      <VoiceBookingOverlay
        visible={voiceOverlayVisible}
        voiceState={voiceState}
        transcript={transcript}
        lastIntent={lastIntent}
        errorMessage={voiceError}
        isVoiceAvailable={isVoiceAvailable}
        onStartListening={handleOpenVoice}
        onStopListening={stopListening}
        onConfirm={handleVoiceConfirm}
        onRetry={handleRetryVoice}
        onClose={handleCloseVoice}
      />

      {/* Schedule Ride Modal */}
      <ScheduleRideModal
        visible={scheduleModalVisible}
        destination={bookingDestination || 'Kollam Railway Station'}
        rideType={bookingRideType}
        onConfirm={handleScheduleConfirm}
        onCancel={() => setScheduleModalVisible(false)}
      />

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'home', icon: 'home', label: 'Home' },
          { key: 'active', icon: 'directions-car', label: 'Active' },
          { key: 'history', icon: 'history', label: 'History' },
          { key: 'travel', icon: 'place', label: 'Travel' },
          { key: 'profile', icon: 'person', label: 'Profile' },
        ] as const).map(tab => (
          <Pressable
            key={tab.key}
            style={styles.tabItem}
            onPress={() => setActiveTab(tab.key)}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={24}
              color={activeTab === tab.key ? '#4CAF50' : '#999'}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.key && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  notifButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  tabContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  guardianLaunchButton: {
    marginTop: 12,
    backgroundColor: '#ECFDF5',
    borderColor: '#D1FAE5',
    borderWidth: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  bookingSection: {
    marginBottom: 24,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    gap: 6,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D32F2F',
  },
  scheduledRideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  scheduledRideIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  scheduledRideContent: {
    flex: 1,
  },
  scheduledRideDestination: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  scheduledRideTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  scheduledRideDiscount: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: 2,
  },
  // --- WhatsApp-style voice widget ---
  voiceBookingWidget: {
    marginTop: 16,
    paddingHorizontal: 4,
  },
  voiceBookingDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  voiceBookingOr: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    marginHorizontal: 12,
  },
  voiceBookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  voiceBookingContent: {
    flex: 1,
    marginRight: 12,
  },
  voiceBookingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#166534',
  },
  voiceBookingSubtitle: {
    fontSize: 12,
    color: '#4ade80',
    marginTop: 2,
  },
  // --- Active ride ---
  activeRideCard: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  activeRideText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginTop: 12,
  },
  activeRideStatus: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  activeRideFare: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
    marginTop: 8,
  },
  // --- Empty state ---
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 12,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 4,
  },
  // --- History ---
  historyCard: {
    padding: 14,
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyDriverName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
    flex: 1,
  },
  historyFare: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
  },
  historyRoute: {
    marginBottom: 4,
  },
  historyText: {
    fontSize: 13,
    color: '#666',
  },
  historyDate: {
    fontSize: 11,
    color: '#999',
  },
  // --- Profile ---
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  profilePhone: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  profileStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 24,
  },
  profileStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  profileStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  profileStatLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  profileStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e0e0e0',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#D32F2F',
  },
  modeSelectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    marginBottom: 12,
  },
  modeSelectionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2196F3',
    flex: 1,
    marginLeft: 8,
  },
  // --- Voice indicator ---
  voiceIndicator: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: '#333',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  voiceIndicatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceIndicatorText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  // --- Bottom tab bar ---
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#4CAF50',
    fontWeight: '700',
  },
});
