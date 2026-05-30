import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { formatToIST } from '../utils/time';

/**
 * NotificationItem - Single notification card
 * 
 * @param {Object} notification - Notification data
 * @param {Function} onPress - Callback when tapped
 * @param {Function} onDismiss - Callback to remove notification
 */
export default function NotificationItem({ notification, onPress, onDismiss }) {
  const {
    id,
    title,
    body,
    icon = '🔔',
    severity = 'info',
    timestamp,
    read = false,
  } = notification;

  const getBackgroundColor = () => {
    switch (severity) {
      case 'error':
        return '#FFEBEE';
      case 'warning':
        return '#FFF3E0';
      case 'success':
        return '#E8F5E9';
      case 'important':
        return '#E3F2FD';
      default:
        return '#F5F5F5';
    }
  };

  const getBorderColor = () => {
    switch (severity) {
      case 'error':
        return '#F44336';
      case 'warning':
        return '#FF9800';
      case 'success':
        return '#4CAF50';
      case 'important':
        return '#2196F3';
      default:
        return '#E0E0E0';
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    try {
      return formatToIST(timestamp, { dateStyle: 'short' });
    } catch {
      return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric' }).format(date);
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: getBackgroundColor(),
          borderLeftColor: getBorderColor(),
        },
        !read && styles.unread,
      ]}
      activeOpacity={0.7}
      accessible={true}
      accessibilityLabel={title}
      accessibilityHint={body}
      accessibilityRole="button"
    >
      {/* Icon & Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.icon}>{icon}</Text>
          <View style={styles.textBlock}>
            <Text style={[styles.title, !read && styles.titleBold]}>
              {title}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {body}
            </Text>
          </View>
        </View>
        <Text style={styles.timestamp}>
          {formatTime(timestamp)}
        </Text>
      </View>

      {/* Unread dot */}
      {!read && <View style={styles.unreadDot} />}

      {/* Dismiss button */}
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          onDismiss(id);
        }}
        style={styles.dismissButton}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
      >
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginVertical: 4,
    marginHorizontal: 8,
    borderLeftWidth: 4,
    borderRadius: 8,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  unread: {
    backgroundColor: '#FAFAFA',
    opacity: 0.95,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
    marginTop: 2,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 2,
  },
  titleBold: {
    fontWeight: '700',
  },
  body: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2196F3',
    marginHorizontal: 8,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  dismissText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});
