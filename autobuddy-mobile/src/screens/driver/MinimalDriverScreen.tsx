/**
 * Minimal Driver Screen
 * Clean, simple interface for drivers of all ages with voice support
 * Focus: Go Online → Accept Rides → Navigate → Complete
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  ActivityIndicator,
  Platform,
  Vibration,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';

interface MinimalDriverScreenProps {
  token: string;
  user: any;
  onLogout: () => void;
}

type DriverStatus = 'offline' | 'online' | 'busy';

interface RideRequest {
  id: string;
  passengerName: string;
  pickupLocation: string;
  dropoffLocation: string;
  distance: string;
  fare: string;
  vehicleType: string;
  waitingTime: number;
}

export default function MinimalDriverScreen({ token, user }: MinimalDriverScreenProps) {
  // State
  const [driverStatus, setDriverStatus] = useState<DriverStatus>('offline');
  const [rideRequest, setRideRequest] = useState<RideRequest | null>(null);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayRides, setTodayRides] = useState(0);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(30);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const statusAnim = useRef(new Animated.Value(0)).current;
  const rideCardAnim = useRef(new Animated.Value(0)).current;

  // Online pulse animation
  useEffect(() => {
    if (driverStatus === 'online') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [driverStatus]);

  // Countdown timer for ride requests
  useEffect(() => {
    if (rideRequest && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && rideRequest) {
      // Auto-decline on timeout
      handleDeclineRide();
    }
  }, [countdown, rideRequest]);

  // Voice announcement for new ride
  useEffect(() => {
    if (rideRequest) {
      Vibration.vibrate([0, 500, 200, 500]);
      Speech.speak(
        `New ride request. Pickup from ${rideRequest.pickupLocation}. Fare ${rideRequest.fare}. Tap to accept.`,
        {
          language: 'en-IN',
          pitch: 1.1,
          rate: 0.85,
        }
      );
      
      // Slide in animation
      Animated.spring(rideCardAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      rideCardAnim.setValue(0);
    }
  }, [rideRequest]);

  const handleToggleOnline = async () => {
    setLoading(true);
    
    try {
      const newStatus = driverStatus === 'offline' ? 'online' : 'offline';
      
      // API call to update status
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/v1/drivers/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setDriverStatus(newStatus);
        
        // Voice feedback
        Speech.speak(
          newStatus === 'online' ? 'You are now online' : 'You are now offline',
          { language: 'en-IN' }
        );

        // Animate status change
        Animated.timing(statusAnim, {
          toValue: newStatus === 'online' ? 1 : 0,
          duration: 500,
          useNativeDriver: true,
        }).start();

        // Simulate receiving ride request after 5 seconds when online
        if (newStatus === 'online') {
          setTimeout(() => {
            simulateRideRequest();
          }, 5000);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const simulateRideRequest = () => {
    setRideRequest({
      id: 'RIDE123',
      passengerName: 'Rajesh Kumar',
      pickupLocation: 'Connaught Place Metro',
      dropoffLocation: 'Nehru Place',
      distance: '8.5 km',
      fare: '₹180',
      vehicleType: 'Auto',
      waitingTime: 3,
    });
    setCountdown(30);
  };

  const handleAcceptRide = async () => {
    if (!rideRequest) return;

    setLoading(true);
    
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/v1/rides/${rideRequest.id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        Speech.speak('Ride accepted. Navigate to pickup location.', { language: 'en-IN' });
        
        Alert.alert(
          'Ride Accepted! 🎉',
          'Navigate to pickup location',
          [
            {
              text: 'Start Navigation',
              onPress: () => {
                setDriverStatus('busy');
                setRideRequest(null);
                setTodayRides(todayRides + 1);
                // Navigate to ride screen
              },
            },
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to accept ride');
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineRide = () => {
    Speech.speak('Ride declined', { language: 'en-IN' });
    setRideRequest(null);
    setCountdown(30);
  };

  const getStatusColor = () => {
    switch (driverStatus) {
      case 'online':
        return '#10B981';
      case 'busy':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  const getStatusText = () => {
    switch (driverStatus) {
      case 'online':
        return 'Online - Ready for Rides';
      case 'busy':
        return 'Busy - On a Ride';
      default:
        return 'Offline';
    }
  };

  const rideCardTransform = {
    transform: [
      {
        translateY: rideCardAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [600, 0],
        }),
      },
    ],
    opacity: rideCardAnim,
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name || 'Driver'} 👋</Text>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
        </View>
        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>₹{todayEarnings}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{todayRides}</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Online/Offline Toggle */}
        <TouchableOpacity
          style={[styles.statusButton, { backgroundColor: getStatusColor() }]}
          onPress={handleToggleOnline}
          disabled={loading || driverStatus === 'busy'}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="large" />
          ) : (
            <>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <MaterialIcons
                  name={driverStatus === 'offline' ? 'power-settings-new' : 'check-circle'}
                  size={60}
                  color="#FFFFFF"
                />
              </Animated.View>
              <Text style={styles.statusButtonText}>
                {driverStatus === 'offline' ? 'Go Online' : driverStatus === 'online' ? 'Go Offline' : 'On Trip'}
              </Text>
              {driverStatus === 'online' && (
                <Text style={styles.statusButtonSubtext}>Waiting for rides...</Text>
              )}
            </>
          )}
        </TouchableOpacity>

        {/* Quick Actions */}
        {driverStatus !== 'offline' && !rideRequest && (
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickAction}>
              <MaterialIcons name="access-time" size={32} color="#3B82F6" />
              <Text style={styles.quickActionText}>Earnings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction}>
              <MaterialIcons name="history" size={32} color="#3B82F6" />
              <Text style={styles.quickActionText}>History</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickAction}>
              <MaterialIcons name="location-on" size={32} color="#3B82F6" />
              <Text style={styles.quickActionText}>Map</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Ride Request Card */}
      {rideRequest && (
        <Animated.View style={[styles.rideRequestOverlay, rideCardTransform]}>
          <View style={styles.rideRequestCard}>
            {/* Countdown */}
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>{countdown}s</Text>
            </View>

            {/* Ride Info */}
            <View style={styles.rideInfo}>
              <Text style={styles.rideTitle}>New Ride Request! 🚗</Text>
              
              <View style={styles.rideDetail}>
                <MaterialIcons name="person" size={24} color="#374151" />
                <Text style={styles.rideDetailText}>{rideRequest.passengerName}</Text>
              </View>

              <View style={styles.rideDetail}>
                <MaterialIcons name="my-location" size={24} color="#10B981" />
                <Text style={styles.rideDetailText}>{rideRequest.pickupLocation}</Text>
              </View>

              <View style={styles.rideDetail}>
                <MaterialIcons name="location-on" size={24} color="#EF4444" />
                <Text style={styles.rideDetailText}>{rideRequest.dropoffLocation}</Text>
              </View>

              <View style={styles.rideMeta}>
                <View style={styles.metaItem}>
                  <MaterialIcons name="straighten" size={20} color="#6B7280" />
                  <Text style={styles.metaText}>{rideRequest.distance}</Text>
                </View>
                <View style={styles.metaItem}>
                  <MaterialIcons name="access-time" size={20} color="#6B7280" />
                  <Text style={styles.metaText}>{rideRequest.waitingTime} min</Text>
                </View>
              </View>

              <View style={styles.fareContainer}>
                <Text style={styles.fareLabel}>Estimated Fare</Text>
                <Text style={styles.fareAmount}>{rideRequest.fare}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.rideActions}>
              <TouchableOpacity
                style={[styles.rideButton, styles.declineButton]}
                onPress={handleDeclineRide}
              >
                <MaterialIcons name="close" size={32} color="#FFFFFF" />
                <Text style={styles.rideButtonText}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.rideButton, styles.acceptButton]}
                onPress={handleAcceptRide}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="check" size={32} color="#FFFFFF" />
                    <Text style={styles.rideButtonText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusButton: {
    width: 280,
    height: 280,
    borderRadius: 140,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  statusButtonText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 16,
  },
  statusButtonSubtext: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 8,
    opacity: 0.9,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 40,
  },
  quickAction: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionText: {
    fontSize: 12,
    color: '#374151',
    marginTop: 8,
    fontWeight: '600',
  },
  rideRequestOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingTop: 20,
  },
  rideRequestCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  countdownContainer: {
    position: 'absolute',
    top: -30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  countdownText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  rideInfo: {
    marginBottom: 20,
  },
  rideTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 20,
    textAlign: 'center',
  },
  rideDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  rideDetailText: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  rideMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: '#6B7280',
  },
  fareContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    padding: 16,
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
  },
  fareLabel: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '600',
  },
  fareAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E3A8A',
  },
  rideActions: {
    flexDirection: 'row',
    gap: 12,
  },
  rideButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 18,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  declineButton: {
    backgroundColor: '#EF4444',
  },
  acceptButton: {
    backgroundColor: '#10B981',
  },
  rideButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
