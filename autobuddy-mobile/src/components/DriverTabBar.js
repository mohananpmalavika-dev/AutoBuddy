import React, { useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
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

const ICON_KIND_BY_TAB = {
  requests: 'car',
  upcoming: 'calendar',
  earnings: 'wallet',
  support: 'support',
  history: 'clock',
  notifications: 'bell',
  profile: 'person',
  documents: 'document',
  vehicle: 'car',
  trust: 'shield',
  subscription: 'card',
  fare: 'tag',
  analytics: 'chart',
  reviews: 'medal',
  targets: 'target',
  payout: 'wallet',
  paymethods: 'card',
  blocked: 'block',
  safety: 'shield',
  spin: 'spark',
  filters: 'filter',
  maintenance: 'wrench',
  actions: 'bolt',
  settings: 'gear',
  pooling: 'people',
  taxreports: 'document',
  favorites: 'heart',
  shifts: 'calendar',
  badges: 'medal',
  tier: 'medal',
  expiry: 'document',
  appeals: 'shield',
  referral: 'people',
};

function LineIcon({ kind, color, size }) {
  const scale = size / 22;
  const px = (value) => Math.max(1, Math.round(value * scale));

  const line = (style) => <View style={[styles.iconLine, { backgroundColor: color }, style]} />;
  const circle = (style) => <View style={[styles.iconCircle, { borderColor: color }, style]} />;
  const fill = (style) => <View style={[styles.iconFill, { backgroundColor: color }, style]} />;
  const box = (style) => <View style={[styles.iconBox, { borderColor: color }, style]} />;

  switch (kind) {
    case 'car':
      return (
        <>
          {box({ left: px(3), top: px(8), width: px(16), height: px(7), borderRadius: px(4) })}
          {line({ left: px(6), top: px(5), width: px(10), transform: [{ rotate: '0deg' }] })}
          {fill({ left: px(5), top: px(16), width: px(4), height: px(4), borderRadius: px(2) })}
          {fill({ right: px(5), top: px(16), width: px(4), height: px(4), borderRadius: px(2) })}
        </>
      );
    case 'calendar':
      return (
        <>
          {box({ left: px(4), top: px(5), width: px(14), height: px(14), borderRadius: px(3) })}
          {line({ left: px(5), top: px(9), width: px(12) })}
          {fill({ left: px(7), top: px(3), width: px(2), height: px(4), borderRadius: px(1) })}
          {fill({ right: px(7), top: px(3), width: px(2), height: px(4), borderRadius: px(1) })}
        </>
      );
    case 'wallet':
    case 'card':
      return (
        <>
          {box({ left: px(3), top: px(6), width: px(16), height: px(11), borderRadius: px(3) })}
          {line({ left: px(5), top: kind === 'card' ? px(10) : px(9), width: px(12) })}
          {fill({ right: px(6), top: px(13), width: px(3), height: px(3), borderRadius: px(2) })}
        </>
      );
    case 'support':
      return (
        <>
          {circle({ left: px(4), top: px(4), width: px(14), height: px(14), borderRadius: px(7) })}
          {line({ left: px(2), top: px(11), width: px(4) })}
          {line({ right: px(2), top: px(11), width: px(4) })}
          {line({ right: px(5), top: px(16), width: px(6) })}
        </>
      );
    case 'clock':
      return (
        <>
          {circle({ left: px(3), top: px(3), width: px(16), height: px(16), borderRadius: px(8) })}
          {line({ left: px(10), top: px(7), width: px(2), height: px(6) })}
          {line({ left: px(11), top: px(12), width: px(5) })}
        </>
      );
    case 'bell':
      return (
        <>
          {box({ left: px(5), top: px(6), width: px(12), height: px(10), borderRadius: px(6) })}
          {line({ left: px(4), top: px(16), width: px(14) })}
          {fill({ left: px(10), top: px(18), width: px(3), height: px(3), borderRadius: px(2) })}
        </>
      );
    case 'person':
      return (
        <>
          {circle({ left: px(8), top: px(3), width: px(7), height: px(7), borderRadius: px(4) })}
          {box({ left: px(5), top: px(12), width: px(12), height: px(7), borderRadius: px(6) })}
        </>
      );
    case 'document':
      return (
        <>
          {box({ left: px(5), top: px(3), width: px(12), height: px(16), borderRadius: px(2) })}
          {line({ left: px(8), top: px(8), width: px(6) })}
          {line({ left: px(8), top: px(12), width: px(6) })}
          {line({ left: px(8), top: px(16), width: px(4) })}
        </>
      );
    case 'shield':
      return (
        <>
          {box({ left: px(5), top: px(3), width: px(12), height: px(16), borderRadius: px(5) })}
          {line({ left: px(8), top: px(11), width: px(7), transform: [{ rotate: '-35deg' }] })}
        </>
      );
    case 'tag':
      return (
        <>
          {box({ left: px(6), top: px(6), width: px(11), height: px(11), borderRadius: px(2), transform: [{ rotate: '45deg' }] })}
          {fill({ left: px(9), top: px(8), width: px(3), height: px(3), borderRadius: px(2) })}
        </>
      );
    case 'chart':
      return (
        <>
          {fill({ left: px(4), top: px(12), width: px(3), height: px(7), borderRadius: px(1) })}
          {fill({ left: px(10), top: px(8), width: px(3), height: px(11), borderRadius: px(1) })}
          {fill({ left: px(16), top: px(5), width: px(3), height: px(14), borderRadius: px(1) })}
        </>
      );
    case 'target':
      return (
        <>
          {circle({ left: px(3), top: px(3), width: px(16), height: px(16), borderRadius: px(8) })}
          {circle({ left: px(7), top: px(7), width: px(8), height: px(8), borderRadius: px(4) })}
          {fill({ left: px(10), top: px(10), width: px(3), height: px(3), borderRadius: px(2) })}
        </>
      );
    case 'block':
      return (
        <>
          {circle({ left: px(3), top: px(3), width: px(16), height: px(16), borderRadius: px(8) })}
          {line({ left: px(6), top: px(11), width: px(11), transform: [{ rotate: '-35deg' }] })}
        </>
      );
    case 'filter':
      return (
        <>
          {line({ left: px(3), top: px(6), width: px(16) })}
          {line({ left: px(6), top: px(11), width: px(10) })}
          {line({ left: px(9), top: px(16), width: px(4) })}
        </>
      );
    case 'wrench':
      return (
        <>
          {line({ left: px(5), top: px(11), width: px(13), transform: [{ rotate: '-45deg' }] })}
          {circle({ left: px(3), top: px(3), width: px(7), height: px(7), borderRadius: px(4) })}
          {fill({ right: px(4), bottom: px(3), width: px(4), height: px(4), borderRadius: px(2) })}
        </>
      );
    case 'gear':
      return (
        <>
          {circle({ left: px(6), top: px(6), width: px(10), height: px(10), borderRadius: px(5) })}
          {fill({ left: px(10), top: px(2), width: px(3), height: px(4), borderRadius: px(1) })}
          {fill({ left: px(10), bottom: px(2), width: px(3), height: px(4), borderRadius: px(1) })}
          {fill({ left: px(2), top: px(10), width: px(4), height: px(3), borderRadius: px(1) })}
          {fill({ right: px(2), top: px(10), width: px(4), height: px(3), borderRadius: px(1) })}
        </>
      );
    case 'people':
      return (
        <>
          {circle({ left: px(5), top: px(4), width: px(6), height: px(6), borderRadius: px(3) })}
          {circle({ right: px(5), top: px(4), width: px(6), height: px(6), borderRadius: px(3) })}
          {box({ left: px(3), top: px(12), width: px(8), height: px(6), borderRadius: px(4) })}
          {box({ right: px(3), top: px(12), width: px(8), height: px(6), borderRadius: px(4) })}
        </>
      );
    case 'heart':
      return (
        <>
          {circle({ left: px(5), top: px(5), width: px(7), height: px(7), borderRadius: px(4) })}
          {circle({ right: px(5), top: px(5), width: px(7), height: px(7), borderRadius: px(4) })}
          {box({ left: px(7), top: px(9), width: px(8), height: px(8), borderRadius: px(2), transform: [{ rotate: '45deg' }] })}
        </>
      );
    case 'medal':
      return (
        <>
          {line({ left: px(6), top: px(3), width: px(4), transform: [{ rotate: '55deg' }] })}
          {line({ right: px(6), top: px(3), width: px(4), transform: [{ rotate: '-55deg' }] })}
          {circle({ left: px(6), top: px(9), width: px(10), height: px(10), borderRadius: px(5) })}
        </>
      );
    case 'spark':
    case 'bolt':
    default:
      return (
        <>
          {line({ left: px(10), top: px(3), width: px(2), height: px(16) })}
          {line({ left: px(3), top: px(10), width: px(16) })}
          {line({ left: px(6), top: px(6), width: px(10), transform: [{ rotate: '45deg' }] })}
        </>
      );
  }
}

function TabIcon({ tab, active, compact = false }) {
  const color = active ? COLORS.primary : COLORS.textMuted;
  const size = compact ? 22 : 20;
  const kind = ICON_KIND_BY_TAB[tab.key] || 'spark';
  return (
    <View
      style={[styles.iconFrame, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <LineIcon kind={kind} color={color} size={size} />
    </View>
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

function SectionButton({ section, selected, badgeCount, onPress, compact = false }) {
  const badgePhrase = badgeCount ? `, ${badgeCount} attention ${badgeCount === 1 ? 'item' : 'items'}` : '';
  return (
    <TouchableOpacity
      style={[
        compact ? styles.sidebarSectionButton : styles.sectionButton,
        selected && (compact ? styles.sidebarSectionButtonActive : styles.sectionButtonActive),
      ]}
      onPress={() => onPress(section.key)}
      accessibilityRole="button"
      accessibilityLabel={`${section.label} driver tools${badgePhrase}`}
      accessibilityHint={`Show ${section.label.toLowerCase()} driver tools.`}
      accessibilityState={{ selected }}
      hitSlop={HIT_SLOP}>
      <Text
        style={[
          compact ? styles.sidebarSectionButtonText : styles.sectionButtonText,
          selected && (compact ? styles.sidebarSectionButtonTextActive : styles.sectionButtonTextActive),
        ]}
        numberOfLines={1}>
        {section.label}
      </Text>
      <TabBadge count={badgeCount} />
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
      badge: requestCount > 0 ? requestCount : null,
      hint: 'Open active rides and incoming requests.',
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      section: 'drive',
      pinned: true,
      badge: upcomingCount > 0 ? upcomingCount : null,
      hint: 'Open scheduled and upcoming rides.',
    },
    {
      key: 'earnings',
      label: 'Earnings',
      section: 'money',
      pinned: true,
      badge: getBadgeCount('earnings'),
      hint: 'Open earnings, payouts, and withdrawals.',
    },
    {
      key: 'support',
      label: 'Support',
      section: 'safety',
      pinned: true,
      badge: getBadgeCount('support'),
      hint: 'Open driver support and help tickets.',
    },
    {
      key: 'history',
      label: 'History',
      section: 'drive',
      badge: null,
      hint: 'Open completed and past rides.',
    },
    {
      key: 'notifications',
      label: 'Alerts',
      section: 'drive',
      badge: notificationCount > 0 ? notificationCount : null,
      hint: 'Open driver notifications.',
    },
    {
      key: 'profile',
      label: 'Profile',
      section: 'account',
      badge: getBadgeCount('profile'),
      hint: 'Open driver profile details.',
    },
    {
      key: 'documents',
      label: 'Documents',
      section: 'account',
      badge: getBadgeCount('documents'),
      hint: 'Open driver documents.',
    },
    {
      key: 'vehicle',
      label: 'Vehicle',
      section: 'account',
      badge: getBadgeCount('vehicle'),
      hint: 'Open vehicle details.',
    },
    {
      key: 'trust',
      label: 'Trust',
      section: 'account',
      badge: getBadgeCount('trust'),
      hint: 'Open KYC and trust checks.',
    },
    {
      key: 'subscription',
      label: 'Plan',
      section: 'account',
      badge: getBadgeCount('subscription'),
      hint: 'Open subscription status.',
    },
    {
      key: 'fare',
      label: 'Fare',
      section: 'money',
      badge: null,
      hint: 'Open fare pricing controls.',
    },
    {
      key: 'analytics',
      label: 'Analytics',
      section: 'money',
      badge: null,
      hint: 'Open driver analytics.',
    },
    {
      key: 'reviews',
      label: 'Reviews',
      section: 'money',
      badge: getBadgeCount('reviews'),
      hint: 'Open driver ratings and reviews.',
    },
    {
      key: 'targets',
      label: 'Targets',
      section: 'money',
      badge: getBadgeCount('targets'),
      hint: 'Open earning targets and progress.',
    },
    {
      key: 'payout',
      label: 'Payout',
      section: 'money',
      badge: getBadgeCount('payout'),
      hint: 'Open payout methods and schedule.',
    },
    {
      key: 'paymethods',
      label: 'Pay Methods',
      section: 'money',
      badge: getBadgeCount('paymethods'),
      hint: 'Open driver payout methods.',
    },
    {
      key: 'blocked',
      label: 'Blocked',
      section: 'safety',
      badge: null,
      hint: 'Open blocked passengers.',
    },
    {
      key: 'safety',
      label: 'Safety',
      section: 'safety',
      badge: getBadgeCount('safety'),
      hint: 'Open safety tools.',
    },
    {
      key: 'heatmap',
      label: 'Demand Map',
      section: 'drive',
      badge: getBadgeCount('heatmap'),
      hint: 'Open demand hotspots and navigation.',
    },
    {
      key: 'traffic',
      label: 'Traffic',
      section: 'drive',
      badge: getBadgeCount('traffic'),
      hint: 'Open live traffic alerts and routes.',
    },
    {
      key: 'photoVerification',
      label: 'Photo Check',
      section: 'safety',
      badge: getBadgeCount('photoVerification'),
      hint: 'Open driver photo verification.',
    },
    {
      key: 'passengerSafety',
      label: 'Passenger Safety',
      section: 'safety',
      badge: getBadgeCount('passengerSafety'),
      hint: 'Open passenger safety rating.',
    },
    {
      key: 'spin',
      label: 'Spin',
      section: 'tools',
      badge: null,
      hint: 'Open Spin rewards.',
    },
    {
      key: 'filters',
      label: 'Filters',
      section: 'tools',
      badge: getBadgeCount('filters'),
      hint: 'Open ride filter and auto-decline settings.',
    },
    {
      key: 'maintenance',
      label: 'Maintenance',
      section: 'account',
      badge: getBadgeCount('maintenance'),
      hint: 'Open vehicle maintenance and document expiry tools.',
    },
    {
      key: 'actions',
      label: 'Actions',
      section: 'tools',
      badge: null,
      hint: 'Open quick driver actions.',
    },
    {
      key: 'settings',
      label: 'Settings',
      section: 'tools',
      badge: null,
      hint: 'Open driver settings.',
    },
    // TIER 3 FEATURES
    {
      key: 'pooling',
      label: 'Pooling',
      section: 'tools',
      badge: getBadgeCount('pooling'),
      hint: 'Open ride pooling opportunities.',
    },
    {
      key: 'taxreports',
      label: 'Tax Reports',
      section: 'money',
      badge: getBadgeCount('taxreports'),
      hint: 'Open tax reports and summaries.',
    },
    {
      key: 'favorites',
      label: 'Favorites',
      section: 'drive',
      badge: null,
      hint: 'Open favorite passengers.',
    },
    {
      key: 'shifts',
      label: 'Shifts',
      section: 'drive',
      badge: getBadgeCount('shifts'),
      hint: 'Open shift schedules.',
    },
    {
      key: 'badges',
      label: 'Badges',
      section: 'tools',
      badge: getBadgeCount('badges'),
      hint: 'Open earned badges and achievements.',
    },
    // NEW MISSING FEATURES
    {
      key: 'tier',
      label: 'My Tier',
      section: 'account',
      badge: null,
      hint: 'View your driver tier and benefits.',
    },
    {
      key: 'expiry',
      label: 'Document Alerts',
      section: 'account',
      badge: getBadgeCount('expiry'),
      hint: 'View document expiry alerts and renewals.',
    },
    {
      key: 'appeals',
      label: 'Appeals',
      section: 'safety',
      badge: getBadgeCount('appeals'),
      hint: 'Submit suspension appeals.',
    },
    {
      key: 'referral',
      label: 'Referrals',
      section: 'money',
      badge: getBadgeCount('referral'),
      hint: 'Open referral program and earnings.',
    },
  ], [getBadgeCount, notificationCount, requestCount, upcomingCount]);

  const primaryTabs = useMemo(() => tabs.filter((tab) => tab.pinned), [tabs]);
  const groupedTabs = useMemo(() => SECTION_ORDER.map((sectionKey) => ({
    key: sectionKey,
    label: SECTION_LABELS[sectionKey],
    tabs: tabs.filter((tab) => tab.section === sectionKey && !tab.pinned),
  })).filter((section) => section.tabs.length > 0), [tabs]);
  const activeTabSection = useMemo(
    () => tabs.find((tab) => tab.key === activeTab)?.section || 'drive',
    [activeTab, tabs]
  );
  const selectedGroup = useMemo(
    () => groupedTabs.find((section) => section.key === activeTabSection) || groupedTabs[0] || null,
    [activeTabSection, groupedTabs]
  );

  const getSectionBadgeCount = useCallback((section) => {
    const total = section.tabs.reduce((sum, tab) => sum + Number(tab.badge || 0), 0);
    return total > 0 ? total : null;
  }, []);

  const handleTabPress = useCallback((tabKey) => {
    if (typeof onTabChange === 'function') {
      onTabChange(tabKey);
    }
  }, [onTabChange]);

  const handleSectionPress = useCallback((sectionKey) => {
    const section = groupedTabs.find((item) => item.key === sectionKey);
    const firstTabKey = section?.tabs?.[0]?.key;
    if (firstTabKey) {
      handleTabPress(firstTabKey);
    }
  }, [groupedTabs, handleTabPress]);

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
        <View style={styles.sidebarSectionPicker}>
          {groupedTabs.map((section) => (
            <SectionButton
              key={section.key}
              section={section}
              selected={activeTabSection === section.key}
              badgeCount={getSectionBadgeCount(section)}
              onPress={handleSectionPress}
              compact
            />
          ))}
        </View>
        {selectedGroup && (
          <View style={styles.sidebarGroup}>
            <Text style={styles.sidebarSectionLabel}>{selectedGroup.label}</Text>
            {selectedGroup.tabs.map((tab) => (
              <TabButton
                key={tab.key}
                tab={tab}
                active={activeTab === tab.key}
                onPress={handleTabPress}
                compact
              />
            ))}
          </View>
        )}
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
        contentContainerStyle={styles.sectionPickerContent}
        scrollEventThrottle={16}>
        {groupedTabs.map((section) => (
          <SectionButton
            key={section.key}
            section={section}
            selected={activeTabSection === section.key}
            badgeCount={getSectionBadgeCount(section)}
            onPress={handleSectionPress}
          />
        ))}
      </ScrollView>
      {selectedGroup && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}>
          {selectedGroup.tabs.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onPress={handleTabPress}
            />
          ))}
        </ScrollView>
      )}
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
  sectionPickerContent: {
    paddingHorizontal: 2,
    paddingBottom: 8,
    gap: 6,
  },
  sectionButton: {
    minWidth: 78,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    position: 'relative',
  },
  sectionButtonActive: {
    backgroundColor: COLORS.overlaySoft,
    borderColor: COLORS.primary,
  },
  sectionButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  sectionButtonTextActive: {
    color: COLORS.primary,
    fontWeight: '900',
  },
  scrollContent: {
    paddingHorizontal: 2,
    paddingBottom: 2,
    gap: 6,
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
  iconFrame: {
    position: 'relative',
  },
  iconLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 2,
  },
  iconCircle: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  iconBox: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  iconFill: {
    position: 'absolute',
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
  sidebarSectionPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  sidebarSectionButton: {
    minWidth: 56,
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  sidebarSectionButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.overlaySoft,
  },
  sidebarSectionButtonText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  sidebarSectionButtonTextActive: {
    color: COLORS.primary,
    fontWeight: '900',
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
