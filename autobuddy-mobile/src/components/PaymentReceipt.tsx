import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Share,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';

export interface RideReceipt {
  transactionId: string;
  rideId: string;
  amount: number;
  subtotal: number;
  taxes: number;
  discount: number;
  paymentMethod: string;
  chargeId: string;
  receiptUrl: string;
  timestamp: string;
  driverName?: string;
  driverRating?: number;
  pickup: string;
  dropoff: string;
  distance: number;
  duration: number;
}

interface PaymentReceiptProps {
  receipt: RideReceipt;
  onClose: () => void;
}

export function PaymentReceipt({ receipt, onClose }: PaymentReceiptProps) {
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Receipt for ride from ${receipt.pickup} to ${receipt.dropoff}\nAmount: ₹${receipt.amount}\nTransaction ID: ${receipt.transactionId}`,
        url: receipt.receiptUrl,
        title: 'Ride Receipt',
      });
    } catch (error) {
      console.error('Error sharing receipt:', error);
    }
  };

  const handleViewReceipt = async () => {
    try {
      // Open receipt PDF or web view using the receiptUrl
      if (receipt.receiptUrl) {
        await Linking.openURL(receipt.receiptUrl);
      } else {
        console.warn('No receipt URL available');
      }
    } catch (error) {
      console.error('Error opening receipt:', error);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <MaterialIcons name="check-circle" size={48} color="#4CAF50" />
          <Text style={styles.title}>Payment Confirmed</Text>
          <Text style={styles.subtitle}>
            {new Date(receipt.timestamp).toLocaleDateString()}
          </Text>
        </View>

        {/* Amount */}
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Amount Charged</Text>
          <Text style={styles.amount}>₹{receipt.amount.toFixed(2)}</Text>
          <Text style={styles.paymentMethod}>{receipt.paymentMethod}</Text>
        </View>

        {/* Fare Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fare Breakdown</Text>

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Subtotal</Text>
            <Text style={styles.breakdownValue}>
              ₹{receipt.subtotal.toFixed(2)}
            </Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Taxes & Fees</Text>
            <Text style={styles.breakdownValue}>₹{receipt.taxes.toFixed(2)}</Text>
          </View>

          {receipt.discount > 0 && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Discount</Text>
              <Text style={[styles.breakdownValue, styles.discount]}>
                -₹{receipt.discount.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={[styles.breakdownRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{receipt.amount.toFixed(2)}</Text>
          </View>
        </View>

        {/* Ride Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ride Details</Text>

          <View style={styles.detailRow}>
            <MaterialIcons name="location-on" size={20} color="#2196F3" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Pickup</Text>
              <Text style={styles.detailValue}>{receipt.pickup}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <MaterialIcons name="flag" size={20} color="#2196F3" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Dropoff</Text>
              <Text style={styles.detailValue}>{receipt.dropoff}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>{receipt.distance} km</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Duration</Text>
              <Text style={styles.statValue}>
                {Math.round(receipt.duration / 60)} min
              </Text>
            </View>
          </View>
        </View>

        {/* Transaction Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction Info</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Transaction ID</Text>
            <Text style={styles.infoValue}>{receipt.transactionId}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Charge ID</Text>
            <Text style={styles.infoValue}>{receipt.chargeId}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ride ID</Text>
            <Text style={styles.infoValue}>{receipt.rideId}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.actionButton} onPress={handleViewReceipt}>
          <MaterialIcons name="file-download" size={20} color="#2196F3" />
          <Text style={styles.actionButtonText}>View Receipt</Text>
        </Pressable>

        <Pressable style={styles.actionButton} onPress={handleShare}>
          <MaterialIcons name="share" size={20} color="#2196F3" />
          <Text style={styles.actionButtonText}>Share</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.closeButton]}
          onPress={onClose}
        >
          <MaterialIcons name="check" size={20} color="#fff" />
          <Text style={[styles.actionButtonText, styles.closeButtonText]}>
            Done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  amountBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  amountLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  amount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
  },
  paymentMethod: {
    fontSize: 12,
    color: '#2196F3',
    marginTop: 8,
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#666',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  discount: {
    color: '#4CAF50',
  },
  totalRow: {
    paddingVertical: 12,
    borderBottomWidth: 0,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailContent: {
    flex: 1,
    marginLeft: 12,
  },
  detailLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
  },
  infoValue: {
    fontSize: 12,
    color: '#000',
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    gap: 6,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2196F3',
  },
  closeButton: {
    backgroundColor: '#2196F3',
  },
  closeButtonText: {
    color: '#fff',
  },
});

export default PaymentReceipt;
