import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface DriverArrivalAnimationProps {
  driverName: string;
  vehicleNumber: string;
  onComplete?: () => void;
  autoHideDelay?: number;
}

/**
 * Driver Arrival Animation
 * Celebratory animation when driver arrives
 */
export const DriverArrivalAnimation: React.FC<DriverArrivalAnimationProps> = ({
  driverName,
  vehicleNumber,
  onComplete,
  autoHideDelay = 3000,
}) => {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Bounce animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Rotate confetti circles
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();

    // Auto hide
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        onComplete?.();
      });
    }, autoHideDelay);

    return () => clearTimeout(timer);
  }, [fadeAnim, scaleAnim, rotateAnim, autoHideDelay, onComplete]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: fadeAnim },
      ]}
    >
      {/* Confetti circles */}
      <Animated.View
        style={[
          styles.confettiCircle,
          styles.circle1,
          { transform: [{ rotate: rotation }] },
        ]}
      />
      <Animated.View
        style={[
          styles.confettiCircle,
          styles.circle2,
          { transform: [{ rotate: rotation }] },
        ]}
      />
      <Animated.View
        style={[
          styles.confettiCircle,
          styles.circle3,
          { transform: [{ rotate: rotation }] },
        ]}
      />

      {/* Main card */}
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.iconContainer}>
          <MaterialIcons name="directions-car" size={48} color="#2196F3" />
        </View>

        <Text style={styles.title}>Driver Arrived!</Text>

        <View style={styles.driverInfo}>
          <View style={styles.infoRow}>
            <MaterialIcons name="person" size={16} color="#666" />
            <Text style={styles.infoText}>{driverName}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="directions-car" size={16} color="#666" />
            <Text style={styles.infoText}>{vehicleNumber}</Text>
          </View>
        </View>

        <Text style={styles.cta}>Look for the vehicle outside</Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 100,
  },
  confettiCircle: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  circle1: {
    width: 120,
    height: 120,
    borderRadius: 60,
    top: '30%',
    left: '20%',
    opacity: 0.2,
  },
  circle2: {
    width: 100,
    height: 100,
    borderRadius: 50,
    bottom: '25%',
    right: '15%',
    opacity: 0.15,
  },
  circle3: {
    width: 80,
    height: 80,
    borderRadius: 40,
    top: '50%',
    right: '30%',
    opacity: 0.1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    elevation: 16,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    width: Dimensions.get('window').width - 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
    textAlign: 'center',
  },
  driverInfo: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  cta: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});
