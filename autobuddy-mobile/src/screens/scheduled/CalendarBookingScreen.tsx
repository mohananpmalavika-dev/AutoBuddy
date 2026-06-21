import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  FlatList,
  Switch,
  Modal,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

interface CalendarBooking {
  id: string;
  eventId: string;
  eventTitle: string;
  eventTime: string;
  location: string;
  status: 'pending' | 'booked' | 'cancelled' | 'completed';
  rideId?: string;
  estimatedCost?: number;
  pickupTime: string;
}

interface AutoBookingPreference {
  enabled: boolean;
  minDaysInAdvance: number;
  bufferMinutes: number;
  maxDistance: number;
  rideType: string;
  autoConfirm: boolean;
}

interface CalendarBookingScreenProps {
  token: string;
  userId: string;
  apiUrl?: string;
}

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export default function CalendarBookingScreen({
  token,
  userId,
  apiUrl = API_BASE,
}: CalendarBookingScreenProps) {
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [preferences, setPreferences] = useState<AutoBookingPreference>({
    enabled: false,
    minDaysInAdvance: 1,
    bufferMinutes: 30,
    maxDistance: 50,
    rideType: 'economy',
    autoConfirm: false,
  });
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [editingPreferences, setEditingPreferences] = useState<AutoBookingPreference>(preferences);
  const [upcomingBookings, setUpcomingBookings] = useState<CalendarBooking[]>([]);
  const [stats, setStats] = useState({
    totalBooked: 0,
    saved: 0,
    connectedCalendars: 0,
  });

  const apiHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Check if already authenticated
  useEffect(() => {
    checkAuthStatus();
    fetchUpcomingBookings();
  }, [token, userId]);

  const checkAuthStatus = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/calendar-booking/auth/status`, {
        headers: apiHeaders,
      });
      setAuthenticated(response.data.authenticated || false);
      if (response.data.authenticated) {
        fetchPreferences();
        fetchStats();
        fetchBookings();
      }
    } catch (error) {
      console.log('Not authenticated with Google Calendar');
    }
  };

  const startGoogleOAuth = async () => {
    try {
      setLoading(true);
      // Get OAuth URL from backend
      const response = await axios.get(`${apiUrl}/api/calendar-booking/auth/authorize`, {
        headers: apiHeaders,
      });

      const authUrl = response.data.auth_url;
      
      // Open in browser
      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'myapp://oauth-callback');

      if (result.type === 'success' && result.url) {
        // Extract code from URL
        const code = new URL(result.url).searchParams.get('code');
        if (code) {
          // Exchange code for token
          const tokenResponse = await axios.post(
            `${apiUrl}/api/calendar-booking/auth/callback`,
            { code },
            { headers: apiHeaders }
          );

          if (tokenResponse.data.success) {
            setAuthenticated(true);
            await fetchPreferences();
            await fetchStats();
            await fetchBookings();
            Alert.alert('Success', 'Google Calendar connected successfully!');
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to connect Google Calendar');
    } finally {
      setLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      const response = await axios.get(
        `${apiUrl}/api/calendar-booking/preferences`,
        { headers: apiHeaders }
      );
      setPreferences(response.data);
      setEditingPreferences(response.data);
    } catch (error) {
      console.error('Error fetching preferences:', error);
    }
  };

  const fetchBookings = async () => {
    try {
      const response = await axios.get(
        `${apiUrl}/api/calendar-booking/bookings`,
        { headers: apiHeaders }
      );
      setBookings(response.data.bookings || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  };

  const fetchUpcomingBookings = async () => {
    try {
      const response = await axios.get(
        `${apiUrl}/api/calendar-booking/upcoming`,
        { headers: apiHeaders }
      );
      setUpcomingBookings(response.data.bookings || []);
    } catch (error) {
      console.error('Error fetching upcoming bookings:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(
        `${apiUrl}/api/calendar-booking/stats`,
        { headers: apiHeaders }
      );
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const syncCalendar = async () => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${apiUrl}/api/calendar-booking/sync-and-book`,
        {},
        { headers: apiHeaders }
      );
      
      if (response.data.bookings_created) {
        Alert.alert(
          'Success',
          `${response.data.bookings_created} rides booked automatically!`
        );
        await fetchBookings();
        await fetchUpcomingBookings();
      } else {
        Alert.alert('Info', 'No new meetings requiring transportation found');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to sync calendar');
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    try {
      setLoading(true);
      await axios.post(
        `${apiUrl}/api/calendar-booking/preferences`,
        editingPreferences,
        { headers: apiHeaders }
      );
      setPreferences(editingPreferences);
      setShowPreferencesModal(false);
      Alert.alert('Success', 'Preferences saved!');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    try {
      await axios.delete(
        `${apiUrl}/api/calendar-booking/bookings/${bookingId}`,
        { headers: apiHeaders }
      );
      Alert.alert('Success', 'Booking cancelled');
      await fetchBookings();
      await fetchUpcomingBookings();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to cancel booking');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'booked':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'cancelled':
        return '#F44336';
      case 'completed':
        return '#2196F3';
      default:
        return '#999';
    }
  };

  const renderNotAuthenticated = () => (
    <View style={styles.authContainer}>
      <View style={styles.authIcon}>
        <MaterialIcons name="calendar-today" size={64} color="#2196F3" />
      </View>
      <Text style={styles.authTitle}>Connect Your Calendar</Text>
      <Text style={styles.authSubtitle}>
        Sync Google Calendar to automatically book rides for your meetings
      </Text>

      <Pressable
        style={styles.connectButton}
        onPress={startGoogleOAuth}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="account-balance" size={20} color="#fff" />
            <Text style={styles.connectButtonText}>Connect Google Calendar</Text>
          </>
        )}
      </Pressable>

      <View style={styles.benefitsContainer}>
        <View style={styles.benefitItem}>
          <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
          <Text style={styles.benefitText}>Auto-detect meetings</Text>
        </View>
        <View style={styles.benefitItem}>
          <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
          <Text style={styles.benefitText}>Book rides automatically</Text>
        </View>
        <View style={styles.benefitItem}>
          <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
          <Text style={styles.benefitText}>Never miss a meeting</Text>
        </View>
      </View>
    </View>
  );

  const renderAuthenticated = () => (
    <View style={styles.content}>
      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalBooked}</Text>
          <Text style={styles.statLabel}>Rides Booked</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>₹{stats.saved}</Text>
          <Text style={styles.statLabel}>Saved</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.connectedCalendars}</Text>
          <Text style={styles.statLabel}>Calendars</Text>
        </View>
      </View>

      {/* Sync Button */}
      <Pressable
        style={styles.syncButton}
        onPress={syncCalendar}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="sync" size={20} color="#fff" />
            <Text style={styles.syncButtonText}>Sync Calendar & Book Rides</Text>
          </>
        )}
      </Pressable>

      {/* Preferences */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Auto-Booking Settings</Text>
          <Pressable onPress={() => setShowPreferencesModal(true)}>
            <MaterialIcons name="edit" size={20} color="#2196F3" />
          </Pressable>
        </View>

        <View style={styles.preferenceItem}>
          <View>
            <Text style={styles.preferenceName}>Auto-Booking</Text>
            <Text style={styles.preferenceDesc}>
              Automatically book rides for detected meetings
            </Text>
          </View>
          <Switch
            value={preferences.enabled}
            onValueChange={(value) => {
              setEditingPreferences({ ...editingPreferences, enabled: value });
              setPreferences({ ...preferences, enabled: value });
            }}
          />
        </View>

        <View style={styles.preferenceItem}>
          <View>
            <Text style={styles.preferenceName}>Auto-Confirm</Text>
            <Text style={styles.preferenceDesc}>
              Confirm bookings without manual review
            </Text>
          </View>
          <Switch
            value={preferences.autoConfirm}
            onValueChange={(value) => {
              setEditingPreferences({ ...editingPreferences, autoConfirm: value });
              setPreferences({ ...preferences, autoConfirm: value });
            }}
          />
        </View>

        <View style={styles.settingGrid}>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Buffer Time</Text>
            <Text style={styles.settingValue}>{preferences.bufferMinutes} min</Text>
          </View>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Ride Type</Text>
            <Text style={styles.settingValue}>{preferences.rideType}</Text>
          </View>
        </View>
      </View>

      {/* Upcoming Bookings */}
      {upcomingBookings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Rides ({upcomingBookings.length})</Text>
          <FlatList
            scrollEnabled={false}
            data={upcomingBookings}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.bookingCard}>
                <View
                  style={[
                    styles.bookingStatusBadge,
                    { backgroundColor: getStatusColor(item.status) },
                  ]}
                >
                  <MaterialIcons name="event" size={16} color="#fff" />
                </View>
                <View style={styles.bookingContent}>
                  <Text style={styles.bookingTitle}>{item.eventTitle}</Text>
                  <Text style={styles.bookingLocation}>📍 {item.location}</Text>
                  <View style={styles.bookingMeta}>
                    <Text style={styles.bookingTime}>
                      🕐 {new Date(item.eventTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    {item.estimatedCost && (
                      <Text style={styles.bookingCost}>₹{item.estimatedCost}</Text>
                    )}
                  </View>
                </View>
                {item.status === 'pending' && (
                  <Pressable
                    onPress={() => cancelBooking(item.id)}
                    style={styles.cancelButton}
                  >
                    <MaterialIcons name="close" size={20} color="#F44336" />
                  </Pressable>
                )}
              </View>
            )}
          />
        </View>
      )}

      {/* Recent Bookings */}
      {bookings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Bookings</Text>
          <FlatList
            scrollEnabled={false}
            data={bookings.slice(0, 5)}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.bookingCard}>
                <View
                  style={[
                    styles.bookingStatusBadge,
                    { backgroundColor: getStatusColor(item.status) },
                  ]}
                >
                  <MaterialIcons name="event" size={16} color="#fff" />
                </View>
                <View style={styles.bookingContent}>
                  <Text style={styles.bookingTitle}>{item.eventTitle}</Text>
                  <Text style={styles.bookingLocation}>📍 {item.location}</Text>
                  <Text style={styles.bookingStatus}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
            )}
          />
        </View>
      )}

      {bookings.length === 0 && upcomingBookings.length === 0 && (
        <View style={styles.emptyState}>
          <MaterialIcons name="event" size={48} color="#ccc" />
          <Text style={styles.emptyStateTitle}>No bookings yet</Text>
          <Text style={styles.emptyStateSubtitle}>
            Sync your calendar to see upcoming meetings
          </Text>
        </View>
      )}
    </View>
  );

  const renderPreferencesModal = () => (
    <Modal visible={showPreferencesModal} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Auto-Booking Settings</Text>
            <Pressable onPress={() => setShowPreferencesModal(false)}>
              <MaterialIcons name="close" size={24} color="#000" />
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Buffer Time (minutes)</Text>
              <TextInput
                style={styles.input}
                placeholder="30"
                value={editingPreferences.bufferMinutes.toString()}
                onChangeText={(text) =>
                  setEditingPreferences({
                    ...editingPreferences,
                    bufferMinutes: parseInt(text) || 0,
                  })
                }
                keyboardType="numeric"
              />
              <Text style={styles.formHint}>
                How many minutes before the meeting to book a ride
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Max Distance (km)</Text>
              <TextInput
                style={styles.input}
                placeholder="50"
                value={editingPreferences.maxDistance.toString()}
                onChangeText={(text) =>
                  setEditingPreferences({
                    ...editingPreferences,
                    maxDistance: parseInt(text) || 0,
                  })
                }
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Preferred Ride Type</Text>
              <View style={styles.rideTypeSelector}>
                {(['economy', 'comfort', 'premium'] as const).map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.rideTypeButton,
                      editingPreferences.rideType === type && styles.rideTypeButtonActive,
                    ]}
                    onPress={() =>
                      setEditingPreferences({
                        ...editingPreferences,
                        rideType: type,
                      })
                    }
                  >
                    <Text
                      style={[
                        styles.rideTypeButtonText,
                        editingPreferences.rideType === type && styles.rideTypeButtonTextActive,
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.formLabel}>Auto-Confirm Bookings</Text>
                  <Text style={styles.formHint}>Book without manual review</Text>
                </View>
                <Switch
                  value={editingPreferences.autoConfirm}
                  onValueChange={(value) =>
                    setEditingPreferences({
                      ...editingPreferences,
                      autoConfirm: value,
                    })
                  }
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable
              style={styles.cancelModalButton}
              onPress={() => setShowPreferencesModal(false)}
            >
              <Text style={styles.cancelModalButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.saveButton}
              onPress={savePreferences}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {!authenticated ? renderNotAuthenticated() : renderAuthenticated()}
      </ScrollView>

      {renderPreferencesModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Auth Screen
  authContainer: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: 'center',
  },
  authIcon: {
    marginBottom: 24,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  authSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 20,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    marginBottom: 32,
    gap: 8,
    width: '100%',
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  benefitsContainer: {
    width: '100%',
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },

  // Authenticated Content
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2196F3',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    marginBottom: 24,
    gap: 8,
  },
  syncButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  preferenceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  preferenceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  preferenceDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  settingGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  settingItem: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  settingValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  bookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  bookingStatusBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bookingContent: {
    flex: 1,
  },
  bookingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  bookingLocation: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  bookingMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  bookingTime: {
    fontSize: 12,
    color: '#999',
  },
  bookingCost: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  bookingStatus: {
    fontSize: 11,
    color: '#2196F3',
    fontWeight: '500',
    marginTop: 4,
  },
  cancelButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginTop: 12,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  formHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000',
  },
  rideTypeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  rideTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  rideTypeButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  rideTypeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  rideTypeButtonTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cancelModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelModalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
