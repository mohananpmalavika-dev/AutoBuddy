import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import FareBreakdown from './FareBreakdown';
import AddStopModal from './AddStopModal';
import EditDestinationModal from './EditDestinationModal';

/**
 * TripDetailModal - Complete trip details view with receipt and post-ride actions
 * 
 * Shows:
 * - Trip header (ID, date, status, driver info)
 * - Route details (pickup, drop, distance, duration)
 * - Fare breakdown
 * - Payment info
 * - Post-ride action buttons
 */

export default function TripDetailModal({
  visible = false,
  booking = {},
  token,
  onClose,
  onRate,
  onReport,
  onLostItem,
}) {
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [showFareModal, setShowFareModal] = useState(false);
  const [error, setError] = useState('');
  const [showAddStop, setShowAddStop] = useState(false);
  const [showEditDestination, setShowEditDestination] = useState(false);

  const fetchReceipt = useCallback(async () => {
    if (!booking.id) return;
    
    try {
      const data = await apiRequest(`/bookings/${booking.id}/receipt`, { token });
      return data || {};
    } catch (err) {
      throw err;
    }
  }, [booking.id, token]);

  React.useEffect(() => {
    if (!visible) return;

    let isMounted = true;

    const loadReceipt = async () => {
      try {
        setLoading(true);
        setError('');
        setReceipt(null);
        const data = await fetchReceipt();
        if (isMounted) {
          setReceipt(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load receipt');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadReceipt();
    return () => {
      isMounted = false;
    };
  }, [visible, fetchReceipt]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatLocation = (location) => {
    if (!location) return 'Unknown location';
    if (typeof location === 'string') return location;
    if (location.address) return location.address;
    if (location.name) return location.name;
    return 'Unknown location';
  };

  const statusColor = {
    completed: '#4CAF50',
    cancelled: '#F44336',
    no_driver_found: '#FF9800',
    pending: '#2196F3',
    accepted: '#2196F3',
  }[booking.status] || '#757575';

  const statusIcon = {
    completed: '✓',
    cancelled: '✗',
    no_driver_found: '⚠',
    pending: '⏳',
    accepted: '🚕',
  }[booking.status] || '•';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.headerCloseIcon}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip Details</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Loading State */}
        {loading && (
          <View style={styles.centerContainer}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingText}>Loading trip details...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !loading && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchReceipt} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        {!loading && !error && (
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}>

            {/* Trip Header Card */}
            <View style={[styles.card, SHADOWS.card]}>
              <View style={styles.tripHeaderRow}>
                <View style={styles.statusBadgeContainer}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                    <Text style={styles.statusIcon}>{statusIcon}</Text>
                  </View>
                  <Text style={styles.statusLabel}>{booking.status?.toUpperCase().replace('_', ' ')}</Text>
                </View>
                <View style={styles.tripIdContainer}>
                  <Text style={styles.tripIdLabel}>Trip ID</Text>
                  <Text style={styles.tripIdValue}>{booking.id?.substring(0, 16)}</Text>
                </View>
              </View>

              <View style={styles.tripDateRow}>
                <Text style={styles.tripDate}>📅 {formatDate(booking.created_at)}</Text>
              </View>
            </View>

            {/* Driver Info Card */}
            {booking.driver_name && (
              <View style={[styles.card, SHADOWS.card]}>
                <Text style={styles.cardTitle}>Driver</Text>
                <View style={styles.driverInfo}>
                  <View style={styles.driverAvatar}>
                    <Text style={styles.driverAvatarText}>👤</Text>
                  </View>
                  <View style={styles.driverDetails}>
                    <Text style={styles.driverName}>{booking.driver_name}</Text>
                    {booking.rating && (
                      <Text style={styles.driverRating}>⭐ {booking.rating}/5 rating</Text>
                    )}
                    {booking.vehicle_number && (
                      <Text style={styles.vehicleNumber}>{booking.vehicle_number}</Text>
                    )}
                  </View>
                  {booking.rating && (
                    <View style={styles.ratingBadge}>
                      <Text style={styles.ratingValue}>{booking.rating}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Route Card */}
            <View style={[styles.card, SHADOWS.card]}>
              <Text style={styles.cardTitle}>Route Details</Text>

              <View style={styles.routeItem}>
                <View style={styles.routeIconContainer}>
                  <Text style={styles.routeIcon}>📍</Text>
                  <Text style={styles.routeLabel}>Pickup</Text>
                </View>
                <Text style={styles.routeText}>{formatLocation(booking.pickup_location)}</Text>
              </View>

              <View style={styles.routeSeparator} />

              <View style={styles.routeItem}>
                <View style={styles.routeIconContainer}>
                  <Text style={styles.routeIcon}>🏁</Text>
                  <Text style={styles.routeLabel}>Drop</Text>
                </View>
                <Text style={styles.routeText}>{formatLocation(booking.drop_location)}</Text>
              </View>

              {/* Trip Stats */}
              <View style={styles.tripStatsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Distance</Text>
                  <Text style={styles.statValue}>
                    {booking.distance_km
                      ? `${Number(booking.distance_km).toFixed(1)} km`
                      : '--'}
                  </Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Duration</Text>
                  <Text style={styles.statValue}>
                    {booking.duration_minutes
                      ? `${Math.round(booking.duration_minutes)} min`
                      : '--'}
                  </Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Type</Text>
                  <Text style={styles.statValue}>{booking.ride_type || 'Standard'}</Text>
                </View>
              </View>
            </View>

            {/* Fare Card */}
            <View style={[styles.card, SHADOWS.card]}>
              <View style={styles.fareHeader}>
                <Text style={styles.cardTitle}>Fare Details</Text>
                <TouchableOpacity
                  onPress={() => setShowFareModal(true)}
                  style={styles.breakdownButton}>
                  <Text style={styles.breakdownButtonText}>Full Breakdown →</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Estimated Fare</Text>
                <Text style={styles.fareValue}>
                  ₹{Number(booking.estimated_fare || 0).toFixed(0)}
                </Text>
              </View>

              {booking.final_fare && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Final Fare</Text>
                  <Text style={[styles.fareValue, styles.finalFareValue]}>
                    ₹{Number(booking.final_fare).toFixed(0)}
                  </Text>
                </View>
              )}

              {booking.promotion_discount && Number(booking.promotion_discount) > 0 && (
                <View style={[styles.fareRow, styles.promoRow]}>
                  <Text style={styles.fareLabel}>Promotion</Text>
                  <Text style={styles.promoDiscount}>
                    -₹{Number(booking.promotion_discount).toFixed(0)}
                  </Text>
                </View>
              )}

              <View style={styles.fareDivider} />

              <View style={[styles.fareRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total Amount Paid</Text>
                <Text style={styles.totalValue}>
                  ₹{Number(booking.final_fare || booking.estimated_fare || 0).toFixed(0)}
                </Text>
              </View>

              {booking.payment_method && (
                <Text style={styles.paymentMethod}>
                  💳 Paid via {booking.payment_method}
                </Text>
              )}
            </View>

            {/* Payment Status Card */}
            <View style={[styles.card, SHADOWS.card]}>
              <Text style={styles.cardTitle}>Payment Status</Text>
              <View style={styles.paymentStatus}>
                <Text style={styles.paymentStatusIcon}>✓</Text>
                <View style={styles.paymentStatusContent}>
                  <Text style={styles.paymentStatusTitle}>Payment Successful</Text>
                  <Text style={styles.paymentStatusDate}>
                    {formatDate(booking.created_at)}
                  </Text>
                  {!!receipt?.id && (
                    <Text style={styles.paymentStatusDate}>Receipt {receipt.id}</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Post-Ride Actions */}

            <View style={styles.actionsContainer}>
              <Text style={styles.actionsTitle}>What would you like to do?</Text>

              <TouchableOpacity
                style={[styles.actionButton, styles.primaryButton]}
                onPress={() => {
                  onClose?.();
                  onRate?.(booking);
                }}>
                <Text style={styles.primaryButtonIcon}>⭐</Text>
                <Text style={styles.primaryButtonText}>Rate Ride</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={() => {
                  onClose?.();
                  onReport?.(booking);
                }}>
                <Text style={styles.secondaryButtonIcon}>⚠️</Text>
                <Text style={styles.secondaryButtonText}>Report Issue</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={() => {
                  onClose?.();
                  onLostItem?.(booking);
                }}>
                <Text style={styles.secondaryButtonIcon}>🔍</Text>
                <Text style={styles.secondaryButtonText}>Lost Item</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={() => setShowAddStop(true)}>
                <Text style={styles.secondaryButtonIcon}>➕</Text>
                <Text style={styles.secondaryButtonText}>Add Stop</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={() => setShowEditDestination(true)}>
                <Text style={styles.secondaryButtonIcon}>✏️</Text>
                <Text style={styles.secondaryButtonText}>Edit Destination</Text>
              </TouchableOpacity>
            </View>

            {/* AddStopModal */}
            {showAddStop && (
              <AddStopModal
                isOpen={showAddStop}
                onClose={() => setShowAddStop(false)}
                bookingId={booking.id}
                token={token}
                onStopAdded={() => {
                  setShowAddStop(false);
                  // Optionally refresh trip details here
                }}
              />
            )}

            {/* EditDestinationModal */}
            {showEditDestination && (
              <EditDestinationModal
                isOpen={showEditDestination}
                onClose={() => setShowEditDestination(false)}
                bookingId={booking.id}
                token={token}
                currentDestination={booking.drop_location?.address || ''}
                onDestinationSaved={() => {
                  setShowEditDestination(false);
                  // Optionally refresh trip details here
                }}
              />
            )}

            <View style={{ height: 20 }} />
          </ScrollView>
        )}

        {/* Fare Breakdown Modal */}
        <FareBreakdown
          modal
          visible={showFareModal}
          booking={booking}
          estimatedFare={booking.estimated_fare}
          finalFare={booking.final_fare}
          distance={booking.distance_km || 0}
          duration={booking.duration_minutes || 0}
          surgeMultiplier={booking.surge_multiplier || 1}
          surgeLongText={booking.surge_reason}
          promos={booking.promotions || []}
          taxes={booking.taxes || 0}
          vehicleTypeId={booking.vehicle_type_id || ''}
          vehicleTypeIcon={booking.vehicle_icon || '🚗'}
          vehicleTypeMultiplier={booking.vehicle_type_multiplier || 1.0}
          onClose={() => setShowFareModal(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 40,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  headerCloseIcon: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
  },

  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: COLORS.textMuted,
  },

  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  retryButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },

  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Trip Header
  tripHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  tripIdContainer: {
    alignItems: 'flex-end',
  },
  tripIdLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  tripIdValue: {
    fontSize: 11,
    color: COLORS.textMain,
    fontWeight: '600',
    marginTop: 2,
  },
  tripDateRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
  },
  tripDate: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '500',
  },

  // Driver Info
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverAvatarText: {
    fontSize: 24,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  driverRating: {
    fontSize: 11,
    color: '#FF9800',
    fontWeight: '600',
    marginTop: 2,
  },
  vehicleNumber: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  ratingBadge: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF9800',
  },

  // Route
  routeItem: {
    marginBottom: 12,
  },
  routeIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  routeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  routeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  routeText: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '500',
    lineHeight: 16,
    marginLeft: 20,
  },
  routeSeparator: {
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  tripStatsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '700',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#EFEFEF',
    marginHorizontal: 8,
  },

  // Fare
  fareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  breakdownButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  breakdownButtonText: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '600',
  },

  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 6,
  },
  fareLabel: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '500',
  },
  fareValue: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '700',
  },
  finalFareValue: {
    color: '#4CAF50',
  },

  promoRow: {
    backgroundColor: '#E8F5E9',
    marginHorizontal: -12,
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  promoDiscount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
  },

  fareDivider: {
    height: 1,
    backgroundColor: '#EFEFEF',
    marginVertical: 8,
  },

  totalRow: {
    backgroundColor: '#E3F2FD',
    marginHorizontal: -12,
    paddingHorizontal: 12,
    borderRadius: 6,
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },

  paymentMethod: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 8,
  },

  // Payment Status
  paymentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  paymentStatusIcon: {
    fontSize: 20,
    marginRight: 12,
    color: '#4CAF50',
  },
  paymentStatusContent: {
    flex: 1,
  },
  paymentStatusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2E7D32',
  },
  paymentStatusDate: {
    fontSize: 10,
    color: '#558B2F',
    marginTop: 2,
  },

  // Actions
  actionsContainer: {
    marginTop: 12,
  },
  actionsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.5,
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 8,
    gap: 8,
  },

  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  primaryButtonIcon: {
    fontSize: 14,
  },
  primaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  secondaryButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  secondaryButtonIcon: {
    fontSize: 14,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMain,
  },
});
