import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface LiveETACardProps {
  destination: string;
  etaMinutes: number;
  distance: number;
  driverName?: string;
  driverRating?: number;
}

/**
 * Live ETA Card with animated countdown and real-time updates
 * Shows destination, time, and distance with smooth animations
 */
export const LiveETACard: React.FC<LiveETACardProps> = ({
  destination,
  etaMinutes,
  distance,
  driverName = 'Driver',
  driverRating = 4.8,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for active state
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  // Subtle scale on mount
  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      {/* Header with driver info */}
      <View style={styles.header}>
        <View style={styles.driverInfo}>
          <View style={styles.avatarCircle}>
            <MaterialIcons name="person" size={20} color="#2196F3" />
          </View>
          <View style={styles.driverDetails}>
            <Text style={styles.driverName}>{driverName}</Text>
            <View style={styles.ratingRow}>
              <MaterialIcons name="star" size={14} color="#FFB800" />
              <Text style={styles.rating}>{driverRating}</Text>
            </View>
          </View>
        </View>

        {/* Pulse indicator */}
        <Animated.View
          style={[
            styles.pulseIndicator,
            { opacity: pulseOpacity },
          ]}
        >
          <View style={styles.pulseDot} />
        </Animated.View>
      </View>

      {/* ETA display */}
      <View style={styles.etaSection}>
        <Text style={styles.etaLabel}>Arriving in</Text>
        <Text style={styles.etaTime}>{etaMinutes} min</Text>
        <Text style={styles.etaDistance}>{distance.toFixed(1)} km away</Text>
      </View>

      {/* Destination */}
      <View style={styles.destinationSection}>
        <MaterialIcons name="location-on" size={18} color="#2196F3" />
        <Text style={styles.destination} numberOfLines={2}>
          {destination}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.max(0, Math.min(100, (60 - etaMinutes) / 60 * 100))}%`,
            },
          ]}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    elevation: 12,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  rating: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  pulseIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    marginLeft: 8,
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
  },
  etaSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  etaLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  etaTime: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2196F3',
    letterSpacing: -1,
  },
  etaDistance: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  destinationSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 8,
  },
  destination: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#E0E0E0',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 1.5,
  },
});
