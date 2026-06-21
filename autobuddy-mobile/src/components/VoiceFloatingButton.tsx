import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface VoiceFloatingButtonProps {
  onPress: () => void;
  isAvailable: boolean;
  isListening?: boolean;
}

export default function VoiceFloatingButton({
  onPress,
  isAvailable,
  isListening = false,
}: VoiceFloatingButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const subtleAnim = useRef(new Animated.Value(0)).current;

  // Subtle breathing pulse when idle
  useEffect(() => {
    if (!isListening) {
      const breath = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
      );
      breath.start();
      return () => breath.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  // Quick pulse when listening
  useEffect(() => {
    if (isListening) {
      const quick = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      );
      quick.start();
      return () => quick.stop();
    }
  }, [isListening, pulseAnim]);

  // Rotating ring animation
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(subtleAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      }),
    );
    spin.start();
    return () => spin.stop();
  }, [subtleAnim]);

  const spinInterpolation = subtleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (!isAvailable) return null;

  return (
    <View style={styles.wrapper}>
      {/* Rotating decorative ring */}
      <Animated.View
        style={[
          styles.ring,
          { transform: [{ rotate: spinInterpolation }] },
        ]}
      >
        <View style={styles.ringDash} />
        <View style={[styles.ringDash, styles.ringDashOpposite]} />
      </Animated.View>

      {/* Main button */}
      <Animated.View
        style={[
          styles.buttonOuter,
          { transform: [{ scale: pulseAnim }] },
          isListening && styles.buttonOuterListening,
        ]}
      >
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isListening && styles.buttonListening,
          ]}
          hitSlop={10}
        >
          <MaterialIcons
            name={isListening ? 'graphic-eq' : 'mic'}
            size={28}
            color="#fff"
          />
        </Pressable>
      </Animated.View>

      {/* Label */}
      <Text style={styles.label}>
        {isListening ? 'Listening...' : 'Voice'}
      </Text>
    </View>
  );
}

const BUTTON_SIZE = 60;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: BUTTON_SIZE + 16,
    height: BUTTON_SIZE + 16,
    borderRadius: (BUTTON_SIZE + 16) / 2,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: '#4CAF50',
  },
  ringDash: {
    position: 'absolute',
    width: 4,
    height: 4,
    backgroundColor: '#4CAF50',
    borderRadius: 2,
    top: 0,
    left: BUTTON_SIZE / 2 - 2,
  },
  ringDashOpposite: {
    top: undefined,
    bottom: 0,
    backgroundColor: '#4CAF50',
  },
  buttonOuter: {
    width: BUTTON_SIZE + 8,
    height: BUTTON_SIZE + 8,
    borderRadius: (BUTTON_SIZE + 8) / 2,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOuterListening: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  buttonListening: {
    backgroundColor: '#F44336',
    shadowColor: '#F44336',
  },
  label: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    fontWeight: '500',
  },
});
