import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useComplianceNotifications } from '../hooks/useComplianceNotifications';

interface ComplianceAlertBannerProps {
  token: string | null;
  userId: string;
  onPress?: () => void;
  userType?: 'passenger' | 'driver';
  style?: any;
}

export const ComplianceAlertBanner: React.FC<ComplianceAlertBannerProps> = ({
  token,
  userId,
  onPress,
  userType = 'passenger',
  style,
}) => {
  const { getCriticalNotifications, getUndeliveredNotifications } =
    useComplianceNotifications(token, userId);

  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    const criticals = getCriticalNotifications();
    setCriticalCount(criticals.length);
  }, [getCriticalNotifications]);

  if (criticalCount === 0) return null;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, style]}
      android_ripple={{ color: 'rgba(0, 0, 0, 0.1)' }}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialIcons name="warning" size={20} color="white" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {criticalCount} Compliance Alert{criticalCount !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.message}>Requires your attention</Text>
        </View>
        <MaterialIcons name="arrow_forward" size={20} color="#FF6F00" />
      </View>
    </Pressable>
  );
};

interface ComplianceInfoCardProps {
  token: string | null;
  userId: string;
  onNavigateToCompliance?: () => void;
}

export const ComplianceInfoCard: React.FC<ComplianceInfoCardProps> = ({
  token,
  userId,
  onNavigateToCompliance,
}) => {
  const { notifications, getCriticalNotifications } = useComplianceNotifications(
    token,
    userId
  );

  const criticalNotifs = getCriticalNotifications();
  const totalNotifs = notifications.length;

  if (totalNotifs === 0) return null;

  return (
    <Pressable
      onPress={onNavigateToCompliance}
      style={styles.cardContainer}
      android_ripple={{ color: 'rgba(0, 0, 0, 0.05)' }}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIconContainer}>
          <MaterialIcons name="security" size={24} color="#2196F3" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Compliance Updates</Text>
          <Text style={styles.cardSubtitle}>
            {totalNotifs} notification{totalNotifs !== 1 ? 's' : ''}
          </Text>
        </View>
        {criticalNotifs.length > 0 && (
          <View style={styles.cardBadge}>
            <Text style={styles.cardBadgeText}>{criticalNotifs.length}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterText}>
          {criticalNotifs.length > 0
            ? `${criticalNotifs.length} critical alert${criticalNotifs.length !== 1 ? 's' : ''}`
            : 'All compliance items up to date'}
        </Text>
        <MaterialIcons name="chevron_right" size={20} color="#2196F3" />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF3E0',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6F00',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  message: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  cardContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginHorizontal: 12,
    marginVertical: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  cardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  cardBadge: {
    backgroundColor: '#F44336',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  cardBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  cardFooterText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
  },
});
