import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { InsuranceClaim } from '../hooks/useInsuranceCoverage';

interface InsuranceClaimCardProps {
  claim: InsuranceClaim;
  onPress?: () => void;
  onStatusChange?: (newStatus: InsuranceClaim['status']) => void;
  style?: any;
}

export const InsuranceClaimCard: React.FC<InsuranceClaimCardProps> = ({
  claim,
  onPress,
  onStatusChange,
  style,
}) => {
  const statusColors = {
    filed: '#2196F3',
    under_review: '#FF9800',
    approved: '#4CAF50',
    rejected: '#F44336',
    settled: '#9C27B0',
  };

  const statusIcons = {
    filed: 'assignment',
    under_review: 'hourglass_empty',
    approved: 'check_circle',
    rejected: 'cancel',
    settled: 'done_all',
  };

  const incidentTypeLabels: Record<InsuranceClaim['incidentType'], string> = {
    accident: 'Accident',
    theft: 'Theft',
    damage: 'Damage',
    injury: 'Injury',
    property_damage: 'Property Damage',
    other: 'Other',
  };

  const formattedDate = new Date(claim.date).toLocaleDateString();
  const statusColor = statusColors[claim.status];

  return (
    <Pressable
      style={[styles.card, style]}
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
    >
      <View style={styles.header}>
        <View style={styles.leftSection}>
          <View style={[styles.iconContainer, { backgroundColor: statusColor }]}>
            <MaterialIcons
              name={statusIcons[claim.status] as any}
              size={24}
              color="white"
            />
          </View>
          <View style={styles.info}>
            <Text style={styles.claimNumber}>{claim.claimNumber}</Text>
            <Text style={styles.incidentType}>
              {incidentTypeLabels[claim.incidentType]}
            </Text>
          </View>
        </View>
        <View style={styles.rightSection}>
          <Text style={styles.amount}>₹{claim.amount.toFixed(2)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{claim.status.replace('_', ' ')}</Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <MaterialIcons name="calendar_today" size={14} color="#666" />
            <Text style={styles.detailLabel}>{formattedDate}</Text>
          </View>
          <View style={styles.detailItem}>
            <MaterialIcons name="location_on" size={14} color="#666" />
            <Text style={styles.detailLabel} numberOfLines={1}>
              {claim.location}
            </Text>
          </View>
        </View>

        <Text style={styles.description} numberOfLines={2}>
          {claim.description}
        </Text>

        {claim.approvedAmount !== undefined && claim.approvedAmount > 0 && (
          <View style={styles.approvedAmount}>
            <MaterialIcons name="check_circle" size={14} color="#4CAF50" />
            <Text style={styles.approvedAmountText}>
              Approved: ₹{claim.approvedAmount.toFixed(2)}
            </Text>
          </View>
        )}

        {claim.rejectionReason && (
          <View style={styles.rejectionBox}>
            <MaterialIcons name="info" size={14} color="#F44336" />
            <Text style={styles.rejectionText} numberOfLines={2}>
              {claim.rejectionReason}
            </Text>
          </View>
        )}

        {claim.evidence && claim.evidence.photos.length > 0 && (
          <View style={styles.evidenceBox}>
            <MaterialIcons name="image" size={14} color="#2196F3" />
            <Text style={styles.evidenceText}>
              {claim.evidence.photos.length} photo{claim.evidence.photos.length !== 1 ? 's' : ''} attached
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.actionButton}
          onPress={onPress}
          android_ripple={{ color: 'rgba(33, 150, 243, 0.2)' }}
        >
          <MaterialIcons name="arrow_forward" size={16} color="#2196F3" />
          <Text style={styles.actionText}>View Details</Text>
        </Pressable>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    marginLeft: 12,
    flex: 1,
  },
  claimNumber: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  incidentType: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: 'white',
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  details: {
    padding: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666',
  },
  description: {
    fontSize: 12,
    color: '#666',
    marginVertical: 8,
  },
  approvedAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 4,
  },
  approvedAmountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2E7D32',
  },
  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 4,
  },
  rejectionText: {
    fontSize: 11,
    color: '#C62828',
    flex: 1,
  },
  evidenceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 4,
  },
  evidenceText: {
    fontSize: 11,
    color: '#1565C0',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#F9F9F9',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  actionText: {
    fontSize: 11,
    color: '#2196F3',
    fontWeight: '600',
  },
});
