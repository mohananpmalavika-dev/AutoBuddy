import React, { useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';

/**
 * DriverTabBar Component
 * 
 * Sticky tab navigation for driver dashboard.
 * Features: Active indicator, badge counts, smooth switching
 * 
 * Props:
 *   - activeTab: driver dashboard tab key
 *   - onTabChange: (tabKey) => void
 *   - requestCount: number (pending requests)
 *   - upcomingCount: number (scheduled/upcoming rides)
 *   - notificationCount: number (unread notifications)
 *   - menuBadges: object (documents/support/trust/earnings badge counts)
 *   - isOnline: boolean
 *   - compact: boolean (use compact styling for web sidebar)
 */
export default function DriverTabBar({
  activeTab = 'requests',
  onTabChange,
  requestCount = 0,
  upcomingCount = 0,
  notificationCount = 0,
  menuBadges = {},
  isOnline = false,
  compact = false,
}) {
  const getBadgeCount = useCallback((key) => {
    const value = menuBadges?.[key];
    const count = typeof value === 'number' ? value : Number(value?.count || 0);
    return Number.isFinite(count) && count > 0 ? count : null;
  }, [menuBadges]);

  const tabs = useMemo(() => [
    // Core Operation
    { key: 'requests', label: 'Ride Flow', icon: 'R', badge: requestCount > 0 ? requestCount : null },
    { key: 'upcoming', label: 'Upcoming', icon: 'U', badge: upcomingCount > 0 ? upcomingCount : null },
    { key: 'history', label: 'History', icon: 'L', badge: null },
    { key: 'notifications', label: 'Notifications', icon: 'N', badge: notificationCount > 0 ? notificationCount : null },
    { key: 'earnings', label: 'Earnings', icon: 'E', badge: getBadgeCount('earnings') },
    { key: 'subscription', label: 'Subscription', icon: '$', badge: getBadgeCount('subscription') },
    
    // Account Management
    { key: 'profile', label: 'Profile', icon: 'P', badge: getBadgeCount('profile') },
    { key: 'documents', label: 'Documents', icon: 'D', badge: getBadgeCount('documents') },
    { key: 'vehicle', label: 'Vehicle', icon: 'V', badge: getBadgeCount('vehicle') },
    
    // Rewards & Tools
    { key: 'spin', label: 'Spin', icon: 'S', badge: null },
    { key: 'fare', label: 'Fare', icon: 'F', badge: null },
    
    // Performance & Analytics
    { key: 'analytics', label: 'Analytics', icon: 'A', badge: null },
    { key: 'reviews', label: 'Reviews', icon: '*', badge: getBadgeCount('reviews') },
    
    // Management
    { key: 'blocked', label: 'Blocked', icon: 'B', badge: null },
    { key: 'safety', label: 'Safety', icon: '!', badge: getBadgeCount('safety') },
    { key: 'trust', label: 'Trust', icon: 'T', badge: getBadgeCount('trust') },
    { key: 'support', label: 'Support', icon: 'H', badge: getBadgeCount('support') },
    
    // Preferences
    { key: 'settings', label: 'Settings', icon: 'G', badge: null },
    { key: 'actions', label: 'Actions', icon: '+', badge: null },
  ], [getBadgeCount, notificationCount, requestCount, upcomingCount]);

  const handleTabPress = useCallback((tabKey) => {
    if (typeof onTabChange === 'function') {
      onTabChange(tabKey);
    }
  }, [onTabChange]);

  if (compact) {
    // Sidebar vertical layout for web
    return (
      <View style={styles.sidebarContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.sidebarTab,
              activeTab === tab.key && styles.sidebarTabActive,
            ]}
            onPress={() => handleTabPress(tab.key)}>
            <Text style={styles.sidebarIcon}>{tab.icon}</Text>
            <Text style={[
              styles.sidebarLabel,
              activeTab === tab.key && styles.sidebarLabelActive,
            ]}>
              {tab.label}
            </Text>
            {tab.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        {/* Online Status Indicator */}
        <View style={styles.statusSection}>
          <View style={[styles.statusIndicator, isOnline && styles.statusOnline]} />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>
      </View>
    );
  }

  // Bottom sheet horizontal layout for mobile
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.tabActive,
            ]}
            onPress={() => handleTabPress(tab.key)}>
            <View style={styles.tabContent}>
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[
                styles.tabLabel,
                activeTab === tab.key && styles.tabLabelActive,
              ]}>
                {tab.label}
              </Text>
              {tab.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </Text>
                </View>
              )}
            </View>
            {activeTab === tab.key && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Mobile (horizontal) styles
  container: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingHorizontal: 8,
    paddingVertical: 6,
    ...SHADOWS.card,
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
  tab: {
    marginHorizontal: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabActive: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  tabContent: {
    alignItems: 'center',
    gap: 4,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.gray,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -6,
    height: 3,
    width: 40,
    backgroundColor: COLORS.primary,
    borderRadius: 1.5,
  },

  badge: {
    position: 'absolute',
    top: -4,
    right: 4,
    backgroundColor: '#FF5252',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
    paddingHorizontal: 4,
  },

  // Sidebar (vertical) styles for web
  sidebarContainer: {
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
    paddingVertical: 12,
    minWidth: 120,
  },
  sidebarTab: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    position: 'relative',
  },
  sidebarTabActive: {
    borderLeftColor: COLORS.primary,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
  },
  sidebarIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  sidebarLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.gray,
    textAlign: 'center',
  },
  sidebarLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },

  statusSection: {
    marginTop: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF5252',
    marginBottom: 6,
  },
  statusOnline: {
    backgroundColor: '#4CAF50',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMain,
  },
});
