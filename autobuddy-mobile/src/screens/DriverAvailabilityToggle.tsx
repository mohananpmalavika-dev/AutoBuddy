import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Text,
  Switch,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { driverAPI } from '@/services/apiClient';
import { getSocket } from '@/services/socketClient';

const DriverAvailabilityToggle: React.FC<{ driverId: string }> = ({ driverId }) => {
  const [isOnline, setIsOnline] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shiftStarted, setShiftStarted] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [earnings, setEarnings] = useState({
    total: 0,
    rides: 0,
    avg_rating: 0,
  });

  useEffect(() => {
    loadAvailabilityStatus();
    registerSocketListeners();

    return () => {
      const socket = getSocket();
      if (socket) {
        socket.off('driver_location_updated');
        socket.off('driver_availability_changed');
      }
    };
  }, [driverId]);

  const loadAvailabilityStatus = async () => {
    try {
      setLoading(true);
      const status = await driverAPI.getAvailability(driverId);
      setIsOnline(status.availability_status === 'online');
      setCurrentLocation(status.current_location || null);
      setLastUpdated(status.last_updated || new Date());
      setShiftStarted(status.shift_started || false);
      
      if (status.earnings) {
        setEarnings(status.earnings);
      }
    } catch (error) {
      console.error('Error loading availability status:', error);
      Alert.alert('Error', 'Failed to load driver status');
    } finally {
      setLoading(false);
    }
  };

  const registerSocketListeners = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('driver_location_updated', (data) => {
      if (data.driver_id === driverId) {
        setCurrentLocation(data.location);
        setLastUpdated(new Date());
      }
    });

    socket.on('driver_availability_changed', (data) => {
      if (data.driver_id === driverId) {
        setIsOnline(data.is_online);
      }
    });
  };

  const handleToggleAvailability = async (value: boolean) => {
    try {
      setLoading(true);
      if (value && !shiftStarted) {
        Alert.alert('Notice', 'Please start your shift before going online');
        setLoading(false);
        return;
      }

      const response = await driverAPI.setAvailability(driverId, {
        is_online: value,
      });

      setIsOnline(value);
      Alert.alert(
        'Success',
        value ? 'You are now online' : 'You are now offline'
      );
    } catch (error) {
      console.error('Error toggling availability:', error);
      Alert.alert('Error', 'Failed to update availability status');
      setIsOnline(!value);
    } finally {
      setLoading(false);
    }
  };

  const handleStartShift = async () => {
    try {
      setShiftLoading(true);
      const response = await driverAPI.startShift(driverId, {
        start_location: currentLocation || {
          latitude: 0,
          longitude: 0,
        },
      });

      setShiftStarted(true);
      Alert.alert('Success', 'Shift started');
    } catch (error) {
      console.error('Error starting shift:', error);
      Alert.alert('Error', 'Failed to start shift');
    } finally {
      setShiftLoading(false);
    }
  };

  const handleEndShift = async () => {
    Alert.alert('End Shift', 'Are you sure you want to end your shift?', [
      { text: 'Cancel' },
      {
        text: 'End Shift',
        onPress: async () => {
          try {
            setShiftLoading(true);
            const response = await driverAPI.endShift(driverId, {
              end_location: currentLocation || {
                latitude: 0,
                longitude: 0,
              },
            });

            setShiftStarted(false);
            setIsOnline(false);

            // Update earnings from response
            if (response.shift_earnings) {
              setEarnings(response.shift_earnings);
            }

            Alert.alert(
              'Shift Ended',
              `Today's earnings: ₹${response.shift_earnings?.total || 0}`
            );
          } catch (error) {
            console.error('Error ending shift:', error);
            Alert.alert('Error', 'Failed to end shift');
          } finally {
            setShiftLoading(false);
          }
        },
      },
    ]);
  };

  const getLocationString = () => {
    if (!currentLocation) return 'Location not available';
    return `${currentLocation.latitude?.toFixed(4)}, ${currentLocation.longitude?.toFixed(4)}`;
  };

  const getLastUpdatedString = () => {
    if (!lastUpdated) return 'Never';
    const diff = Date.now() - new Date(lastUpdated).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(lastUpdated).toLocaleDateString();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4ECDC4" />
          <Text style={styles.loadingText}>Loading status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Driver Dashboard</Text>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: isOnline ? '#51CF66' : '#95A5A6' },
            ]}
          >
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        {/* Availability Control */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Availability Control</Text>

          <View style={styles.availabilityCard}>
            <View style={styles.availabilityHeader}>
              <Text style={styles.availabilityLabel}>Status</Text>
              <Switch
                value={isOnline}
                onValueChange={handleToggleAvailability}
                disabled={!shiftStarted || loading}
                trackColor={{ false: '#e0e0e0', true: '#81C784' }}
                thumbColor={isOnline ? '#4ECDC4' : '#f4f3f4'}
              />
            </View>
            {!shiftStarted && (
              <Text style={styles.warningText}>
                ⚠️ Start your shift to go online
              </Text>
            )}
          </View>

          {/* Shift Controls */}
          <View style={styles.shiftControls}>
            {!shiftStarted ? (
              <TouchableOpacity
                style={[styles.button, styles.startButton]}
                onPress={handleStartShift}
                disabled={shiftLoading}
              >
                {shiftLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <MaterialIcons name="play-circle-outline" size={20} color="white" />
                    <Text style={styles.buttonText}>Start Shift</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.endButton]}
                onPress={handleEndShift}
                disabled={shiftLoading}
              >
                {shiftLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <MaterialIcons name="stop-circle-outline" size={20} color="white" />
                    <Text style={styles.buttonText}>End Shift</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Current Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Location</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <MaterialIcons name="location-on" size={20} color="#4ECDC4" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>GPS Coordinates</Text>
                <Text style={styles.infoValue}>{getLocationString()}</Text>
              </View>
            </View>

            <View style={[styles.infoRow, { marginTop: 12 }]}>
              <MaterialIcons name="schedule" size={20} color="#4ECDC4" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Last Updated</Text>
                <Text style={styles.infoValue}>{getLastUpdatedString()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Today's Earnings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Earnings</Text>

          <View style={styles.earningsGrid}>
            <View style={styles.earningsCard}>
              <MaterialCommunityIcons
                name="currency-inr"
                size={28}
                color="#51CF66"
              />
              <Text style={styles.earningsLabel}>Total</Text>
              <Text style={styles.earningsValue}>
                ₹{earnings.total?.toFixed(2) || '0.00'}
              </Text>
            </View>

            <View style={styles.earningsCard}>
              <MaterialIcons
                name="directions-car"
                size={28}
                color="#4ECDC4"
              />
              <Text style={styles.earningsLabel}>Rides</Text>
              <Text style={styles.earningsValue}>{earnings.rides || 0}</Text>
            </View>

            <View style={styles.earningsCard}>
              <MaterialIcons name="star" size={28} color="#FFD93D" />
              <Text style={styles.earningsLabel}>Rating</Text>
              <Text style={styles.earningsValue}>
                {earnings.avg_rating?.toFixed(1) || '0.0'}
              </Text>
            </View>
          </View>
        </View>

        {/* Status Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status Information</Text>

          <View style={styles.statusInfo}>
            <View style={styles.statusInfoRow}>
              <Text style={styles.statusInfoLabel}>Shift Status</Text>
              <Text
                style={[
                  styles.statusInfoValue,
                  {
                    color: shiftStarted ? '#51CF66' : '#FF6B6B',
                  },
                ]}
              >
                {shiftStarted ? '✓ Active' : '✗ Inactive'}
              </Text>
            </View>

            <View style={styles.statusInfoRow}>
              <Text style={styles.statusInfoLabel}>Online Status</Text>
              <Text
                style={[
                  styles.statusInfoValue,
                  {
                    color: isOnline ? '#51CF66' : '#95A5A6',
                  },
                ]}
              >
                {isOnline ? '🟢 Online' : '⚪ Offline'}
              </Text>
            </View>

            <View style={styles.statusInfoRow}>
              <Text style={styles.statusInfoLabel}>Ready for Rides</Text>
              <Text
                style={[
                  styles.statusInfoValue,
                  {
                    color: isOnline && shiftStarted ? '#51CF66' : '#FF6B6B',
                  },
                ]}
              >
                {isOnline && shiftStarted ? '✓ Yes' : '✗ No'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  content: {
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    marginLeft: 4,
  },
  availabilityCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  availabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  warningText: {
    fontSize: 12,
    color: '#FF6B6B',
    marginTop: 8,
  },
  shiftControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  startButton: {
    backgroundColor: '#4ECDC4',
  },
  endButton: {
    backgroundColor: '#FF6B6B',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  earningsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  earningsCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  earningsLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    marginTop: 8,
  },
  earningsValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginTop: 4,
  },
  statusInfo: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
  },
  statusInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statusInfoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  statusInfoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default DriverAvailabilityToggle;
