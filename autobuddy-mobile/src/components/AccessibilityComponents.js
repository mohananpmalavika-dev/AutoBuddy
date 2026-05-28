import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';
import {
  getExpiryStatus,
  getExpiryMessage,
  getExpiryColor,
  getCriticalDocuments,
  getExpiredDocuments,
} from '../lib/documentExpiryUtils';

/**
 * DocumentStatusBadge - Shows document status with both color and text
 * Improves accessibility by not relying on color alone
 */
export function DocumentStatusBadge({ status, expiryDate, requiresExpiry }) {
  if (!requiresExpiry || !expiryDate) {
    return null;
  }

  const expiryStatus = getExpiryStatus(expiryDate);
  const color = getExpiryColor(expiryDate);
  const message = getExpiryMessage(expiryDate);

  const getStatusIcon = () => {
    switch (expiryStatus) {
      case 'expired':
        return '❌';
      case 'critical':
        return '⏰';
      case 'warning':
        return '📅';
      case 'valid':
        return '✅';
      default:
        return '❓';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'pending':
        return 'Pending';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  };

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeIcon}>{getStatusIcon()}</Text>
      <View style={styles.badgeText}>
        <Text style={styles.badgeTitle}>{getStatusLabel()}</Text>
        <Text style={styles.badgeSubtitle}>{message}</Text>
      </View>
    </View>
  );
}

/**
 * DocumentExpiryBanner - Shows alert if any documents are expiring soon
 */
export function DocumentExpiryBanner({ documents }) {
  const criticalDocs = getCriticalDocuments(documents);
  const expiredDocs = getExpiredDocuments(documents);

  if (expiredDocs.length > 0) {
    return (
      <View style={[styles.banner, styles.bannerError]}>
        <Text style={styles.bannerIcon}>🚨</Text>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>
            {expiredDocs.length} document{expiredDocs.length !== 1 ? 's' : ''} expired
          </Text>
          <Text style={styles.bannerText}>
            {expiredDocs.map((d) => d.label).join(', ')} - Please renew immediately
          </Text>
        </View>
      </View>
    );
  }

  if (criticalDocs.length > 0) {
    return (
      <View style={[styles.banner, styles.bannerWarning]}>
        <Text style={styles.bannerIcon}>⏰</Text>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>
            {criticalDocs.length} document{criticalDocs.length !== 1 ? 's' : ''} expiring soon
          </Text>
          <Text style={styles.bannerText}>
            {criticalDocs.map((d) => d.label).join(', ')} - Renew within 7 days
          </Text>
        </View>
      </View>
    );
  }

  return null;
}

/**
 * UploadProgressIndicator - Shows upload progress with percentage
 */
export function UploadProgressIndicator({ progress, isUploading }) {
  if (!isUploading) {
    return null;
  }

  const percentage = Math.round((progress || 0) * 100);

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${percentage}%` }]} />
      </View>
      <Text style={styles.progressText}>{percentage}%</Text>
    </View>
  );
}

/**
 * StatusIndicator - Generic status indicator with text and color
 */
export function StatusIndicator({
  status,
  label,
  color,
  icon,
  accessibilityLabel,
}) {
  const getIcon = () => {
    if (icon) return icon;
    
    switch (status) {
      case 'verified':
      case 'approved':
      case 'active':
        return '✅';
      case 'pending':
      case 'processing':
        return '⏳';
      case 'rejected':
      case 'inactive':
        return '❌';
      case 'warning':
        return '⚠️';
      default:
        return '❓';
    }
  };

  const displayColor = color || getColorForStatus(status);

  return (
    <View
      style={[styles.statusIndicator, { backgroundColor: displayColor }]}
      accessibilityLabel={accessibilityLabel || `${label}: ${status}`}
      accessible
    >
      <Text style={styles.statusIcon}>{getIcon()}</Text>
      <Text style={styles.statusLabel}>{label}</Text>
    </View>
  );
}

function getColorForStatus(status) {
  switch (status) {
    case 'verified':
    case 'approved':
    case 'active':
      return COLORS.success;
    case 'pending':
    case 'processing':
      return COLORS.warning;
    case 'rejected':
    case 'inactive':
      return COLORS.error;
    default:
      return COLORS.textMuted;
  }
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  badgeIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  badgeText: {
    flex: 1,
  },
  badgeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  badgeSubtitle: {
    fontSize: 12,
    color: '#333',
    marginTop: 2,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  bannerError: {
    backgroundColor: '#FFE5E5',
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
  },
  bannerWarning: {
    backgroundColor: '#FFF8E5',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  bannerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  bannerText: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
  },
  progressContainer: {
    marginVertical: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'right',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginVertical: 4,
  },
  statusIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
});
