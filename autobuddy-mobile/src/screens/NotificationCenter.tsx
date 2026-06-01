/**
 * NotificationCenter.tsx
 * Displays all notifications with real-time updates from Socket.IO
 * 
 * Features:
 * - List all notifications with pagination
 * - Filter by type (booking, payment, message, support, safety, promo)
 * - Mark as read (individual or all)
 * - Delete notifications
 * - Real-time Socket.IO integration
 */

import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { NotificationContext } from '../contexts/NotificationContext';
import { useNotifications } from '../hooks/useBackendIntegration';
import { COLORS } from '../theme';
import { formatToIST } from '../utils/time';

type AppNotification = {
  id: string;
  type?: string;
  title?: string;
  body?: string;
  timestamp?: string;
  read?: boolean;
};

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  clearAll?: () => void;
  addNotification?: (notification: AppNotification) => void;
  markAsRead?: (notificationId: string) => void;
  markAllAsRead?: () => void;
  removeNotification?: (notificationId: string) => void;
};

type NotificationCenterProps = {
  navigation?: { goBack?: () => void };
};

export const NotificationCenter = ({ navigation }: NotificationCenterProps) => {
  const notificationContext = useContext(NotificationContext) as unknown as NotificationContextValue;
  const { markAsRead, markAllAsRead, deleteNotification, fetchNotifications } =
    useNotifications(notificationContext, null);

  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(false);

  const filterTypes = ['all', 'booking', 'payment', 'message', 'support', 'safety', 'promo'];

  const filteredNotifications = () => {
    if (filterType === 'all') {
      return notificationContext.notifications || [];
    }
    return (notificationContext.notifications || []).filter((n: AppNotification) => n.type === filterType);
  };

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await fetchNotifications();
    setLoading(false);
  }, [fetchNotifications]);

  useEffect(() => {
    void Promise.resolve().then(handleRefresh);
  }, [handleRefresh]);

  const renderNotificationItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[styles.notificationCard, item.read && styles.notificationCardRead]}
      onPress={() => markAsRead(item.id)}
    >
      <View style={styles.notificationContent}>
        <Text style={styles.notificationTitle}>{item.title}</Text>
        <Text style={styles.notificationBody} numberOfLines={2}>
          {item.body}
        </Text>
          <Text style={styles.notificationTime}>
            {item.timestamp ? formatToIST(item.timestamp, { dateStyle: 'short' }) : ''}
          </Text>
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteNotification(item.id)}
      >
        <Text style={styles.deleteButtonText}>✕</Text>
      </TouchableOpacity>

      {!item.read && <View style={styles.unreadIndicator} />}
    </TouchableOpacity>
  );

  const notifList = filteredNotifications();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Text style={styles.unreadBadge}>
          {notificationContext.unreadCount || 0}
        </Text>
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
        {filterTypes.map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.filterTab,
              filterType === type && styles.filterTabActive,
            ]}
            onPress={() => setFilterType(type)}
          >
            <Text
              style={[
                styles.filterTabText,
                filterType === type && styles.filterTabTextActive,
              ]}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Mark all as read */}
      {notificationContext.unreadCount > 0 && (
        <TouchableOpacity
          style={styles.markAllButton}
          onPress={markAllAsRead}
        >
          <Text style={styles.markAllButtonText}>Mark all as read</Text>
        </TouchableOpacity>
      )}

      {/* Notifications list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : notifList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No notifications</Text>
        </View>
      ) : (
        <FlatList
          data={notifList}
          renderItem={renderNotificationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    color: 'white',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: 'bold',
  },
  filterTabs: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: COLORS.lightGray,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
  },
  filterTabText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: 'white',
  },
  markAllButton: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.lightGray,
    borderRadius: 8,
  },
  markAllButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  notificationCardRead: {
    opacity: 0.7,
    borderLeftColor: COLORS.border,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  notificationBody: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    alignSelf: 'center',
    marginLeft: 8,
  },
  deleteButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
  },
  deleteButtonText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});

export default NotificationCenter;
