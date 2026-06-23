import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type {
  PredictiveRideOption,
  PredictiveBookingState,
} from '../hooks/usePredictiveBooking';

interface PredictiveBookingCardProps {
  state: Omit<PredictiveBookingState, 'userName' | 'rideOptions'> & {
    rideOptions: PredictiveRideOption[];
  };
  onSelectOption: (optionId: string) => void;
  onBook: () => void;
  onDismiss: () => void;
}

/**
 * PredictiveBookingCard
 *
 * One-tap morning commute widget.
 * Shows greeting, destination, two fare options (Auto/Cab),
 * and a single Book button. After booking, auto-dismisses.
 *
 * Design: cartoon brutalist — bold outlines, flat colours, chunky shadows.
 */
export default function PredictiveBookingCard({
  state,
  onSelectOption,
  onBook,
  onDismiss,
}: PredictiveBookingCardProps) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Don't render if not in morning window (or dismissed)
  if (!state.isMorningWindow) {return null;}

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

  const isDone = state.bookingStatus === 'done';
  const isBooking = state.bookingStatus === 'booking';
  const isError = state.bookingStatus === 'error';
  const hasResult = state.bookingResult;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [{ translateY }, { scale: scaleAnim }],
        },
        isDone && styles.cardDone,
      ]}
    >
      {/* Header — Greeting + Dismiss */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="wb-sunny" size={18} color="#D6A84F" />
          </View>
          <Text style={styles.greeting} numberOfLines={1}>
            {state.greeting}
          </Text>
        </View>
        <Pressable
          onPress={onDismiss}
          style={styles.dismissBtn}
          hitSlop={8}
          accessibilityLabel="Dismiss predictive booking"
        >
          <MaterialIcons name="close" size={18} color="#6B756F" />
        </Pressable>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Body — shows result or booking form */}
      {isDone && hasResult ? (
        <View style={styles.doneContainer}>
          <View style={styles.doneIconWrap}>
            <MaterialIcons name="check-circle" size={48} color="#0B7A3B" />
          </View>
          <Text style={styles.doneTitle}>Done.</Text>
          <Text style={styles.doneSubtitle}>No searching.</Text>
          <View style={styles.doneDetails}>
            <Text style={styles.doneDetailText}>
              {hasResult.origin} → {hasResult.destination}
            </Text>
            <Text style={styles.doneDetailFare}>₹{hasResult.fare}</Text>
          </View>
        </View>
      ) : (
        <>
          {/* Destination info */}
          <View style={styles.routeRow}>
            <View style={styles.routeDots}>
              <View style={styles.dotGreen} />
              <View style={styles.dotLine} />
              <View style={styles.dotRed} />
            </View>
            <View style={styles.routeTextBlock}>
              <Text style={styles.routeLabel}>FROM</Text>
              <Text style={styles.routeValue}>{state.origin}</Text>
              <View style={styles.routeArrow}>
                <MaterialIcons name="arrow-downward" size={14} color="#6B756F" />
              </View>
              <Text style={styles.routeLabel}>TO</Text>
              <Text style={styles.routeValue}>{state.destination}</Text>
            </View>
          </View>

          {/* Ride Options (Auto / Cab) */}
          <View style={styles.optionsRow}>
            {state.rideOptions.map((option) => {
              const isSelected = state.selectedOptionId === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[
                    styles.optionCard,
                    isSelected && styles.optionCardSelected,
                    isBooking && styles.optionDisabled,
                  ]}
                  onPress={() => onSelectOption(option.id)}
                  disabled={isBooking}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={styles.optionIcon}>{option.icon}</Text>
                  <Text
                    style={[
                      styles.optionType,
                      isSelected && styles.optionTypeSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.optionPrice,
                      isSelected && styles.optionPriceSelected,
                    ]}
                  >
                    ₹{option.price}
                  </Text>
                  <Text style={styles.optionEta}>
                    {option.estimatedMinutes} min
                  </Text>
                  {isSelected && (
                    <View style={styles.selectedDot}>
                      <MaterialIcons name="check" size={12} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Book Button */}
          <Pressable
            style={[
              styles.bookBtn,
              (!state.selectedOptionId || isBooking) && styles.bookBtnDisabled,
            ]}
            onPress={onBook}
            disabled={!state.selectedOptionId || isBooking}
            accessibilityRole="button"
            accessibilityLabel="Book ride"
          >
            {isBooking ? (
              <View style={styles.bookBtnContent}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.bookBtnText}>Booking...</Text>
              </View>
            ) : (
              <Text style={styles.bookBtnText}>Book</Text>
            )}
          </Pressable>

          {/* Error message */}
          {isError && state.errorMessage ? (
            <View style={styles.errorBar}>
              <MaterialIcons name="error-outline" size={14} color="#C62828" />
              <Text style={styles.errorText}>{state.errorMessage}</Text>
            </View>
          ) : null}

          {/* Tagline */}
          <Text style={styles.tagline}>
            User taps once. Done. No searching.
          </Text>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? 100 : 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#102018',
    padding: 16,
    zIndex: 200,
    // Chunky brutalist shadow
    shadowColor: '#102018',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 0,
    elevation: 12,
  },
  cardDone: {
    borderColor: '#0B7A3B',
    backgroundColor: '#F0FDF4',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D6A84F',
  },
  greeting: {
    fontSize: 16,
    fontWeight: '900',
    color: '#102018',
    flex: 1,
  },
  dismissBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F4F7F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#DDE5DF',
    marginLeft: 8,
  },

  divider: {
    height: 2,
    backgroundColor: '#DDE5DF',
    marginBottom: 14,
  },

  // Route
  routeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    backgroundColor: '#F4F7F5',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#DDE5DF',
    padding: 12,
  },
  routeDots: {
    alignItems: 'center',
    paddingTop: 4,
    width: 16,
  },
  dotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0B7A3B',
    borderWidth: 2,
    borderColor: '#102018',
  },
  dotLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#6B756F',
    marginVertical: 3,
    marginHorizontal: 4,
  },
  dotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C62828',
    borderWidth: 2,
    borderColor: '#102018',
  },
  routeTextBlock: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#6B756F',
    letterSpacing: 1,
  },
  routeValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102018',
    marginTop: 2,
  },
  routeArrow: {
    marginVertical: 2,
  },

  // Options
  optionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  optionCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#DDE5DF',
    backgroundColor: '#FFFFFF',
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  optionCardSelected: {
    borderColor: '#0B7A3B',
    backgroundColor: '#F0FDF4',
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionIcon: {
    fontSize: 28,
    marginBottom: 2,
  },
  optionType: {
    fontSize: 15,
    fontWeight: '900',
    color: '#102018',
  },
  optionTypeSelected: {
    color: '#0B7A3B',
  },
  optionPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#102018',
  },
  optionPriceSelected: {
    color: '#0B7A3B',
  },
  optionEta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B756F',
  },
  selectedDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0B7A3B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#102018',
  },

  // Book button
  bookBtn: {
    backgroundColor: '#0B7A3B',
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#102018',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    // Shadow
    shadowColor: '#102018',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 0,
    elevation: 8,
  },
  bookBtnDisabled: {
    backgroundColor: '#B8C4BD',
    shadowOpacity: 0.05,
  },
  bookBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },

  // Error
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#C62828',
    padding: 8,
    marginBottom: 6,
  },
  errorText: {
    color: '#C62828',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  // Done state
  doneContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  doneIconWrap: {
    marginBottom: 8,
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0B7A3B',
  },
  doneSubtitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0B7A3B',
    marginBottom: 12,
  },
  doneDetails: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#DDE5DF',
    padding: 10,
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  doneDetailText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102018',
    textAlign: 'center',
  },
  doneDetailFare: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0B7A3B',
  },

  // Tagline
  tagline: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B756F',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
