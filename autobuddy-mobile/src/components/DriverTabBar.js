import React, { useCallback, useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { COLORS, SHADOWS } from '../theme';

const HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };

const SECTION_ORDER = ['drive', 'account', 'money', 'safety', 'tools'];
const SECTION_LABELS = {
  drive: 'Drive',
  account: 'Account',
  money: 'Money',
  safety: 'Safety',
  tools: 'Tools',
};

function TabIcon({ tab, active, compact = false }) {
  const color = active ? COLORS.primary : COLORS.textMuted;
  const size = compact ? 22 : 20;
  const symbolName =
    typeof tab.symbol === 'string'
      ? tab.symbol
      : tab.symbol?.[Platform.OS] || tab.symbol?.web || tab.symbol?.android || tab.symbol?.ios;

  if (Platform.OS === 'web') {
    return (
      <Text style={[styles.fallbackIcon, active && styles.fallbackIconActive]}>
        {tab.fallbackIcon}
      </Text>
    );
  }

  return (
    <SymbolView
      name={symbolName}
      size={size}
      tintColor={color}
      fallback={
        <Text style={[styles.fallbackIcon, active && styles.fallbackIconActive]}>
          {tab.fallbackIcon}
        </Text>
      }
    />
  );
}

function TabBadge({ count }) {
  if (!count) {
    return null;
  }
  return (
    <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function TabButton({ tab, active, onPress, compact = false, primary = false }) {
  const badgePhrase = tab.badge ? `, ${tab.badge} attention ${tab.badge === 1 ? 'item' : 'items'}` : '';
  return (
    <TouchableOpacity
      style={[
        compact ? styles.sidebarTab : styles.tab,
        primary && !compact && styles.primaryTab,
        active && (compact ? styles.sidebarTabActive : styles.tabActive),
      ]}
      onPress={() => onPress(tab.key)}
      accessibilityRole="button"
      accessibilityLabel={`${tab.label}${badgePhrase}`}
      accessibilityHint={tab.hint}
      accessibilityState={{ selected: active }}
      hitSlop={HIT_SLOP}>
      <View style={compact ? styles.sidebarTabContent : styles.tabContent}>
        <TabIcon tab={tab} active={active} compact={compact} />
        <Text
          style={[
            compact ? styles.sidebarLabel : styles.tabLabel,
            active && (compact ? styles.sidebarLabelActive : styles.tabLabelActive),
          ]}
          numberOfLines={compact ? 2 : 1}>
          {tab.label}
        </Text>
      </View>
      <TabBadge count={tab.badge} />
      {!compact && active && <View style={styles.activeIndicator} />}
    </TouchableOpacity>
  );
}

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
    {
      key: 'requests',
      label: 'Ride Flow',
      section: 'drive',
      pinned: true,
      symbol: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
      fallbackIcon: 'RF',
      badge: requestCount > 0 ? requestCount : null,
      hint: 'Open active rides and incoming requests.',
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      section: 'drive',
      pinned: true,
      symbol: { ios: 'calendar', android: 'event_upcoming', web: 'event_upcoming' },
      fallbackIcon: 'UP',
      badge: upcomingCount > 0 ? upcomingCount : null,
      hint: 'Open scheduled and upcoming rides.',
    },
    {
      key: 'earnings',
      label: 'Earnings',
      section: 'money',
      pinned: true,
      symbol: { ios: 'creditcard.fill', android: 'payments', web: 'payments' },
      fallbackIcon: 'INR',
      badge: getBadgeCount('earnings'),
      hint: 'Open earnings, payouts, and withdrawals.',
    },
    {
      key: 'support',
      label: 'Support',
      section: 'safety',
      pinned: true,
      symbol: { ios: 'headphones', android: 'support_agent', web: 'support_agent' },
      fallbackIcon: 'HP',
      badge: getBadgeCount('support'),
      hint: 'Open driver support and help tickets.',
    },
    {
      key: 'history',
      label: 'History',
      section: 'drive',
      symbol: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
      fallbackIcon: 'HI',
      badge: null,
      hint: 'Open completed and past rides.',
    },
    {
      key: 'notifications',
      label: 'Alerts',
      section: 'drive',
      symbol: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
      fallbackIcon: 'AL',
      badge: notificationCount > 0 ? notificationCount : null,
      hint: 'Open driver notifications.',
    },
    {
      key: 'profile',
      label: 'Profile',
      section: 'account',
      symbol: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
      fallbackIcon: 'PR',
      badge: getBadgeCount('profile'),
      hint: 'Open driver profile details.',
    },
    {
      key: 'documents',
      label: 'Documents',
      section: 'account',
      symbol: { ios: 'doc.text.fill', android: 'description', web: 'description' },
      fallbackIcon: 'DO',
      badge: getBadgeCount('documents'),
      hint: 'Open driver documents.',
    },
    {
      key: 'vehicle',
      label: 'Vehicle',
      section: 'account',
      symbol: { ios: 'car.side.fill', android: 'directions_car_filled', web: 'directions_car_filled' },
      fallbackIcon: 'VE',
      badge: getBadgeCount('vehicle'),
      hint: 'Open vehicle details.',
    },
    {
      key: 'trust',
      label: 'Trust',
      section: 'account',
      symbol: { ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' },
      fallbackIcon: 'TR',
      badge: getBadgeCount('trust'),
      hint: 'Open KYC and trust checks.',
    },
    {
      key: 'subscription',
      label: 'Plan',
      section: 'account',
      symbol: { ios: 'creditcard', android: 'card_membership', web: 'card_membership' },
      fallbackIcon: 'PL',
      badge: getBadgeCount('subscription'),
      hint: 'Open subscription status.',
    },
    {
      key: 'fare',
      label: 'Fare',
      section: 'money',
      symbol: { ios: 'tag.fill', android: 'local_offer', web: 'local_offer' },
      fallbackIcon: 'FA',
      badge: null,
      hint: 'Open fare pricing controls.',
    },
    {
      key: 'analytics',
      label: 'Analytics',
      section: 'money',
      symbol: { ios: 'chart.bar.xaxis', android: 'analytics', web: 'analytics' },
      fallbackIcon: 'AN',
      badge: null,
      hint: 'Open driver analytics.',
    },
    {
      key: 'reviews',
      label: 'Reviews',
      section: 'money',
      symbol: { ios: 'star.fill', android: 'reviews', web: 'reviews' },
      fallbackIcon: 'RV',
      badge: getBadgeCount('reviews'),
      hint: 'Open driver ratings and reviews.',
    },
    {
      key: 'blocked',
      label: 'Blocked',
      section: 'safety',
      symbol: { ios: 'nosign', android: 'block', web: 'block' },
      fallbackIcon: 'BL',
      badge: null,
      hint: 'Open blocked passengers.',
    },
    {
      key: 'safety',
      label: 'Safety',
      section: 'safety',
      symbol: { ios: 'shield.fill', android: 'shield', web: 'shield' },
      fallbackIcon: 'SF',
      badge: getBadgeCount('safety'),
      hint: 'Open safety tools.',
    },
    {
      key: 'spin',
      label: 'Spin',
      section: 'tools',
      symbol: { ios: 'sparkles', android: 'stars', web: 'stars' },
      fallbackIcon: 'SP',
      badge: null,
      hint: 'Open Spin rewards.',
    },
    {
      key: 'actions',
      label: 'Actions',
      section: 'tools',
      symbol: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
      fallbackIcon: 'AC',
      badge: null,
      hint: 'Open quick driver actions.',
    },
    {
      key: 'settings',
      label: 'Settings',
      section: 'tools',
      symbol: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
      fallbackIcon: 'ST',
      badge: null,
      hint: 'Open driver settings.',
    },
  ], [getBadgeCount, notificationCount, requestCount, upcomingCount]);

  const primaryTabs = useMemo(() => tabs.filter((tab) => tab.pinned), [tabs]);
  const groupedTabs = useMemo(() => SECTION_ORDER.map((sectionKey) => ({
    key: sectionKey,
    label: SECTION_LABELS[sectionKey],
    tabs: tabs.filter((tab) => tab.section === sectionKey && !tab.pinned),
  })).filter((section) => section.tabs.length > 0), [tabs]);

  const handleTabPress = useCallback((tabKey) => {
    if (typeof onTabChange === 'function') {
      onTabChange(tabKey);
    }
  }, [onTabChange]);

  if (compact) {
    return (
      <View style={styles.sidebarContainer}>
        <View style={styles.statusSection}>
          <View style={[styles.statusIndicator, isOnline && styles.statusOnline]} />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>
        <View style={styles.sidebarPinned}>
          {primaryTabs.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onPress={handleTabPress}
              compact
            />
          ))}
        </View>
        {groupedTabs.map((section) => (
          <View key={section.key} style={styles.sidebarGroup}>
            <Text style={styles.sidebarSectionLabel}>{section.label}</Text>
            {section.tabs.map((tab) => (
              <TabButton
                key={tab.key}
                tab={tab}
                active={activeTab === tab.key}
                onPress={handleTabPress}
                compact
              />
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.primaryRow}>
        {primaryTabs.map((tab) => (
          <TabButton
            key={tab.key}
            tab={tab}
            active={activeTab === tab.key}
            onPress={handleTabPress}
            primary
          />
        ))}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}>
        {groupedTabs.map((section) => (
          <View key={section.key} style={styles.mobileGroup}>
            <Text style={styles.mobileSectionLabel}>{section.label}</Text>
            <View style={styles.mobileGroupTabs}>
              {section.tabs.map((tab) => (
                <TabButton
                  key={tab.key}
                  tab={tab}
                  active={activeTab === tab.key}
                  onPress={handleTabPress}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
    ...SHADOWS.card,
  },
  primaryRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 2,
    paddingBottom: 2,
    gap: 8,
  },
  mobileGroup: {
    minWidth: 176,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingLeft: 8,
  },
  mobileSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  mobileGroupTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  tab: {
    width: 78,
    minHeight: 66,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primaryTab: {
    flex: 1,
    width: 'auto',
    minWidth: 68,
  },
  tabActive: {
    backgroundColor: COLORS.overlaySoft,
    borderColor: COLORS.primary,
  },
  tabContent: {
    alignItems: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '900',
  },
  fallbackIcon: {
    minWidth: 22,
    height: 22,
    fontSize: 10,
    lineHeight: 22,
    fontWeight: '900',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  fallbackIconActive: {
    color: COLORS.primary,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -1,
    height: 3,
    width: 32,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -2,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.white || '#FFFFFF',
    paddingHorizontal: 4,
  },
  sidebarContainer: {
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingVertical: 10,
    minWidth: 140,
  },
  sidebarPinned: {
    paddingBottom: 8,
  },
  sidebarGroup: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sidebarSectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textMuted,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  sidebarTab: {
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    position: 'relative',
  },
  sidebarTabActive: {
    borderLeftColor: COLORS.primary,
    backgroundColor: COLORS.overlaySoft,
  },
  sidebarTabContent: {
    alignItems: 'center',
    gap: 5,
  },
  sidebarLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  sidebarLabelActive: {
    color: COLORS.primary,
    fontWeight: '900',
  },
  statusSection: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.danger,
    marginBottom: 6,
  },
  statusOnline: {
    backgroundColor: COLORS.success,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMain,
  },
});
