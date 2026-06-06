import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import { formatToIST } from '../utils/time';

/**
 * RideHistoryPanel - Enhanced ride history with pagination, filters, and sorting
 * 
 * Features:
 * - Pagination (10 rides per page with "Load More")
 * - Filters: Status, Date Range, Product Type, Fare Range
 * - Sorting: Date, Fare, Driver Rating
 * - Trip detail view on card tap
 * - Search functionality
 */

const FILTER_PRESETS = [
  { key: 'all', label: 'All', range: null },
  { key: '7days', label: 'Last 7 Days', range: 7 },
  { key: '30days', label: 'Last 30 Days', range: 30 },
  { key: '90days', label: 'Last 90 Days', range: 90 },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All Rides' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'no_driver_found', label: 'No Driver Found' },
];

const SORT_OPTIONS = [
  { key: 'recent', label: 'Most Recent' },
  { key: 'fare_high', label: 'Highest Fare' },
  { key: 'fare_low', label: 'Lowest Fare' },
  { key: 'distance', label: 'Farthest Distance' },
];

const SERVER_PAGE_SIZE = 100;

function formatLocation(location) {
  if (!location) return 'Unknown';
  if (typeof location === 'string') return location.split(',')[0];
  if (location.address) return location.address.split(',')[0];
  return 'Unknown';
}

function getFareAmount(booking) {
  return Number(booking?.final_fare ?? booking?.estimated_fare ?? 0) || 0;
}

function formatCurrency(amount) {
  return `INR ${Number(amount || 0).toFixed(0)}`;
}

function getCounterpartLabel(viewerRole) {
  return viewerRole === 'driver' ? 'Passenger' : 'Driver';
}

function getCounterpartName(booking, viewerRole) {
  if (viewerRole === 'driver') {
    return booking?.passenger_name || 'Passenger';
  }
  return booking?.driver_name || 'Unassigned';
}

function buildReceiptLines(booking, viewerRole) {
  const totalFare = getFareAmount(booking);
  const pickupSurcharge = Number(booking?.pickup_surcharge || 0);
  const routeFare = Math.max(totalFare - pickupSurcharge, 0);
  return [
    `AutoBuddy ${viewerRole === 'driver' ? 'driver' : 'ride'} receipt`,
    `Booking: ${booking?.id || 'N/A'}`,
    `${getCounterpartLabel(viewerRole)}: ${getCounterpartName(booking, viewerRole)}`,
    `Status: ${String(booking?.status || 'unknown').replace(/_/g, ' ')}`,
    `Pickup: ${formatLocation(booking?.pickup_location)}`,
    `Drop: ${formatLocation(booking?.drop_location)}`,
    `Distance: ${Number(booking?.actual_distance_km || booking?.distance_km || 0).toFixed(1)} km`,
    `Route fare: ${formatCurrency(routeFare)}`,
    pickupSurcharge > 0 ? `Pickup surcharge: ${formatCurrency(pickupSurcharge)}` : null,
    `Total fare: ${formatCurrency(totalFare)}`,
    `Payment: ${String(booking?.payment_method || 'cash').toUpperCase()}`,
    `Reference: ${String(booking?.id || '').slice(0, 12)}`,
  ].filter(Boolean);
}

function RideHistoryCard({
  booking,
  onPress,
  isLoading,
  viewerRole = 'passenger',
  isCounterpartFavorite = false,
  isCounterpartBlocked = false,
  actionBusy = false,
  onToggleFavorite,
  onToggleBlock,
}) {
  const statusColor = {
    completed: '#4CAF50',
    cancelled: '#F44336',
    no_driver_found: '#FF9800',
    pending: '#2196F3',
    accepted: '#2196F3',
  }[booking?.status] || '#757575';

  const formatDate = (dateStr) => {
    const datePart = formatToIST(dateStr, { month: 'short', day: 'numeric' });
    const timePart = formatToIST(dateStr, { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  };
  const showDriverRelationshipActions = viewerRole === 'driver' && !!booking?.passenger_id;

  return (
    <TouchableOpacity
      style={[styles.card, SHADOWS.soft]}
      onPress={onPress}
      disabled={isLoading}
      activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{String(booking?.status || 'unknown').replace('_', ' ').toUpperCase()}</Text>
        </View>
        <Text style={styles.cardTime}>{formatDate(booking.created_at)}</Text>
      </View>

      {/* Vehicle Info */}
      {booking.vehicle_type_id && (
        <View style={styles.vehicleInfoRow}>
          <Text style={styles.vehicleIcon}>{booking.vehicle_icon || '🚗'}</Text>
          <Text style={styles.vehicleType}>{booking.vehicle_type_id.toUpperCase()}</Text>
          {booking.ride_type && (
            <Text style={styles.rideTypeTag}>{booking.ride_type}</Text>
          )}
          {booking.vehicle_type_multiplier && booking.vehicle_type_multiplier !== 1 && (
            <View style={styles.multiplierBadge}>
              <Text style={styles.multiplierText}>{booking.vehicle_type_multiplier}x</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.cardContent}>
        <View style={styles.routeSection}>
          <Text style={styles.routeText} numberOfLines={1}>
            {formatLocation(booking.pickup_location)} to {formatLocation(booking.drop_location)}
          </Text>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>{getCounterpartLabel(viewerRole)}</Text>
            <Text style={styles.detailValue}>{getCounterpartName(booking, viewerRole)}</Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Distance</Text>
            <Text style={styles.detailValue}>
              {booking.distance_km ? `${Number(booking.distance_km).toFixed(1)} km` : '--'}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Fare</Text>
            <Text style={[styles.detailValue, styles.fareText]}>
              Rs. {Number(booking.final_fare || booking.estimated_fare || 0).toFixed(0)}
            </Text>
          </View>

          {booking.rating && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Rating</Text>
              <Text style={styles.detailValue}>Rating {booking.rating}/5</Text>
            </View>
          )}
        </View>
      </View>

      {showDriverRelationshipActions && (
        <View style={styles.cardActionRow}>
          <TouchableOpacity
            style={[
              styles.historyActionButton,
              isCounterpartFavorite && styles.historyActionButtonActive,
              isCounterpartBlocked && styles.historyActionButtonDisabled,
            ]}
            onPress={(event) => {
              event?.stopPropagation?.();
              onToggleFavorite?.(booking);
            }}
            disabled={isLoading || actionBusy || isCounterpartBlocked}>
            <Text style={[
              styles.historyActionText,
              isCounterpartFavorite && styles.historyActionTextActive,
            ]}>
              {isCounterpartFavorite ? 'Unfavorite' : 'Favorite'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.historyActionButton,
              isCounterpartBlocked && styles.historyBlockActionActive,
            ]}
            onPress={(event) => {
              event?.stopPropagation?.();
              onToggleBlock?.(booking);
            }}
            disabled={isLoading || actionBusy}>
            <Text style={[
              styles.historyActionText,
              isCounterpartBlocked && styles.historyBlockActionText,
            ]}>
              {isCounterpartBlocked ? 'Unblock' : 'Block'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.bookingId}>ID: {String(booking.id || 'N/A').substring(0, 12)}</Text>
        <Text style={styles.tapHint}>Tap for details</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function RideHistoryPanel({
  token,
  onTripSelected,
  viewerRole = 'passenger',
  onSupportRequested,
}) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [favoritePassengerIds, setFavoritePassengerIds] = useState([]);
  const [blockedPassengerIds, setBlockedPassengerIds] = useState([]);
  const [relationshipActionId, setRelationshipActionId] = useState('');

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [searchText, setSearchText] = useState('');

  // Pagination
  const [pageSize] = useState(10);
  const [displayedCount, setDisplayedCount] = useState(10);

  // Fetch bookings
  const fetchBookings = useCallback(async ({ skip = 0 } = {}) => {
    try {
      const query = {
        limit: SERVER_PAGE_SIZE,
        skip,
      };
      if (viewerRole === 'driver') {
        query.history = true;
      }
      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }
      const data = await apiRequest('/bookings', { token, query });
      return Array.isArray(data) ? data : [];
    } catch (err) {
      throw err;
    }
  }, [statusFilter, token, viewerRole]);

  const refreshDriverPassengerRelationships = useCallback(async () => {
    if (viewerRole !== 'driver' || !token) {
      return;
    }
    try {
      const [favoritePayload, blockedPayload] = await Promise.all([
        apiRequest('/drivers-tier3/favorite-passengers?limit=200', { method: 'GET', token }).catch(() => ({ favorites: [] })),
        apiRequest('/drivers/blocked-passengers', { token }).catch(() => ({ passenger_ids: [] })),
      ]);
      const blockedIds = Array.isArray(blockedPayload?.passenger_ids) ? blockedPayload.passenger_ids : [];
      const favoriteIds = (Array.isArray(favoritePayload?.favorites) ? favoritePayload.favorites : [])
        .map((favorite) => favorite?.passenger_id)
        .filter((passengerId) => passengerId && !blockedIds.includes(passengerId));
      setBlockedPassengerIds(blockedIds);
      setFavoritePassengerIds(favoriteIds);
    } catch {
      setBlockedPassengerIds([]);
      setFavoritePassengerIds([]);
    }
  }, [token, viewerRole]);

  useEffect(() => {
    let isMounted = true;

    const loadBookings = async () => {
      try {
        setLoading(true);
        setError('');
        const [data] = await Promise.all([
          fetchBookings(),
          refreshDriverPassengerRelationships(),
        ]);
        if (isMounted) {
          setBookings(data);
          setServerHasMore(data.length === SERVER_PAGE_SIZE);
          setSelectedBooking(null);
          setDisplayedCount(10);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load ride history');
          setBookings([]);
          setServerHasMore(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadBookings();
    return () => {
      isMounted = false;
    };
  }, [fetchBookings, refreshDriverPassengerRelationships]);

  // Filter and sort bookings
  const filteredAndSortedBookings = useMemo(() => {
    let result = [...bookings];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((b) => b.status === statusFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const days = FILTER_PRESETS.find((p) => p.key === dateFilter)?.range;
      if (days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        result = result.filter((b) => new Date(b.created_at) >= cutoffDate);
      }
    }

    // Search filter
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      result = result.filter((b) => 
        b.passenger_name?.toLowerCase().includes(search) ||
        b.driver_name?.toLowerCase().includes(search) ||
        String(b.id || '').toLowerCase().includes(search) ||
        b.pickup_location?.address?.toLowerCase().includes(search) ||
        b.drop_location?.address?.toLowerCase().includes(search)
      );
    }

    // Sort
    switch (sortBy) {
      case 'fare_high':
        result.sort((a, b) => (Number(b.final_fare || b.estimated_fare) || 0) - (Number(a.final_fare || a.estimated_fare) || 0));
        break;
      case 'fare_low':
        result.sort((a, b) => (Number(a.final_fare || a.estimated_fare) || 0) - (Number(b.final_fare || b.estimated_fare) || 0));
        break;
      case 'distance':
        result.sort((a, b) => (Number(b.distance_km) || 0) - (Number(a.distance_km) || 0));
        break;
      case 'recent':
      default:
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
    }

    return result;
  }, [bookings, statusFilter, dateFilter, sortBy, searchText]);

  const displayedList = filteredAndSortedBookings.slice(0, displayedCount);
  const hasMore = displayedCount < filteredAndSortedBookings.length || serverHasMore;

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      if (displayedCount < filteredAndSortedBookings.length) {
        setDisplayedCount((prev) => prev + pageSize);
        return;
      }
      if (!serverHasMore) {
        return;
      }
      const olderBookings = await fetchBookings({ skip: bookings.length });
      setServerHasMore(olderBookings.length === SERVER_PAGE_SIZE);
      setBookings((prev) => {
        const existingIds = new Set(prev.map((booking) => String(booking.id)));
        const merged = [...prev];
        olderBookings.forEach((booking) => {
          if (!existingIds.has(String(booking.id))) {
            merged.push(booking);
          }
        });
        return merged;
      });
      setDisplayedCount((prev) => prev + pageSize);
    } catch (err) {
      setError(err.message || 'Failed to load older rides');
    } finally {
      setLoadingMore(false);
    }
  }, [bookings.length, displayedCount, fetchBookings, filteredAndSortedBookings.length, pageSize, serverHasMore]);

  const handleRefresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [data] = await Promise.all([
        fetchBookings(),
        refreshDriverPassengerRelationships(),
      ]);
      setBookings(data);
      setServerHasMore(data.length === SERVER_PAGE_SIZE);
      setSelectedBooking(null);
      setDisplayedCount(10);
    } catch (err) {
      setError(err.message || 'Failed to load ride history');
    } finally {
      setLoading(false);
    }
  }, [fetchBookings, refreshDriverPassengerRelationships]);

  const handleTripPress = useCallback((booking) => {
    if (typeof onTripSelected === 'function') {
      onTripSelected(booking);
      return;
    }
    setSelectedBooking(booking);
  }, [onTripSelected]);

  const shareReceipt = useCallback(async (booking) => {
    try {
      await Share.share({
        title: `AutoBuddy Receipt - ${String(booking?.id || '').slice(0, 12)}`,
        message: buildReceiptLines(booking, viewerRole).join('\n'),
      });
    } catch (err) {
      setError(err.message || 'Could not share receipt');
    }
  }, [viewerRole]);

  const toggleFavoritePassengerFromHistory = useCallback(async (booking) => {
    const passengerId = booking?.passenger_id;
    if (!passengerId || viewerRole !== 'driver') {
      return;
    }
    const isFavorite = favoritePassengerIds.includes(passengerId);
    setRelationshipActionId(`favorite:${passengerId}`);
    setError('');
    try {
      if (isFavorite) {
        await apiRequest(`/drivers-tier3/favorite-passengers/${passengerId}`, {
          method: 'DELETE',
          token,
        });
        setFavoritePassengerIds((prev) => prev.filter((item) => item !== passengerId));
      } else {
        await apiRequest('/drivers-tier3/favorite-passengers', {
          method: 'POST',
          token,
          body: {
            passenger_id: passengerId,
            rating: 5,
            notes: `Added from ride history ${String(booking?.id || '').slice(0, 12)}`,
          },
        });
        setFavoritePassengerIds((prev) => (prev.includes(passengerId) ? prev : [...prev, passengerId]));
      }
    } catch (err) {
      setError(err.message || 'Could not update favorite passenger');
    } finally {
      setRelationshipActionId('');
    }
  }, [favoritePassengerIds, token, viewerRole]);

  const toggleBlockedPassengerFromHistory = useCallback(async (booking) => {
    const passengerId = booking?.passenger_id;
    if (!passengerId || viewerRole !== 'driver') {
      return;
    }
    const isBlocked = blockedPassengerIds.includes(passengerId);
    setRelationshipActionId(`block:${passengerId}`);
    setError('');
    try {
      await apiRequest(`/drivers/blocked-passengers/${passengerId}`, {
        method: 'PUT',
        token,
        body: {
          is_blocked: !isBlocked,
          booking_id: booking?.id,
          reason: isBlocked ? undefined : 'Blocked from ride history',
        },
      });
      if (isBlocked) {
        setBlockedPassengerIds((prev) => prev.filter((item) => item !== passengerId));
      } else {
        setBlockedPassengerIds((prev) => (prev.includes(passengerId) ? prev : [...prev, passengerId]));
        setFavoritePassengerIds((prev) => prev.filter((item) => item !== passengerId));
        await apiRequest(`/drivers-tier3/favorite-passengers/${passengerId}`, {
          method: 'DELETE',
          token,
        }).catch(() => null);
      }
    } catch (err) {
      setError(err.message || 'Could not update blocked passenger');
    } finally {
      setRelationshipActionId('');
    }
  }, [blockedPassengerIds, token, viewerRole]);

  const selectedTotalFare = getFareAmount(selectedBooking);
  const selectedPickupSurcharge = Number(selectedBooking?.pickup_surcharge || 0);
  const selectedRouteFare = Math.max(selectedTotalFare - selectedPickupSurcharge, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {viewerRole === 'driver' ? 'Ride History & Receipts' : 'Ride History'}
        </Text>
        <TouchableOpacity onPress={handleRefresh} disabled={loading}>
          <Text style={styles.refreshButton}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>Search</Text>
        <Text style={styles.searchPlaceholder} numberOfLines={1}>
          {searchText || `Search by ${getCounterpartLabel(viewerRole).toLowerCase()}, location, or ID`}
        </Text>
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={(text) => {
            setSearchText(text);
            setDisplayedCount(10);
          }}
          placeholder={`Search by ${getCounterpartLabel(viewerRole).toLowerCase()}, location, or ID`}
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      {/* Filter Controls */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <View style={styles.filterChipsContainer}>
          {/* Status Filter */}
          <Text style={styles.filterLabel}>Status:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {STATUS_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterChip, statusFilter === filter.key && styles.filterChipActive]}
                onPress={() => {
                  setStatusFilter(filter.key);
                  setDisplayedCount(10);
                }}>
                <Text style={[styles.filterChipText, statusFilter === filter.key && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Date Filter */}
          <Text style={styles.filterLabel}>Period:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {FILTER_PRESETS.map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterChip, dateFilter === filter.key && styles.filterChipActive]}
                onPress={() => {
                  setDateFilter(filter.key);
                  setDisplayedCount(10);
                }}>
                <Text style={[styles.filterChipText, dateFilter === filter.key && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Sort */}
          <Text style={styles.filterLabel}>Sort:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.filterChip, sortBy === option.key && styles.filterChipActive]}
                onPress={() => setSortBy(option.key)}>
                <Text style={[styles.filterChipText, sortBy === option.key && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Results Info */}
      <View style={styles.resultsInfo}>
        <Text style={styles.resultsText}>
          Showing {displayedList.length} of {filteredAndSortedBookings.length} rides
          {serverHasMore ? ' loaded, older rides available' : ''}
        </Text>
      </View>

      {selectedBooking && !loading && !error && (
        <View style={[styles.receiptDetail, SHADOWS.soft]}>
          <View style={styles.receiptHeader}>
            <View style={styles.receiptHeaderText}>
              <Text style={styles.receiptTitle}>Receipt and dispute reference</Text>
              <Text style={styles.receiptMeta}>Booking {String(selectedBooking.id || 'N/A').slice(0, 12)}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedBooking(null)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.receiptRows}>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>{getCounterpartLabel(viewerRole)}</Text>
              <Text style={styles.receiptValue}>{getCounterpartName(selectedBooking, viewerRole)}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Status</Text>
              <Text style={styles.receiptValue}>{String(selectedBooking.status || 'unknown').replace(/_/g, ' ')}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Distance</Text>
              <Text style={styles.receiptValue}>
                {Number(selectedBooking.actual_distance_km || selectedBooking.distance_km || 0).toFixed(1)} km
              </Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Route fare</Text>
              <Text style={styles.receiptValue}>{formatCurrency(selectedRouteFare)}</Text>
            </View>
            {selectedPickupSurcharge > 0 && (
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Pickup surcharge</Text>
                <Text style={styles.receiptValue}>{formatCurrency(selectedPickupSurcharge)}</Text>
              </View>
            )}
            <View style={[styles.receiptRow, styles.receiptTotalRow]}>
              <Text style={styles.receiptTotalLabel}>Total fare</Text>
              <Text style={styles.receiptTotalValue}>{formatCurrency(selectedTotalFare)}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Payment</Text>
              <Text style={styles.receiptValue}>{String(selectedBooking.payment_method || 'cash').toUpperCase()}</Text>
            </View>
          </View>

          <Text style={styles.disputeHint}>
            Use booking ID {String(selectedBooking.id || 'N/A')} when contacting support about fare, cancellation, payout, or passenger issues.
          </Text>
          <View style={styles.receiptActions}>
            <TouchableOpacity style={styles.secondaryActionButton} onPress={() => shareReceipt(selectedBooking)}>
              <Text style={styles.secondaryActionText}>Share Receipt</Text>
            </TouchableOpacity>
            {viewerRole === 'driver' && typeof onSupportRequested === 'function' && (
              <TouchableOpacity style={styles.secondaryActionButton} onPress={() => onSupportRequested(selectedBooking)}>
                <Text style={styles.secondaryActionText}>Open Support</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Loading State */}
      {loading && (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.loadingText}>Loading ride history...</Text>
        </View>
      )}

      {/* Error State */}
      {error && !loading && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty State */}
      {!loading && !error && displayedList.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>Ride</Text>
          <Text style={styles.emptyTitle}>No rides found</Text>
          <Text style={styles.emptySubtitle}>
            {filteredAndSortedBookings.length === 0
              ? 'Your ride history will appear here'
              : 'No rides match your filters'}
          </Text>
        </View>
      )}

      {/* Rides List */}
      {!loading && !error && displayedList.length > 0 && (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {displayedList.map((booking) => (
            <RideHistoryCard
              key={booking.id}
              booking={booking}
              viewerRole={viewerRole}
              isCounterpartFavorite={favoritePassengerIds.includes(booking.passenger_id)}
              isCounterpartBlocked={blockedPassengerIds.includes(booking.passenger_id)}
              actionBusy={relationshipActionId.endsWith(`:${booking.passenger_id}`)}
              onToggleFavorite={toggleFavoritePassengerFromHistory}
              onToggleBlock={toggleBlockedPassengerFromHistory}
              onPress={() => handleTripPress(booking)}
            />
          ))}

          {/* Load More */}
          {hasMore && (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={handleLoadMore}
              disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Text style={styles.loadMoreText}>
                  {displayedCount < filteredAndSortedBookings.length
                    ? `Load More (${displayedCount}/${filteredAndSortedBookings.length})`
                    : 'Load Older Rides'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* End of list */}
          {!hasMore && displayedList.length > 0 && (
            <View style={styles.endOfList}>
              <Text style={styles.endOfListText}>No more rides to load</Text>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  refreshButton: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  searchIcon: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginRight: 8,
    textTransform: 'uppercase',
  },
  searchPlaceholder: {
    display: 'none',
  },
  searchInput: {
    fontSize: 12,
    color: COLORS.textMain,
    flex: 1,
    paddingVertical: 0,
  },

  filterScroll: {
    maxHeight: 200,
  },
  filterChipsContainer: {
    paddingHorizontal: 12,
    gap: 8,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 8,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 11,
    color: COLORS.textMain,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  resultsInfo: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
  },
  resultsText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  receiptDetail: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  receiptHeaderText: {
    flex: 1,
    paddingRight: 10,
  },
  receiptTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  receiptMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F2F4F5',
  },
  closeButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  receiptRows: {
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  receiptLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  receiptValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 11,
    color: COLORS.textMain,
    fontWeight: '700',
  },
  receiptTotalRow: {
    backgroundColor: '#F8FCF9',
    paddingHorizontal: 6,
  },
  receiptTotalLabel: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '800',
  },
  receiptTotalValue: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '800',
  },
  disputeHint: {
    marginTop: 10,
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  receiptActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  secondaryActionButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
  },
  secondaryActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },

  list: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  vehicleInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F5F5F5',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  vehicleIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  vehicleType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    flex: 1,
  },
  rideTypeTag: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primary,
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 6,
  },
  multiplierBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  multiplierText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },

  cardContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  routeSection: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  routeText: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '600',
    lineHeight: 16,
  },

  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailItem: {
    minWidth: '22%',
  },
  detailLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '600',
    marginTop: 2,
  },
  fareText: {
    color: '#4CAF50',
  },

  cardActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  historyActionButton: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 7,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#F6FAF7',
  },
  historyActionButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  historyBlockActionActive: {
    borderColor: '#C62828',
    backgroundColor: '#FDECEC',
  },
  historyActionButtonDisabled: {
    opacity: 0.55,
  },
  historyActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#355243',
  },
  historyActionTextActive: {
    color: COLORS.primaryDark,
  },
  historyBlockActionText: {
    color: '#C62828',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
  },
  bookingId: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontFamily: 'monospace',
  },
  tapHint: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '600',
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

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  loadMoreButton: {
    paddingVertical: 12,
    marginVertical: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },

  endOfList: {
    paddingVertical: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endOfListText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
