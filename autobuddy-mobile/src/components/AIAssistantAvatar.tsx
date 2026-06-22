import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface AIAssistantAvatarProps {
  isActive?: boolean;
  message?: string;
  onDismiss?: () => void;
}

/**
 * AI Assistant Avatar component
 * Animated conversational avatar for booking assistance
 */
export const AIAssistantAvatar: React.FC<AIAssistantAvatarProps> = ({
  isActive = false,
  message = "Hi! I'm your AutoBuddy AI. How can I help?",
  onDismiss,
}) => {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  // Floating animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [floatAnim]);

  // Breathing animation for glow
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [breatheAnim]);

  // Slide in animation on mount
  useEffect(() => {
    if (isActive) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get('window').height,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [isActive, slideAnim]);

  const glowOpacity = breatheAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Glow background */}
      <Animated.View
        style={[
          styles.glow,
          { opacity: glowOpacity },
        ]}
      />

      {/* Avatar bubble */}
      <Animated.View
        style={[
          styles.avatarContainer,
          { transform: [{ translateY: floatAnim }] },
        ]}
      >
        <View style={styles.avatar}>
          <MaterialIcons name="smart-toy" size={40} color="#2196F3" />
        </View>

        {/* Message bubble */}
        {message && (
          <View style={styles.messageBubble}>
            <Text style={styles.messageText} numberOfLines={3}>
              {message}
            </Text>
            <View style={styles.typingIndicator}>
              <View style={styles.typingDot} />
              <View style={styles.typingDot} />
              <View style={styles.typingDot} />
            </View>
          </View>
        )}
      </Animated.View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <View style={styles.actionButton}>
          <MaterialIcons name="mic" size={20} color="#2196F3" />
          <Text style={styles.actionText}>Voice</Text>
        </View>
        <View style={styles.actionButton}>
          <MaterialIcons name="chat" size={20} color="#2196F3" />
          <Text style={styles.actionText}>Chat</Text>
        </View>
        <View style={styles.actionButton}>
          <MaterialIcons name="close" size={20} color="#666" />
          <Text style={styles.actionText} onPress={onDismiss}>
            Close
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 40,
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#2196F3',
    bottom: 60,
    opacity: 0.1,
  },
  avatarContainer: {
    alignItems: 'center',
    zIndex: 10,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2196F3',
    marginBottom: 16,
    elevation: 8,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  messageBubble: {
    backgroundColor: 'rgba(33, 150, 243, 0.95)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: Dimensions.get('window').width - 40,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  typingIndicator: {
    flexDirection: 'row',
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  actions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 20,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});
