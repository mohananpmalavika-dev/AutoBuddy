import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useVoiceBooking, VoiceState, VoiceBookingIntent } from '../hooks/useVoiceBooking';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VoiceBookingOverlayProps {
  visible: boolean;
  voiceState: VoiceState;
  transcript: string;
  lastIntent: VoiceBookingIntent | null;
  errorMessage: string;
  isVoiceAvailable: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onConfirm: () => void;
  onRetry: () => void;
  onClose: () => void;
}

const STATE_CONFIG: Record<VoiceState, {
  icon: string;
  title: string;
  color: string;
  actionLabel?: string;
}> = {
  idle: {
    icon: 'mic',
    title: 'Tap to speak',
    color: '#4CAF50',
  },
  listening: {
    icon: 'mic',
    title: 'Listening...',
    color: '#F44336',
  },
  processing: {
    icon: 'hourglass-top',
    title: 'Processing...',
    color: '#FF9800',
  },
  confirming: {
    icon: 'check-circle',
    title: 'Confirm booking',
    color: '#2196F3',
  },
  booking: {
    icon: 'sync',
    title: 'Booking your ride...',
    color: '#FF9800',
  },
  done: {
    icon: 'check-circle',
    title: 'Booked!',
    color: '#4CAF50',
  },
  error: {
    icon: 'error',
    title: 'Something went wrong',
    color: '#F44336',
    actionLabel: 'Try again',
  },
};

export default function VoiceBookingOverlay({
  visible,
  voiceState,
  transcript,
  lastIntent,
  errorMessage,
  isVoiceAvailable,
  onStartListening,
  onStopListening,
  onConfirm,
  onRetry,
  onClose,
}: VoiceBookingOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // ---------------------------------------------------------------------------
  // Entrance / exit animation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 90,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  // ---------------------------------------------------------------------------
  // Pulse animation for listening state
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (voiceState === 'listening') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [voiceState, pulseAnim]);

  // ---------------------------------------------------------------------------
  // Rotate animation for booking state
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (voiceState === 'booking') {
      const spin = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      );
      spin.start();
      return () => spin.stop();
    } else {
      rotateAnim.setValue(0);
    }
  }, [voiceState, rotateAnim]);

  const rotateInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const config = STATE_CONFIG[voiceState];

  // ---------------------------------------------------------------------------
  // Mic button press
  // ---------------------------------------------------------------------------
  const handleMicPress = () => {
    if (voiceState === 'idle' || voiceState === 'error') {
      onStartListening();
    } else if (voiceState === 'listening') {
      onStopListening();
    }
  };

  if (!visible) {return null;}

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Top bar */}
      <SafeAreaView style={styles.topBar}>
        <Pressable onPress={onClose} style={styles.closeButton} hitSlop={16}>
          <MaterialIcons name="close" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.topBarTitle}>Voice Booking</Text>
        <View style={styles.closeButton} />
      </SafeAreaView>

      {/* Main content */}
      <View style={styles.content}>
        {/* Voice wave / mic area */}
        <View style={styles.micSection}>
          {/* Outer ring pulse */}
          <Animated.View
            style={[
              styles.micOuterRing,
              {
                borderColor: config.color,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.micInnerCircle,
                { backgroundColor: config.color + '20' },
              ]}
            >
              <Pressable onPress={handleMicPress} style={styles.micButton}>
                <Animated.View
                  style={
                    voiceState === 'booking'
                      ? { transform: [{ rotate: rotateInterpolation }] }
                      : undefined
                  }
                >
                  <MaterialIcons
                    name={config.icon as any}
                    size={48}
                    color={config.color}
                  />
                </Animated.View>
              </Pressable>
            </Animated.View>
          </Animated.View>

          <Text style={[styles.stateTitle, { color: config.color }]}>
            {config.title}
          </Text>
        </View>

        {/* Live transcript */}
        {transcript ? (
          <View style={styles.transcriptSection}>
            <MaterialIcons name="format-quote" size={20} color="#888" />
            <Text style={styles.transcriptText}>"{transcript}"</Text>
          </View>
        ) : null}

        {/* Parsed intent card */}
        {lastIntent && voiceState === 'confirming' && (
          <View style={styles.intentCard}>
            <Text style={styles.intentCardTitle}>Booking details</Text>

            <View style={styles.intentRow}>
              <View style={styles.intentIconWrap}>
                <MaterialIcons name="my-location" size={18} color="#4CAF50" />
              </View>
              <View style={styles.intentTextWrap}>
                <Text style={styles.intentLabel}>Pickup</Text>
                <Text style={styles.intentValue}>
                  {lastIntent.pickupText
                    ? lastIntent.pickupText.charAt(0).toUpperCase() +
                      lastIntent.pickupText.slice(1)
                    : 'Current location'}
                </Text>
              </View>
            </View>

            <View style={styles.intentDivider} />

            <View style={styles.intentRow}>
              <View style={styles.intentIconWrap}>
                <MaterialIcons name="location-on" size={18} color="#F44336" />
              </View>
              <View style={styles.intentTextWrap}>
                <Text style={styles.intentLabel}>Destination</Text>
                <Text style={styles.intentValue}>{lastIntent.destinationLabel}</Text>
              </View>
            </View>

            <View style={styles.intentDivider} />

            <View style={styles.intentRow}>
              <View style={styles.intentIconWrap}>
                <MaterialIcons name="directions-car" size={18} color="#2196F3" />
              </View>
              <View style={styles.intentTextWrap}>
                <Text style={styles.intentLabel}>Ride type</Text>
                <Text style={styles.intentValue}>
                  {lastIntent.preferredVehicleHint
                    ? lastIntent.preferredVehicleHint.toUpperCase()
                    : lastIntent.rideProductPreference
                      ? lastIntent.rideProductPreference.replace(/_/g, ' ').toUpperCase()
                      : 'STANDARD'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Error message */}
        {errorMessage ? (
          <View style={styles.errorCard}>
            <MaterialIcons name="warning" size={20} color="#FF9800" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Booking state indicator */}
        {voiceState === 'booking' && (
          <View style={styles.bookingProgress}>
            <ActivityIndicator size="small" color="#FF9800" />
            <Text style={styles.bookingProgressText}>
              Finding you a driver...
            </Text>
          </View>
        )}

        {/* Done state */}
        {voiceState === 'done' && (
          <View style={styles.doneSection}>
            <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
            <Text style={styles.doneText}>Ride booked!</Text>
            <Text style={styles.doneSubtext}>
              Driver will arrive shortly
            </Text>
          </View>
        )}
      </View>

      {/* Bottom action area */}
      <SafeAreaView style={styles.bottomBar}>
        {voiceState === 'confirming' && (
          <Pressable
            style={styles.confirmButton}
            onPress={onConfirm}
          >
            <MaterialIcons name="check" size={22} color="#fff" />
            <Text style={styles.confirmButtonText}>Confirm & Book</Text>
          </Pressable>
        )}

        {voiceState === 'error' && (
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <MaterialIcons name="mic" size={22} color="#fff" />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        )}

        {voiceState === 'listening' && (
          <Text style={styles.tapHint}>
            Tap the mic when you're done speaking
          </Text>
        )}

        {voiceState === 'idle' && !errorMessage && (
          <Text style={styles.tapHint}>
            Say something like{"\n"}
            "Book an auto to Kollam railway station"
          </Text>
        )}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#121212',
    zIndex: 9999,
    elevation: 9999,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  micSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  micOuterRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  micInnerCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  transcriptSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    maxWidth: SCREEN_WIDTH - 48,
  },
  transcriptText: {
    fontSize: 16,
    color: '#e0e0e0',
    fontStyle: 'italic',
    marginLeft: 8,
    flex: 1,
    lineHeight: 22,
  },
  intentCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: SCREEN_WIDTH - 48,
    borderWidth: 1,
    borderColor: '#333',
  },
  intentCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  intentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  intentIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  intentTextWrap: {
    flex: 1,
  },
  intentLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  intentValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  intentDivider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 4,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2c1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    maxWidth: SCREEN_WIDTH - 48,
  },
  errorText: {
    fontSize: 14,
    color: '#e0a0a0',
    marginLeft: 10,
    flex: 1,
    lineHeight: 20,
  },
  bookingProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 10,
  },
  bookingProgressText: {
    fontSize: 14,
    color: '#aaa',
  },
  doneSection: {
    alignItems: 'center',
    marginTop: 16,
  },
  doneText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4CAF50',
    marginTop: 12,
  },
  doneSubtext: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    alignItems: 'center',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9800',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    gap: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  tapHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
