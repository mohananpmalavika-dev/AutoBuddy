import React, { useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  SafeAreaView,
} from 'react-native';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';

/**
 * ProfileDrawer Component
 * 
 * Slide-in profile drawer with quick access to account settings.
 * Addresses Issue #9: Profile Management Friction
 * 
 * Props:
 *   - visible: boolean
 *   - user: {name, phone, email, rating, avatar, subscription, kyc_status}
 *   - onClose: () => void
 *   - onEditProfile: () => void
 *   - onManageSubscription: () => void
 *   - onUpdateKYC: () => void
 *   - onUpdatePayment: () => void
 *   - onViewDocuments: () => void
 *   - onLogout: () => void
 */
export default function ProfileDrawer({
  visible = false,
  user = null,
  onClose,
  onEditProfile,
  onManageSubscription,
  onUpdateKYC,
  onUpdatePayment,
  onViewDocuments,
  onLogout,
}) {
  const userInfo = useMemo(() => ({
    name: user?.name || 'Driver',
    phone: user?.phone || '',
    email: user?.email || '',
    rating: user?.rating || 4.5,
    avatar: user?.avatar || '',
    subscription: user?.subscription || 'free',
    kycStatus: user?.kyc_status || 'pending',
  }), [user]);

  const kycStatusDisplay = useMemo(() => {
    const status = String(userInfo.kycStatus).toLowerCase();
    const map = {
      pending: { label: '⏳ Pending', color: '#FFA500' },
      approved: { label: '✅ Approved', color: '#6BCF7F' },
      rejected: { label: '❌ Rejected', color: '#FF6B6B' },
      expired: { label: '⚠️ Expired', color: '#FF9800' },
    };
    return map[status] || { label: '❓ Unknown', color: COLORS.gray };
  }, [userInfo.kycStatus]);

  const subscriptionDisplay = useMemo(() => {
    const sub = String(userInfo.subscription).toLowerCase();
    const map = {
      free: { label: 'Free Tier', color: '#95E1D3', icon: '📌' },
      premium: { label: 'Premium', color: '#FFD93D', icon: '⭐' },
      pro: { label: 'Pro', color: '#FF6B6B', icon: '🔥' },
    };
    return map[sub] || { label: 'Unknown', color: COLORS.gray, icon: '?' };
  }, [userInfo.subscription]);

  const handleClose = useCallback(() => {
    if (typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);

  const profileMenuItems = [
    {
      icon: '✏️',
      label: 'Edit Profile',
      subtext: 'Name, phone, preferences',
      onPress: onEditProfile,
    },
    {
      icon: '💳',
      label: 'Payment Methods',
      subtext: 'Bank, UPI, card settings',
      onPress: onUpdatePayment,
    },
    {
      icon: '📋',
      label: 'KYC & Documents',
      subtext: `Status: ${kycStatusDisplay.label}`,
      onPress: onUpdateKYC,
      badge: kycStatusDisplay,
    },
    {
      icon: '⭐',
      label: 'Subscription',
      subtext: `Current: ${subscriptionDisplay.label}`,
      onPress: onManageSubscription,
      badge: subscriptionDisplay,
    },
    {
      icon: '📁',
      label: 'My Documents',
      subtext: 'License, insurance, etc.',
      onPress: onViewDocuments,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Profile</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Profile Info Card */}
          <View style={styles.profileCard}>
            <View style={styles.avatarSection}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {userInfo.name?.charAt(0)?.toUpperCase() || 'D'}
                </Text>
              </View>
              <View style={styles.profileDetails}>
                <Text style={styles.profileName}>{userInfo.name}</Text>
                <Text style={styles.profilePhone}>{userInfo.phone}</Text>
                <View style={styles.ratingRow}>
                  <Text style={styles.rating}>⭐ {userInfo.rating.toFixed(1)}</Text>
                  <Text style={styles.profileEmail}>{userInfo.email}</Text>
                </View>
              </View>
            </View>

            {/* Subscription & KYC Status */}
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, { backgroundColor: `${subscriptionDisplay.color}20` }]}>
                <Text style={styles.statusIcon}>{subscriptionDisplay.icon}</Text>
                <Text style={[styles.statusLabel, { color: subscriptionDisplay.color }]}>
                  {subscriptionDisplay.label}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${kycStatusDisplay.color}20` }]}>
                <Text style={[styles.statusLabel, { color: kycStatusDisplay.color }]}>
                  {kycStatusDisplay.label}
                </Text>
              </View>
            </View>
          </View>

          {/* Menu Items */}
          <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
            {profileMenuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.menuItem, index === profileMenuItems.length - 1 && styles.menuItemLast]}
                onPress={item.onPress}
                disabled={!item.onPress}>
                <View style={styles.menuItemLeft}>
                  <Text style={styles.menuItemIcon}>{item.icon}</Text>
                  <View style={styles.menuItemText}>
                    <Text style={styles.menuItemLabel}>{item.label}</Text>
                    <Text style={styles.menuItemSubtext}>{item.subtext}</Text>
                  </View>
                </View>
                {item.badge && (
                  <View style={[styles.menuItemBadge, { backgroundColor: `${item.badge.color}20` }]}>
                    <Text style={[styles.menuItemBadgeText, { color: item.badge.color }]}>
                      {item.badge.label}
                    </Text>
                  </View>
                )}
                <Text style={styles.menuItemChevron}>›</Text>
              </TouchableOpacity>
            ))}

            {/* Logout Button */}
            <TouchableOpacity
              style={[styles.menuItem, styles.logoutButton]}
              onPress={onLogout}>
              <View style={styles.menuItemLeft}>
                <Text style={styles.logoutIcon}>🚪</Text>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemLabel, styles.logoutLabel]}>Logout</Text>
                  <Text style={styles.menuItemSubtext}>Sign out from this device</Text>
                </View>
              </View>
              <Text style={[styles.menuItemChevron, styles.logoutChevron]}>›</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    ...TYPOGRAPHY.headline5,
    fontWeight: '600',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: COLORS.textSecondary,
  },
  profileCard: {
    margin: 16,
    padding: 16,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    ...SHADOWS.card,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.white,
  },
  profileDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  profileName: {
    ...TYPOGRAPHY.headline6,
    fontWeight: '600',
    marginBottom: 4,
  },
  profilePhone: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rating: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: '#FFA500',
  },
  profileEmail: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  statusBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  statusIcon: {
    fontSize: 16,
  },
  statusLabel: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  menuContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemIcon: {
    fontSize: 24,
    marginRight: 12,
    width: 28,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemLabel: {
    ...TYPOGRAPHY.body2,
    fontWeight: '600',
    marginBottom: 2,
  },
  menuItemSubtext: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  menuItemBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginHorizontal: 8,
  },
  menuItemBadgeText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  menuItemChevron: {
    fontSize: 20,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  logoutButton: {
    marginTop: 16,
    marginBottom: 32,
    backgroundColor: '#FFE8E8',
    borderBottomWidth: 0,
  },
  logoutLabel: {
    color: '#FF6B6B',
  },
  logoutIcon: {
    fontSize: 24,
  },
  logoutChevron: {
    color: '#FF6B6B',
  },
});
