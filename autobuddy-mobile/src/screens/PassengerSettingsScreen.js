import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, SHADOWS } from '../theme';
import BlockedDriverListView from '../components/BlockedDriverListView';
import useBlockedDrivers from '../hooks/useBlockedDrivers';

/**
 * PassengerSettingsScreen
 * 
 * Passenger settings screen with blocked drivers management.
 * This screen demonstrates how to integrate the BlockedDriverListView component.
 */
export default function PassengerSettingsScreen({ navigation }) {
  const [showBlockedDrivers, setShowBlockedDrivers] = useState(false);
  
  const {
    blockedDrivers,
    loading: blockedLoading,
    blockedCount,
    fetchBlockedDrivers,
    unblockDriver,
  } = useBlockedDrivers();

  // Fetch blocked drivers on mount
  useEffect(() => {
    fetchBlockedDrivers();
  }, [fetchBlockedDrivers]);

  // Handle unblock with success feedback
  const handleUnblock = useCallback(
    async (driverId) => {
      const success = await unblockDriver(driverId);
      if (success) {
        // Optional: Show success toast/notification
        console.log('Driver unblocked successfully');
      }
    },
    [unblockDriver]
  );

  // Handle view profile
  const handleViewProfile = useCallback(
    (driverId) => {
      // Navigate to driver profile screen
      // navigation.navigate('DriverProfile', { driverId });
      console.log('View driver profile:', driverId);
    },
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>👤</Text>
              <Text style={styles.menuText}>Profile Information</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>🔒</Text>
              <Text style={styles.menuText}>Privacy & Security</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>💳</Text>
              <Text style={styles.menuText}>Payment Methods</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Ride Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ride Preferences</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>⭐</Text>
              <Text style={styles.menuText}>Favorite Drivers</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>📍</Text>
              <Text style={styles.menuText}>Saved Places</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          {/* Blocked Drivers - Main Integration Point */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => setShowBlockedDrivers(true)}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>🚫</Text>
              <Text style={styles.menuText}>Blocked Drivers</Text>
            </View>
            <View style={styles.menuItemRight}>
              {blockedLoading ? (
                <ActivityIndicator size="small" color={COLORS.textSecondary} />
              ) : blockedCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{blockedCount}</Text>
                </View>
              ) : null}
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>🔔</Text>
              <Text style={styles.menuText}>Push Notifications</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>📧</Text>
              <Text style={styles.menuText}>Email Preferences</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>❓</Text>
              <Text style={styles.menuText}>Help Center</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>📞</Text>
              <Text style={styles.menuText}>Contact Support</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuIcon}>ℹ️</Text>
              <Text style={styles.menuText}>About</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={[styles.menuItem, styles.logoutButton]}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Blocked Drivers Modal */}
      <BlockedDriverListView
        visible={showBlockedDrivers}
        blockedDrivers={blockedDrivers}
        loading={blockedLoading}
        onUnblock={handleUnblock}
        onClose={() => setShowBlockedDrivers(false)}
        onViewProfile={handleViewProfile}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  headerTitle: {
    ...TYPOGRAPHY.headline4,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  section: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuIcon: {
    fontSize: 20,
    marginRight: SPACING.md,
  },
  menuText: {
    ...TYPOGRAPHY.body1,
    color: COLORS.textPrimary,
  },
  chevron: {
    ...TYPOGRAPHY.headline6,
    color: COLORS.textSecondary,
    fontWeight: '300',
  },
  badge: {
    backgroundColor: COLORS.error,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 12,
  },
  logoutButton: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    borderBottomWidth: 0,
  },
  logoutText: {
    ...TYPOGRAPHY.body1,
    color: COLORS.error,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
