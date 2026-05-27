import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { useNotifications } from '../contexts/NotificationContext';
import { notificationService } from '../lib/notificationService';
import NotificationItem from './NotificationItem';

/**
 * NotificationCenter - Full-screen notification panel
 * Shows all notifications with ability to mark as read/delete
 * 
 * @param {string} token - Auth token
 * @param {Function} onClose - Callback to close panel
 * @param {Function} onNotificationPress - Callback when notification tapped
 */
export default function NotificationCenter({ token, onClose, onNotificationPress }) {
  const { notifications, unreadCount, markAsRead, removeNotification, clearAll } =
    useNotifications();
  const [loading, setLoading] = useState(false);

  const handleNotificationPress = useCallback(
    (notification) => {
      // Mark as read
      markAsRead(notification.id);

      // Sync with backend
      notificationService.markAsRead(token, notification.id).catch(() => {
        // Silent fail
      });

      // Call parent callback if provided
      if (typeof onNotificationPress === 'function') {
        onNotificationPress(notification);
      }
    },
    [token, markAsRead, onNotificationPress]
  );

  const handleDismiss = useCallback(
    (notificationId) => {
      removeNotification(notificationId);
      notificationService.deleteNotification(token, notificationId).catch(() => {
        // Silent fail
      });
    },
    [token, removeNotification]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    setLoading(true);
    try {
      // Mark all in UI
      notifications.forEach((n) => {
        if (!n.read) {
          markAsRead(n.id);
        }
      });

      // Sync with backend
      await notificationService.markAllAsRead(token);
    } catch (error) {
      console.error('Error marking all as read:', error);
    } finally {
      setLoading(false);
    }
  }, [token, notifications, markAsRead]);

  const handleClearAll = useCallback(async () => {
    if (notifications.length === 0) return;

    // Confirm before clearing
    if (typeof alert !== 'undefined') {
      alert('Clear all notifications?', '', [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Clear',
          onPress: async () => {
            setLoading(true);
            try {
              clearAll();
              await notificationService.clearAll(token);
            } catch (error) {
              console.error('Error clearing notifications:', error);
            } finally {
              setLoading(false);
            }
          },
        },
      ]);
    }
  }, [token, notifications, clearAll]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={styles.badge}>
                {unreadCount} new
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityLabel="Close notifications"
            accessibilityRole="button"
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Action buttons */}
        {notifications.length > 0 && (
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleMarkAllAsRead}
              disabled={loading || unreadCount === 0}
              style={[styles.actionButton, unreadCount === 0 && styles.actionButtonDisabled]}
            >
              <Text style={styles.actionButtonText}>Mark all read</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClearAll}
              disabled={loading}
              style={styles.actionButton}
            >
              <Text style={styles.actionButtonText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}

        {/* Notifications list */}
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptySubtitle}>
              You&apos;re all caught up! We&apos;ll notify you when something important happens.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onPress={() => handleNotificationPress(notification)}
                onDismiss={handleDismiss}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  badge: {
    backgroundColor: '#2196F3',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 11,
    fontWeight: '600',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
