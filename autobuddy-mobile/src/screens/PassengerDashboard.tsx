import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SingleScreenBooking } from './PassengerSingleScreenBooking';
import { ScheduleRideModal } from './ScheduleRideModal';
import { DriverInfoCard } from './DriverInfoCard';
import {
  usePassengerBooking,
  usePassengerRideTracking,
  usePassengerPayment,
  usePassengerProfile,
  usePassengerHistory,
  usePassengerSchedule,
} from '../hooks/usePassengerBooking';

interface PassengerDashboardProps {
  token: string;
  user: any;
  onLogout: () => void;
}

type DashboardTab = 'home' | 'active' | 'history' | 'profile';

export default function PassengerDashboard({
  token,
  user,
  onLogout,
}: PassengerDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('home');
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [bookingDestination, setBookingDestination] = useState('');
  const [bookingRideType, setBookingRideType] = useState('economy');

  // Hooks
  const { booking, loading: bookingLoading, bookRide, cancelBooking } =
    usePassengerBooking(token);
  const { tracking } = usePassengerRideTracking(token, booking?.id);
  const { methods: paymentMethods } = usePassengerPayment(token);
  const { profile } = usePassengerProfile(token);
  const { rides, hasMore, loadMore: loadMoreRides } = usePassengerHistory(token);
  const { scheduled } = usePassengerSchedule(token);

  const handleBookRide = (rideData: any) => {
    if (!rideData.destination.trim()) {
      Alert.alert('Destination Required', 'Please enter your destination');
      return;
    }
    setBookingDestination(rideData.destination);
    setBookingRideType(rideData.rideType);
    bookRide(
      'Current Location',
      rideData.destination,
      rideData.rideType,
      150 // Mock fare
    );
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

  // Render tabs
  const renderHomeTab = () => (
    <View style={styles.tabContent}>
      {/* Active booking */}
      {booking && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Active Ride</Text>

          {tracking && (
            <DriverInfoCard
              driver={{
                id: tracking.driverId,
                name: tracking.driverName,
                photo: tracking.driverPhoto,
                rating: tracking.driverRating,
                rideCount: 45,
                vehicle: {
                  make: 'Toyota',
                  model: 'Innova',
                  licensePlate: 'KA01AB1234',
                  color: tracking.vehicleType,
                },
                eta: tracking.eta,
              }}
              onCall={() => Alert.alert('Calling driver...')}
              onMessage={() => Alert.alert('Opening message...')}
              showEta={true}
            />
          )}

          <Pressable
            style={styles.cancelButton}
            onPress={() => {
              if (booking.id) cancelBooking(booking.id);
            }}
          >
            <MaterialIcons name="close" size={18} color="#D32F2F" />
            <Text style={styles.cancelButtonText}>Cancel Ride</Text>
          </Pressable>
        </View>
      )}

      {/* Booking interface */}
      {!booking && (
        <View style={styles.bookingSection}>
          <SingleScreenBooking
            savedLocations={mockSavedLocations}
            onBookRide={handleBookRide}
            onScheduleClick={handleScheduleClick}
            loading={bookingLoading}
          />
        </View>
      )}

      {/* Scheduled rides preview */}
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
                  {new Date(ride.scheduledAt).toLocaleString()}
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
      {booking && tracking ? (
        <View style={styles.section}>
          <DriverInfoCard
            driver={{
              id: tracking.driverId,
              name: tracking.driverName,
              photo: tracking.driverPhoto,
              rating: tracking.driverRating,
              rideCount: 45,
              vehicle: {
                make: 'Toyota',
                model: 'Innova',
                licensePlate: 'KA01AB1234',
                color: tracking.vehicleType,
              },
              eta: tracking.eta,
            }}
            onCall={() => Alert.alert('Calling driver...')}
            onMessage={() => Alert.alert('Opening message...')}
            showEta={true}
          />

          {/* Map placeholder */}
          <View style={styles.mapPlaceholder}>
            <MaterialIcons name="map" size={48} color="#ccc" />
            <Text style={styles.mapPlaceholderText}>
              Live map view (Ready for implementation)
            </Text>
          </View>

          <Pressable style={styles.cancelButton}>
            <MaterialIcons name="close" size={18} color="#D32F2F" />
            <Text style={styles.cancelButtonText}>Cancel Ride</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="directions-car" size={64} color="#ccc" />
          <Text style={styles.emptyStateTitle}>No Active Ride</Text>
          <Text style={styles.emptyStateSubtitle}>
            Start by booking a ride or scheduling one for later
          </Text>
          <Pressable
            style={styles.emptyStateButton}
            onPress={() => setActiveTab('home')}
          >
            <Text style={styles.emptyStateButtonText}>Book Now</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderHistoryTab = () => (
    <View style={styles.tabContent}>
      {rides.length > 0 ? (
        <FlatList
          data={rides}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.historyItem}>
              <View style={styles.historyIcon}>
                <MaterialIcons name="receipt" size={24} color="#2196F3" />
              </View>
              <View style={styles.historyContent}>
                <Text style={styles.historyDestination}>
                  {item.origin} → {item.destination}
                </Text>
                <Text style={styles.historySubtext}>
                  {new Date(item.date).toLocaleDateString()} • {item.distance} km
                </Text>
              </View>
              <Text style={styles.historyFare}>₹{item.fare}</Text>
            </View>
          )}
          onEndReached={() => hasMore && loadMoreRides()}
          scrollEnabled={true}
        />
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="history" size={64} color="#ccc" />
          <Text style={styles.emptyStateTitle}>No Ride History</Text>
          <Text style={styles.emptyStateSubtitle}>
            Your completed rides will appear here
          </Text>
        </View>
      )}
    </View>
  );

  const renderProfileTab = () => (
    <View style={styles.tabContent}>
      {profile ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Profile header */}
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {profile.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{profile.name}</Text>
              <Text style={styles.profilePhone}>{profile.phone}</Text>
              {profile.rating && (
                <View style={styles.profileRating}>
                  <MaterialIcons name="star" size={14} color="#FFB800" />
                  <Text style={styles.profileRatingText}>
                    {profile.rating.toFixed(1)} rating
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{profile.totalRides}</Text>
              <Text style={styles.statLabel}>Rides</Text>
            </View>
            <View style={styles.statBox}>
              <MaterialIcons name="local-offer" size={24} color="#4CAF50" />
              <Text style={styles.statLabel}>Save 10%</Text>
            </View>
            <View style={styles.statBox}>
              <MaterialIcons name="verified" size={24} color="#2196F3" />
              <Text style={styles.statLabel}>Verified</Text>
            </View>
          </View>

          {/* Payment methods */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Methods</Text>
            {paymentMethods.map(method => (
              <View key={method.id} style={styles.paymentItem}>
                <MaterialIcons
                  name={
                    method.type === 'wallet'
                      ? 'account-balance-wallet'
                      : 'credit-card'
                  }
                  size={24}
                  color="#2196F3"
                />
                <View style={styles.paymentItemContent}>
                  <Text style={styles.paymentItemLabel}>{method.label}</Text>
                  {method.isDefault && (
                    <Text style={styles.paymentItemDefault}>Default</Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {/* Saved locations */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Saved Locations</Text>
            {profile.savedLocations.map(location => (
              <View key={location.id} style={styles.locationItem}>
                <MaterialIcons name="location-on" size={24} color="#2196F3" />
                <View style={styles.locationContent}>
                  <Text style={styles.locationLabel}>{location.label}</Text>
                  <Text style={styles.locationAddress} numberOfLines={1}>
                    {location.address}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Logout */}
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <MaterialIcons name="logout" size={20} color="#D32F2F" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ActivityIndicator size="large" color="#2196F3" />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AutoBuddy</Text>
        <Pressable style={styles.headerIcon}>
          <MaterialIcons name="notifications" size={24} color="#2196F3" />
          <View style={styles.notificationBadge} />
        </Pressable>
      </View>

      {/* Content */}
      {activeTab === 'home' && renderHomeTab()}
      {activeTab === 'active' && renderActiveTab()}
      {activeTab === 'history' && renderHistoryTab()}
      {activeTab === 'profile' && renderProfileTab()}

      {/* Bottom tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'home' && styles.tabActive]}
          onPress={() => setActiveTab('home')}
        >
          <MaterialIcons
            name="home"
            size={24}
            color={activeTab === 'home' ? '#2196F3' : '#999'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'home' && styles.tabLabelActive,
            ]}
          >
            Home
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeTab === 'active' && styles.tabActive]}
          onPress={() => setActiveTab('active')}
        >
          <MaterialIcons
            name="directions-car"
            size={24}
            color={activeTab === 'active' ? '#2196F3' : '#999'}
          />
          {booking && <View style={styles.tabBadge} />}
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'active' && styles.tabLabelActive,
            ]}
          >
            Active
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <MaterialIcons
            name="history"
            size={24}
            color={activeTab === 'history' ? '#2196F3' : '#999'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'history' && styles.tabLabelActive,
            ]}
          >
            History
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeTab === 'profile' && styles.tabActive]}
          onPress={() => setActiveTab('profile')}
        >
          <MaterialIcons
            name="person"
            size={24}
            color={activeTab === 'profile' ? '#2196F3' : '#999'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'profile' && styles.tabLabelActive,
            ]}
          >
            Profile
          </Text>
        </Pressable>
      </View>

      {/* Schedule modal */}
      <ScheduleRideModal
        visible={scheduleModalVisible}
        destination={bookingDestination}
        rideType={bookingRideType}
        onConfirm={handleScheduleConfirm}
        onCancel={() => setScheduleModalVisible(false)}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  headerIcon: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D32F2F',
  },
  tabContent: {
    flex: 1,
    overflow: 'hidden',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  bookingSection: {
    flex: 1,
    paddingHorizontal: 0,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D32F2F',
    marginTop: 12,
    gap: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D32F2F',
  },
  scheduledRideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  scheduledRideIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
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
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 16,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyStateButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  mapPlaceholder: {
    height: 300,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  mapPlaceholderText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyContent: {
    flex: 1,
  },
  historyDestination: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  historySubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  historyFare: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#E3F2FD',
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileAvatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  profilePhone: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  profileRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  profileRatingText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    fontWeight: '600',
  },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  paymentItemContent: {
    flex: 1,
  },
  paymentItemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  paymentItemDefault: {
    fontSize: 11,
    color: '#2196F3',
    fontWeight: '600',
    marginTop: 2,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  locationContent: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  locationAddress: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginVertical: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D32F2F',
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D32F2F',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    position: 'relative',
  },
  tabActive: {
    borderTopWidth: 3,
    borderTopColor: '#2196F3',
  },
  tabLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#2196F3',
  },
  tabBadge: {
    position: 'absolute',
    top: 2,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D32F2F',
  },
});
