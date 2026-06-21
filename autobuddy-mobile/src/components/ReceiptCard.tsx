import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Receipt } from '../hooks/useReceiptGeneration';

interface ReceiptCardProps {
  receipt: Receipt;
  onPress: (receipt: Receipt) => void;
  onDownload: (receipt: Receipt) => void;
  onEmail: (receipt: Receipt) => void;
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  receipt,
  onPress,
  onDownload,
  onEmail,
}) => {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(receipt)}>
      <View style={styles.header}>
        <View style={styles.receiptInfo}>
          <Text style={styles.receiptNumber}>Receipt #{receipt.receiptNumber}</Text>
          <Text style={styles.date}>{receipt.date}</Text>
        </View>
        <Text style={styles.amount}>${receipt.total.toFixed(2)}</Text>
      </View>

      <View style={styles.routeSection}>
        <View style={styles.routeRow}>
          <MaterialIcons name="location-on" size={16} color="#666" />
          <Text style={styles.routeText} numberOfLines={1}>
            {receipt.pickup}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <MaterialIcons name="location-on" size={16} color="#666" />
          <Text style={styles.routeText} numberOfLines={1}>
            {receipt.dropoff}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.details}>
          <Text style={styles.detailText}>{receipt.distance} mi</Text>
          <Text style={styles.separator}>•</Text>
          <Text style={styles.detailText}>{receipt.vehicleType}</Text>
          <Text style={styles.separator}>•</Text>
          <Text style={styles.detailText}>Driver: {receipt.driver}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onDownload(receipt)}
          >
            <MaterialIcons name="download" size={18} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onEmail(receipt)}
          >
            <MaterialIcons name="mail" size={18} color="#FF6F00" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  receiptInfo: {
    flex: 1,
  },
  receiptNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
  },
  routeSection: {
    marginVertical: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  routeText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailText: {
    fontSize: 11,
    color: '#999',
  },
  separator: {
    marginHorizontal: 4,
    color: '#ddd',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  actionButton: {
    padding: 4,
  },
});
