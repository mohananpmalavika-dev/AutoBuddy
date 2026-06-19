import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  FlatList,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PushNotification, usePushNotifications } from '../hooks/usePushNotifications';

interface NotificationCenterProps {
  visible: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  visible,
  onClose,
}) => {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearNotifications,
    getCriticalNotifications,
  } = usePushNotifications();

  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');

  const getFilteredNotifications = useCallback(() => {
    let filtered = notifications;

    if (filter === 'unread') {
      filtered = notifications.filter((n) => !n.read);
    } else if (filter === 'critical') {
      filtered = getCriticalNotifications();
    }

    return filtered;
  }, [notifications, filter, getCriticalNotifications]);

  const getNotificationIcon = (type: PushNotification['type']) => {
    switch (type) {
      case 'ride_request':
        return 'local-taxi';
      case 'ride_accepted':
        return 'check-circle';
      case 'ride_completed':
        return 'done-all';
      case 'earnings_update':
        return 'attach-money';
      case 'incentive':
        return 'local-offer';
      case 'system_alert':
        return 'warning';
      case 'promotion':
        return 'card-giftcard';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: PushNotification['type'], severity?: string) => {
    if (severity === 'critical') return '#F44336';
    if (severity === 'high') return '#FF9800';

    switch (type) {
      case 'ride_request':
        return '#2196F3';
      case 'ride_accepted':
        return '#4CAF50';
      case 'ride_completed':
        return '#4CAF50';
      case 'earnings_update':
        return '#FFB800';
      case 'incentive':
        return '#E91E63';
      case 'system_alert':
        return '#F44336';
      case 'promotion':
        return '#9C27B0';
      default:
        return '#999';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return new Date(date).toLocaleDateString();
  };

  const renderNotificationItem = ({ item }: { item: PushNotification }) => (
    <Pressable
      style={[styles.notificationItem, !item.read && styles.notificationUnread]}
      onPress={() => {
        if (!item.read) markAsRead(item.id);
      }}
    >
      <View
        style={[
          styles.notificationIcon,
          {
            backgroundColor: getNotificationColor(item.type, item.severity),
          },
        ]}
      >
        <MaterialIcons
          name={getNotificationIcon(item.type) as any}
          size={20}
          color="#fff"
        />
      </View>

      <View style={styles.notificationContent}>
        <Text style={styles.notificationTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.notificationBody} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.notificationTime}>{formatTime(item.timestamp)}</Text>
      </View>

      <Pressable
        style={styles.deleteButton}
        onPress={() => removeNotification(item.id)}
      >
        <MaterialIcons name="close" size={16} color="#999" />
      </Pressable>
    </Pressable>
  );

  const filteredNotifications = getFilteredNotifications();

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <Text style={styles.title}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#2196F3" />
          </Pressable>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {unreadCount > 0 && (
            <Pressable style={styles.actionBtn} onPress={markAllAsRead}>
              <MaterialIcons name="done-all" size={16} color="#2196F3" />
              <Text style={styles.actionBtnText}>Mark all as read</Text>
            </Pressable>
          )}

          {notifications.length > 0 && (
            <Pressable style={styles.actionBtn} onPress={clearNotifications}>
              <MaterialIcons name="delete" size={16} color="#F44336" />
              <Text style={[styles.actionBtnText, { color: '#F44336' }]}>
                Clear all
              </Text>
            </Pressable>
          )}
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabs}>
          {(['all', 'unread', 'critical'] as const).map((f) => (
            <Pressable
              key={f}
              style={[styles.filterTab, filter === f && styles.filterTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  styles.filterTabLabel,
                  filter === f && styles.filterTabLabelActive,
                ]}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Notifications List */}
        {filteredNotifications.length > 0 ? (
          <FlatList
            data={filteredNotifications}
            keyExtractor={(item) => item.id}
            renderItem={renderNotificationItem}
            contentContainerStyle={styles.listContent}
            scrollEnabled={true}
          />
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="notifications-none" size={64} color="#ddd" />
            <Text style={styles.emptyText}>
              {filter === 'unread'
                ? 'No unread notifications'
                : filter === 'critical'
                ? 'No critical alerts'
                : 'No notifications'}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

/**
 * Notification Banner (Floating toast-like component)
 */
interface NotificationBannerProps {
  notification: PushNotification;
  onDismiss: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  notification,
  onDismiss,
}) => {
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  const color = notification.severity === 'critical' ? '#F44336' : '#2196F3';

  return (
    <View style={[styles.banner, { borderLeftColor: color }]}>
      <View
        style={[
          styles.bannerIcon,
          { backgroundColor: `${color}20` },
        ]}
      >
        <MaterialIcons
          name={getNotificationIconForBanner(notification.type) as any}
          size={18}
          color={color}
        />
      </View>

      <View style={styles.bannerContent}>
        <Text style={styles.bannerTitle} numberOfLines={1}>
          {notification.title}
        </Text>
        <Text style={styles.bannerBody} numberOfLines={1}>
          {notification.body}
        </Text>
      </View>

      <Pressable
        style={styles.bannerClose}
        onPress={() => {
          setVisible(false);
          onDismiss();
        }}
      >
        <MaterialIcons name="close" size={16} color="#999" />
      </Pressable>
    </View>
  );
};

const getNotificationIconForBanner = (type: PushNotification['type']) => {
  switch (type) {
    case 'ride_request':
      return 'local-taxi';
    case 'earnings_update':
      return 'attach-money';
    case 'incentive':
      return 'local-offer';
    default:
      return 'notifications';
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  badge: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  filterTabActive: {
    backgroundColor: '#2196F3',
  },
  filterTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterTabLabelActive: {
    color: '#fff',
  },
  listContent: {
    paddingVertical: 8,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 4,
    marginHorizontal: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  notificationUnread: {
    backgroundColor: '#F8F9FF',
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notificationContent: {
    flex: 1,
    gap: 4,
  },
  notificationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  notificationBody: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  notificationTime: {
    fontSize: 11,
    color: '#999',
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerContent: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  bannerBody: {
    fontSize: 11,
    color: '#666',
  },
  bannerClose: {
    padding: 4,
  },
});

export default NotificationCenter;
