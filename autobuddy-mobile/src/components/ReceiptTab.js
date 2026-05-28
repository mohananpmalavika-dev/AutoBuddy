import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

function formatMoney(value) {
  const amount = Number(value || 0);
  return `INR ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}

function formatDate(value) {
  if (!value) {
    return 'Date unavailable';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }
  return date.toLocaleString();
}

export default function ReceiptTab({ bookingId, token }) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookingId || !token) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      apiRequest(`/bookings/${bookingId}/receipt`, { token })
        .then((data) => {
          if (!cancelled) {
            setReceipt(data);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err.message || 'Failed to load receipt');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookingId, token]);

  const shareReceipt = async () => {
    if (!receipt) {
      return;
    }
    const lines = [
      `AutoBuddy Receipt ${receipt.id || ''}`.trim(),
      `Booking: ${receipt.booking_id || receipt.bookingId || bookingId}`,
      `Date: ${formatDate(receipt.date)}`,
      `Status: ${receipt.status || 'unknown'}`,
      `Ride: ${receipt.from || 'Pickup'} -> ${receipt.to || 'Drop'}`,
      `Total: ${formatMoney(receipt.total)}`,
      `Payment: ${receipt.payment_method || 'cash'} (${receipt.payment_status || 'pending'})`,
      receipt.dispute_reference ? `Dispute reference: ${receipt.dispute_reference}` : '',
    ].filter(Boolean);
    await Share.share({ title: 'AutoBuddy Text Receipt', message: lines.join('\n') });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.muted}>Loading receipt...</Text>
      </View>
    );
  }

  if (error) {
    return <Text style={styles.errorText}>{error}</Text>;
  }

  if (!receipt) {
    return <Text style={styles.muted}>No receipt data available.</Text>;
  }

  return (
    <View style={[styles.card, SHADOWS.soft]}>
      <Text style={styles.title}>Receipt</Text>
      <Text style={styles.meta}>Booking {receipt.booking_id || receipt.bookingId || bookingId}</Text>
      <View style={styles.divider} />
      <View style={styles.row}>
        <Text style={styles.label}>Date</Text>
        <Text style={styles.value}>{formatDate(receipt.date)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{String(receipt.status || 'unknown').replace(/_/g, ' ')}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Route</Text>
        <Text style={styles.value}>{receipt.from || 'Pickup'}{' -> '}{receipt.to || 'Drop'}</Text>
      </View>
      {Array.isArray(receipt.breakdown) && receipt.breakdown.length > 0 && (
        <View style={styles.breakdown}>
          <Text style={styles.sectionTitle}>Fare breakdown</Text>
          {receipt.breakdown.map((item, index) => (
            <View key={`${item.label || 'line'}-${index}`} style={styles.row}>
              <Text style={styles.label}>{item.label || 'Fare'}</Text>
              <Text style={styles.value}>{formatMoney(item.amount)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatMoney(receipt.total)}</Text>
      </View>
      {!!receipt.dispute_reference && (
        <Text style={styles.dispute}>Dispute reference: {receipt.dispute_reference}</Text>
      )}
      <TouchableOpacity style={styles.shareButton} onPress={shareReceipt} accessibilityRole="button">
        <Text style={styles.shareButtonText}>Share Text Receipt</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 14,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  title: {
    color: COLORS.textMain,
    fontSize: 16,
    fontWeight: '800',
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 5,
  },
  label: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  value: {
    flex: 1.4,
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  breakdown: {
    marginTop: 8,
  },
  sectionTitle: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 8,
    paddingTop: 10,
  },
  totalLabel: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '900',
  },
  totalValue: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  dispute: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
  muted: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    margin: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
    margin: 16,
  },
  shareButton: {
    marginTop: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
