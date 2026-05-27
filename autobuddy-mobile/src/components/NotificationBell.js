import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { COLORS, SHADOWS } from '../theme';

/**
 * NotificationBell - Header notification icon with badge
 * Shows unread notification count
 * 
 * @param {Function} onPress - Callback when bell is tapped
 * @param {number} unreadCount - Number of unread notifications
 * @param {Object} style - Additional styles
 */
export default function NotificationBell({ onPress, unreadCount = 0, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.container, style]}
      accessibilityLabel={`Notifications ${unreadCount > 0 ? `: ${unreadCount} unread` : ''}`}
      accessibilityHint="Open notification center"
      accessibilityRole="button"
    >
      <Text style={styles.bellIcon}>🔔</Text>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}

      {/* Pulse animation for active notifications */}
      {unreadCount > 0 && <View style={styles.pulse} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    position: 'relative',
    ...SHADOWS.small,
  },
  bellIcon: {
    fontSize: 20,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    ...SHADOWS.card,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  pulse: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },
});
