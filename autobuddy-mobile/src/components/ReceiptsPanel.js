import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

/**
 * ReceiptsPanel - Ride receipts and billing history
 * Past receipts, invoices, payment history
 */
export default function ReceiptsPanel({ token }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('all'); // all, month, quarter, year

  const fetchReceipts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest(`/passengers/receipts?period=${filterPeriod}`, { token });
      setReceipts(data?.receipts || []);
    } catch (err) {
      setError(err.message || 'Failed to load receipts');
    } finally {
      setLoading(false);
    }
  }, [filterPeriod, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReceipts().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchReceipts]);

  const shareTextReceipt = async (receipt) => {
    try {
      await Share.share({
        title: `AutoBuddy Text Receipt - ${receipt.id}`,
        message: [
          `AutoBuddy Receipt #${receipt.id}`,
          `Booking: ${receipt.booking_id}`,
          `Ride: ${receipt.from} -> ${receipt.to}`,
          `Date: ${new Date(receipt.date).toLocaleString()}`,
          `Driver: ${receipt.driver_name}`,
          `Distance: ${receipt.distance_km} km`,
          `Total: INR ${receipt.total}`,
          `Payment: ${receipt.payment_method} (${receipt.payment_status})`,
        ].join('\n'),
      });
    } catch (err) {
      setError(err.message || 'Failed to share text receipt');
    }
  };

  const shareReceipt = async (receipt) => {
    try {
      const shareMessage = `Receipt #${receipt.id}\n\nRide: ${receipt.from} -> ${receipt.to}\nDate: ${new Date(receipt.date).toLocaleDateString()}\nFare: INR ${receipt.total}\n\nDriver: ${receipt.driver_name}\nDistance: ${receipt.distance_km} km`;

      await Share.share({
        message: shareMessage,
        title: `AutoBuddy Receipt - ${receipt.id}`,
      });
    } catch (err) {
      console.log('Share error:', err);
    }
  };

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'failed':
        return '#F44336';
      default:
        return COLORS.textMuted;
    }
  };

  const renderReceiptItem = ({ item }) => (
    <View style={[styles.receiptCard, SHADOWS.card]}>
      <View style={styles.receiptHeader}>
        <View>
          <Text style={styles.receiptId}>{item.id}</Text>
          <Text style={styles.receiptDate}>{new Date(item.date).toLocaleDateString()} · {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getPaymentStatusColor(item.payment_status) + '20' }]}>
          <Text style={[styles.statusText, { color: getPaymentStatusColor(item.payment_status) }]}>
            {item.payment_status === 'completed' ? '✓' : '⏳'} {item.payment_status}
          </Text>
        </View>
      </View>

      <View style={styles.routeInfo}>
        <Text style={styles.routeLocation}>📍 {item.from}</Text>
        <View style={styles.routeLine} />
        <Text style={styles.routeLocation}>📍 {item.to}</Text>
      </View>

      <View style={styles.driverInfo}>
        <Text style={styles.driverName}>Driver: {item.driver_name}</Text>
        <Text style={styles.rideDetails}>{item.distance_km} km · {item.duration_minutes} min</Text>
      </View>

      <View style={styles.fareBreakdown}>
        <View style={styles.fareRow}>
          <Text style={styles.fareLabel}>Base Fare</Text>
          <Text style={styles.fareValue}>INR {item.base_fare}</Text>
        </View>
        <View style={styles.fareRow}>
          <Text style={styles.fareLabel}>Distance ({item.distance_km} km)</Text>
          <Text style={styles.fareValue}>INR {item.distance_fare}</Text>
        </View>
        {item.surge_multiplier > 1 && (
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Surge ({item.surge_multiplier}x)</Text>
            <Text style={styles.fareValue}>INR {((item.distance_fare * item.surge_multiplier) - item.distance_fare).toFixed(0)}</Text>
          </View>
        )}
        <View style={styles.fareRow}>
          <Text style={styles.fareLabel}>Taxes</Text>
          <Text style={styles.fareValue}>INR {item.taxes}</Text>
        </View>
        {item.discount > 0 && (
          <View style={[styles.fareRow, { borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 8 }]}>
            <Text style={[styles.fareLabel, { color: '#4CAF50' }]}>Discount</Text>
            <Text style={[styles.fareValue, { color: '#4CAF50' }]}>-INR {item.discount}</Text>
          </View>
        )}
        <View style={[styles.fareRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>INR {item.total}</Text>
        </View>
      </View>

      <View style={styles.paymentInfo}>
        <Text style={styles.paymentLabel}>Payment Method: {item.payment_method}</Text>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, { flex: 1, marginRight: 8 }]}
          onPress={() => shareReceipt(item)}
        >
          <Text style={styles.actionButtonText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { flex: 1 }]}
          onPress={() => shareTextReceipt(item)}
        >
          <Text style={styles.actionButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            Share Text Receipt
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const totalSpent = receipts.reduce((sum, r) => sum + r.total, 0);
  const averageFare = receipts.length > 0 ? totalSpent / receipts.length : 0;

  if (loading && receipts.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {/* Summary Cards */}
      {receipts.length > 0 && (
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, SHADOWS.card]}>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryValue}>INR {totalSpent.toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryCard, SHADOWS.card]}>
            <Text style={styles.summaryLabel}>Avg. Fare</Text>
            <Text style={styles.summaryValue}>INR {averageFare.toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryCard, SHADOWS.card]}>
            <Text style={styles.summaryLabel}>Rides</Text>
            <Text style={styles.summaryValue}>{receipts.length}</Text>
          </View>
        </View>
      )}

      {/* Filter Period */}
      <View style={styles.filterRow}>
        {['all', 'month', 'quarter', 'year'].map((period) => (
          <TouchableOpacity
            key={period}
            style={[
              styles.filterButton,
              filterPeriod === period && styles.filterButtonActive,
            ]}
            onPress={() => setFilterPeriod(period)}
          >
            <Text
              style={[
                styles.filterButtonText,
                filterPeriod === period && styles.filterButtonTextActive,
              ]}
            >
              {period === 'all' ? 'All Time' : period === 'month' ? 'This Month' : period === 'quarter' ? 'This Quarter' : 'This Year'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Receipts List */}
      {receipts.length > 0 ? (
        <View style={styles.receiptsSection}>
          <FlatList
            scrollEnabled={false}
            data={receipts}
            keyExtractor={(item) => item.id}
            renderItem={renderReceiptItem}
          />
        </View>
      ) : (
        <View style={[styles.emptyBlock, SHADOWS.card]}>
          <Text style={styles.emptyText}>🧾 No receipts found</Text>
          <Text style={styles.emptySubtext}>Your ride receipts will appear here</Text>
        </View>
      )}

      {/* Information Card */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>About Receipts</Text>
        <Text style={styles.infoText}>
          • Each ride generates an automatic receipt
        </Text>
        <Text style={styles.infoText}>
          • Text receipts include detailed fare breakdown
        </Text>
        <Text style={styles.infoText}>
          • Share text receipts via email or messaging
        </Text>
        <Text style={styles.infoText}>
          • PDF export is not available yet
        </Text>
        <Text style={styles.infoText}>
          • Receipts are available for 2 years
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  summaryRow: { flexDirection: 'row', marginBottom: 16, justifyContent: 'space-between' },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  summaryLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  summaryValue: { fontSize: 14, fontWeight: 'bold', color: COLORS.primary, marginTop: 4 },
  filterRow: { flexDirection: 'row', marginBottom: 16, flexWrap: 'wrap' },
  filterButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  filterButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterButtonText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  filterButtonTextActive: { color: '#fff' },
  receiptsSection: { marginBottom: 16 },
  receiptCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  receiptId: { fontSize: 14, fontWeight: 'bold', color: COLORS.text },
  receiptDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '600' },
  routeInfo: { marginBottom: 12 },
  routeLocation: { fontSize: 12, color: COLORS.text, fontWeight: '500', marginBottom: 4 },
  routeLine: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  driverInfo: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  driverName: { fontSize: 12, color: COLORS.text, fontWeight: '500', marginBottom: 2 },
  rideDetails: { fontSize: 11, color: COLORS.textMuted },
  fareBreakdown: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  fareLabel: { fontSize: 12, color: COLORS.text },
  fareValue: { fontSize: 12, color: COLORS.text, fontWeight: '500' },
  totalRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  totalLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.text },
  totalValue: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary },
  paymentInfo: { marginBottom: 12 },
  paymentLabel: { fontSize: 11, color: COLORS.textMuted },
  actionButtons: { flexDirection: 'row' },
  actionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  actionButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  emptyBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 32,
    marginBottom: 16,
    alignItems: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  emptySubtext: { fontSize: 12, color: COLORS.textMuted },
  infoBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  infoText: { fontSize: 12, color: COLORS.text, lineHeight: 18, marginBottom: 4 },
  errorText: { color: '#F44336', fontSize: 12, marginBottom: 12, fontWeight: '600' },
});
