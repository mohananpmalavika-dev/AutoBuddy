import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Receipt } from '../hooks/useReceiptGeneration';

interface ReceiptCardProps {
  receipt: Receipt;
  onPress?: () => void;
  onDownload?: () => void;
  onEmail?: () => void;
  style?: any;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  receipt,
  onPress,
  onDownload,
  onEmail,
  style,
}) => {
  const formattedDate = new Date(receipt.date).toLocaleDateString();
  const formattedTime = new Date(receipt.date).toLocaleTimeString();

  const statusColor = {
    completed: '#4CAF50',
    pending: '#FF9800',
    cancelled: '#F44336',
  }[receipt.status];

  return (
    <Pressable
      style={[styles.card, style]}
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
    >
      <View style={styles.header}>
        <View style={styles.leftSection}>
          <MaterialIcons name="receipt" size={28} color="#2196F3" />
          <View style={styles.info}>
            <Text style={styles.receiptId}>{receipt.id.slice(0, 12)}...</Text>
            <Text style={styles.date}>
              {formattedDate} • {formattedTime}
            </Text>
          </View>
        </View>
        <View style={styles.rightSection}>
          <Text style={styles.fare}>₹{receipt.totalFare.toFixed(2)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{receipt.status}</Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <MaterialIcons name="location_on" size={16} color="#666" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Pickup</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {receipt.pickupLocation}
              </Text>
            </View>
          </View>
          <View style={styles.detailItem}>
            <MaterialIcons name="directions" size={16} color="#666" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Distance</Text>
              <Text style={styles.detailValue}>{receipt.distance} km</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <MaterialIcons name="person" size={16} color="#666" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Driver</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {receipt.driverName}
              </Text>
            </View>
          </View>
          <View style={styles.detailItem}>
            <MaterialIcons name="schedule" size={16} color="#666" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Duration</Text>
              <Text style={styles.detailValue}>{receipt.duration} min</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        {onDownload && (
          <Pressable
            style={styles.actionButton}
            onPress={onDownload}
            android_ripple={{ color: 'rgba(33, 150, 243, 0.2)' }}
          >
            <MaterialIcons name="download" size={18} color="#2196F3" />
            <Text style={styles.actionText}>Download</Text>
          </Pressable>
        )}
        {onEmail && (
          <Pressable
            style={styles.actionButton}
            onPress={onEmail}
            android_ripple={{ color: 'rgba(33, 150, 243, 0.2)' }}
          >
            <MaterialIcons name="email" size={18} color="#2196F3" />
            <Text style={styles.actionText}>Email</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.actionButton}
          onPress={onPress}
          android_ripple={{ color: 'rgba(33, 150, 243, 0.2)' }}
        >
          <MaterialIcons name="arrow_forward" size={18} color="#2196F3" />
          <Text style={styles.actionText}>View</Text>
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
  info: {
    marginLeft: 12,
    flex: 1,
  },
  receiptId: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  date: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  fare: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
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
  },
  detailContent: {
    marginLeft: 8,
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    color: '#999',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#F9F9F9',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
  },
});
