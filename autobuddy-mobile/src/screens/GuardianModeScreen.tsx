import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet, Dimensions, Animated, AccessibilityInfo } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { useNotifications } from '../contexts/NotificationContext';
import WebLeafletMap from '../components/WebLeafletMap';
import GuardianSOSButton from '../components/GuardianSOSButton';
import { apiRequest } from '../lib/api-client';

const GuardianModeScreen = ({ onClose }) => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const { addNotification } = useNotifications();
  const [currentLocation, setCurrentLocation] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentInstruction, setCurrentInstruction] = useState('');
  const [instructionIndex, setInstructionIndex] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [destinations, setDestinations] = useState([]);
  const [showSOSMenu, setShowSOSMenu] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  useEffect(() => {
    initializeGuardianMode();
  }, []);

  useEffect(() => {
    // Fade in animation for main content
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    // Speak current instruction when it changes
    if (currentInstruction && voiceEnabled && isNavigating) {
      speakInstruction(currentInstruction);
    }
  }, [currentInstruction, voiceEnabled, isNavigating]);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  const initializeGuardianMode = async () => {
    try {
      setLoading(true);

      // Fetch preset destinations
      const destRes = await apiRequest('/api/guardian/simplified-destinations', {
        method: 'GET',
      });
      if (destRes.destinations) {
        setDestinations(destRes.destinations);
      }

      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }

      // Announce welcome message
      if (voiceEnabled) {
        speakInstruction('Welcome to Guardian Mode. Select a destination to begin.');
      }
    } catch (error) {
      console.error('Error initializing Guardian Mode:', error);
      addNotification({
        title: 'Setup Error',
        message: 'Could not initialize Guardian Mode',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // VOICE & SPEECH FUNCTIONS
  // ============================================================================

  const speakInstruction = async (text) => {
    try {
      await Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.8, // Slower rate for clarity
        onDone: () => {
          // Speech completed
        },
        onError: (error) => {
          console.warn('Speech error:', error);
        },
      });
    } catch (error) {
      console.error('Speech synthesis error:', error);
    }
  };

  const toggleVoice = () => {
    setVoiceEnabled(!voiceEnabled);
    speakInstruction(
      voiceEnabled ? 'Voice guidance disabled.' : 'Voice guidance enabled.'
    );
  };

  // ============================================================================
  // NAVIGATION & BOOKING
  // ============================================================================

  const handleDestinationSelect = async (destination) => {
    try {
      if (!currentLocation) {
        Alert.alert('Location Error', 'Could not get your current location');
        return;
      }

      setLoading(true);
      setSelectedDestination(destination);

      // Book one-tap ride
      const bookingRes = await apiRequest('/api/guardian/simplified-book', {
        method: 'POST',
        body: JSON.stringify({
          destination: destination.type,
          current_latitude: currentLocation.latitude,
          current_longitude: currentLocation.longitude,
        }),
      });

      if (bookingRes.ok) {
        // Get voice guidance
        const guidanceRes = await apiRequest('/api/guardian/voice-guide', {
          method: 'POST',
          body: JSON.stringify({
            start_latitude: currentLocation.latitude,
            start_longitude: currentLocation.longitude,
            end_latitude: destination.latitude,
            end_longitude: destination.longitude,
            mode: 'walking',
          }),
        });

        if (guidanceRes.ok && guidanceRes.instructions) {
          setIsNavigating(true);
          setShowMap(true);
          setInstructionIndex(0);
          setCurrentInstruction(guidanceRes.instructions[0] || '');

          addNotification({
            title: 'Ride Booked',
            message: `Journey to ${destination.name} started`,
            type: 'success',
          });
        }
      }
    } catch (error) {
      console.error('Error booking destination:', error);
      Alert.alert('Booking Error', 'Could not book ride to ' + destination.name);
    } finally {
      setLoading(false);
    }
  };

  const handleNextInstruction = () => {
    if (isNavigating) {
      // Logic to fetch next instruction from backend
      speakInstruction('Moving to next instruction.');
      setInstructionIndex(instructionIndex + 1);
    }
  };

  const handleArrival = async () => {
    try {
      setIsNavigating(false);
      setShowMap(false);
      setSelectedDestination(null);

      speakInstruction(`You have arrived at your destination. Thank you for using Guardian Mode.`);
      Alert.alert('Arrival', 'You have reached your destination!');

      addNotification({
        title: 'Trip Complete',
        message: 'You have safely arrived at your destination',
        type: 'success',
      });
    } catch (error) {
      console.error('Error on arrival:', error);
    }
  };

  const handleCancelNavigation = () => {
    Alert.alert('Cancel Navigation', 'Are you sure?', [
      { text: 'Continue', onPress: () => {} },
      {
        text: 'Cancel Trip',
        onPress: () => {
          setIsNavigating(false);
          setShowMap(false);
          setSelectedDestination(null);
          speakInstruction('Trip cancelled. Select a new destination.');
        },
      },
    ]);
  };

  // ============================================================================
  // RENDER - MAIN NAVIGATION SCREEN
  // ============================================================================

  if (isNavigating && showMap) {
    return (
      <View style={styles.container}>
        <WebLeafletMap
          hazardMarkers={[]}
          showReportButton={false}
          onReportPress={() => {}}
        />

        {/* Floating Instruction Card */}
        <Animated.View
          style={[
            styles.instructionCard,
            { opacity: fadeAnim },
          ]}
        >
          <Text style={styles.instructionText}>{currentInstruction}</Text>
          <View style={styles.instructionControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleNextInstruction}
              accessible={true}
              accessibilityLabel="Next instruction"
            >
              <Ionicons name="arrow-forward" size={24} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={toggleVoice}
              accessible={true}
              accessibilityLabel={voiceEnabled ? 'Mute voice' : 'Unmute voice'}
            >
              <Ionicons
                name={voiceEnabled ? 'volume-high' : 'volume-mute'}
                size={24}
                color="#FFF"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlButton, styles.arrivalButton]}
              onPress={handleArrival}
              accessible={true}
              accessibilityLabel="Mark as arrived"
            >
              <Ionicons name="checkmark-circle" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancelNavigation}
          accessible={true}
          accessibilityLabel="Cancel navigation"
        >
          <Ionicons name="close-circle" size={32} color="#EF4444" />
        </TouchableOpacity>

        {/* SOS Button */}
        <GuardianSOSButton />
      </View>
    );
  }

  // ============================================================================
  // RENDER - DESTINATION SELECTION SCREEN
  // ============================================================================

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} accessible={true} accessibilityLabel="Close Guardian Mode">
          <Ionicons name="arrow-back" size={28} color="#0B8F3A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guardian Mode</Text>
        <TouchableOpacity
          onPress={toggleVoice}
          accessible={true}
          accessibilityLabel={voiceEnabled ? 'Mute voice' : 'Unmute voice'}
        >
          <Ionicons
            name={voiceEnabled ? 'volume-high' : 'volume-mute'}
            size={28}
            color={voiceEnabled ? '#0B8F3A' : '#EF4444'}
          />
        </TouchableOpacity>
      </View>

      {/* Main Instruction */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeText}>Where would you like to go?</Text>
        <Text style={styles.subText}>Tap a destination to book your ride</Text>
      </View>

      {/* Destinations Grid */}
      <ScrollView style={styles.destinationGrid} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.loadingText}>Loading destinations...</Text>
        ) : (
          destinations.map((destination) => (
            <TouchableOpacity
              key={destination.type}
              style={styles.destinationButton}
              onPress={() => handleDestinationSelect(destination)}
              accessible={true}
              accessibilityLabel={`Go to ${destination.name}`}
              accessibilityHint={`Tap to book a ride to ${destination.name}`}
            >
              <Text style={styles.destinationEmoji}>{destination.emoji}</Text>
              <Text style={styles.destinationName}>{destination.name}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* SOS Button - Always visible */}
      <GuardianSOSButton />
    </Animated.View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0B8F3A',
    textAlign: 'center',
    flex: 1,
  },
  welcomeSection: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 20,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0B8F3A',
    marginBottom: 8,
  },
  subText: {
    fontSize: 14,
    color: '#666',
  },
  destinationGrid: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  destinationButton: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 32,
    marginBottom: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  destinationEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  destinationName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0B8F3A',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 32,
  },
  instructionCard: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: '#0B8F3A',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  instructionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 26,
  },
  instructionControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  arrivalButton: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  cancelButton: {
    position: 'absolute',
    top: 50,
    right: 16,
    backgroundColor: '#FFF',
    borderRadius: 50,
    padding: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
});

export default GuardianModeScreen;
