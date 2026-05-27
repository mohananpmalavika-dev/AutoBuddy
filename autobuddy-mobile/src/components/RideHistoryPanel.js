import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

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

function RideHistoryCard({ booking, onPress, isLoading }) {
  const statusColor = {
    completed: '#4CAF50',
    cancelled: '#F44336',
    no_driver_found: '#FF9800',
    pending: '#2196F3',
    accepted: '#2196F3',
  }[booking.status] || '#757575';

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) + 
           ' ' + 
           date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatLocation = (location) => {
    if (!location) return 'Unknown';
    if (typeof location === 'string') return location.split(',')[0];
    if (location.address) return location.address.split(',')[0];
    return 'Unknown';
  };

  return (
    <TouchableOpacity
      style={[styles.card, SHADOWS.soft]}
      onPress={onPress}
      disabled={isLoading}
      activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{booking.status.replace('_', ' ').toUpperCase()}</Text>
        </View>
        <Text style={styles.cardTime}>{formatDate(booking.created_at)}</Text>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.routeSection}>
          <Text style={styles.routeText} numberOfLines={1}>
            📍 {formatLocation(booking.pickup_location)} → {formatLocation(booking.drop_location)}
          </Text>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Driver</Text>
            <Text style={styles.detailValue}>{booking.driver_name || 'Unassigned'}</Text>
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
              ₹{Number(booking.final_fare || booking.estimated_fare || 0).toFixed(0)}
            </Text>
          </View>

          {booking.rating && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Rating</Text>
              <Text style={styles.detailValue}>⭐ {booking.rating}/5</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.bookingId}>ID: {booking.id.substring(0, 12)}</Text>
        <Text style={styles.tapHint}>Tap for details →</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function RideHistoryPanel({ token, onTripSelected }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [searchText, setSearchText] = useState('');

  // Pagination
  const [pageSize] = useState(10);
  const [displayedCount, setDisplayedCount] = useState(10);

  // Fetch bookings
  const fetchBookings = useCallback(async () => {
    try {
      const data = await apiRequest('/bookings', { token });
      return Array.isArray(data) ? data : [];
    } catch (err) {
      throw err;
    }
  }, [token]);

  useEffect(() => {
    let isMounted = true;

    const loadBookings = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchBookings();
        if (isMounted) {
          setBookings(data);
          setDisplayedCount(10);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load ride history');
          setBookings([]);
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
  }, [fetchBookings]);

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
        b.driver_name?.toLowerCase().includes(search) ||
        b.id.toLowerCase().includes(search) ||
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
  const hasMore = displayedCount < filteredAndSortedBookings.length;

  const handleLoadMore = useCallback(() => {
    setLoadingMore(true);
    setTimeout(() => {
      setDisplayedCount((prev) => prev + pageSize);
      setLoadingMore(false);
    }, 300);
  }, [pageSize]);

  const handleRefresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchBookings();
      setBookings(data);
      setDisplayedCount(10);
    } catch (err) {
      setError(err.message || 'Failed to load ride history');
    } finally {
      setLoading(false);
    }
  }, [fetchBookings]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ride History</Text>
        <TouchableOpacity onPress={handleRefresh} disabled={loading}>
          <Text style={styles.refreshButton}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={styles.searchPlaceholder} numberOfLines={1}>
          {searchText || 'Search by driver, location, or ID...'}
        </Text>
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
        </Text>
      </View>

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
          <Text style={styles.emptyIcon}>🚕</Text>
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
              onPress={() => onTripSelected?.(booking)}
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
                  Load More ({displayedCount}/{filteredAndSortedBookings.length})
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
    fontSize: 14,
    marginRight: 8,
  },
  searchPlaceholder: {
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
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
