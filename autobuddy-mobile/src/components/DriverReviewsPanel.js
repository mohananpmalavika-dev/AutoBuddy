import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

function formatDate(value) {
  if (!value) {
    return 'Not available';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function ratingLabel(value) {
  const rating = Number(value || 0);
  return `${rating.toFixed(1).replace('.0', '')}/5`;
}

export default function DriverReviewsPanel({ token, onAppealReview }) {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({ average_rating: 0, total_count: 0, distribution: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const payload = await apiRequest('/drivers/reviews', { token, query: { limit: 100 } });
      setReviews(Array.isArray(payload?.reviews) ? payload.reviews : []);
      setSummary({
        average_rating: Number(payload?.average_rating || 0),
        total_count: Number(payload?.total_count || 0),
        distribution: payload?.distribution || {},
      });
    } catch (err) {
      setError(err.message || 'Failed to load driver reviews');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchReviews().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchReviews, token]);

  const distributionRows = useMemo(() => {
    const rows = [];
    for (let star = 5; star >= 1; star -= 1) {
      rows.push({
        star,
        count: Number(summary.distribution?.[String(star)] || 0),
      });
    }
    return rows;
  }, [summary.distribution]);

  if (loading && !reviews.length) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Driver Reviews</Text>
      <Text style={styles.subtitle}>Passenger feedback, ride references, and appeal support.</Text>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={[styles.summaryCard, SHADOWS.card]}>
        <View>
          <Text style={styles.summaryLabel}>Average Rating</Text>
          <Text style={styles.summaryValue}>{ratingLabel(summary.average_rating)}</Text>
        </View>
        <View>
          <Text style={styles.summaryLabel}>Reviews</Text>
          <Text style={styles.summaryValue}>{summary.total_count}</Text>
        </View>
      </View>

      <View style={[styles.distributionCard, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Rating Breakdown</Text>
        {distributionRows.map((row) => (
          <View key={row.star} style={styles.distributionRow}>
            <Text style={styles.distributionStar}>{row.star} star</Text>
            <View style={styles.distributionTrack}>
              <View
                style={[
                  styles.distributionFill,
                  {
                    width: summary.total_count > 0
                      ? `${Math.min(100, (row.count / summary.total_count) * 100)}%`
                      : '0%',
                  },
                ]}
              />
            </View>
            <Text style={styles.distributionCount}>{row.count}</Text>
          </View>
        ))}
      </View>

      <View style={styles.reviewList}>
        {reviews.length ? (
          reviews.map((review) => (
            <View key={review.id || review.booking_id} style={[styles.reviewCard, SHADOWS.card]}>
              <View style={styles.reviewHeader}>
                <View>
                  <Text style={styles.reviewRating}>Rating {ratingLabel(review.rating)}</Text>
                  <Text style={styles.reviewMeta}>
                    {review.passenger_name || 'Passenger'} - {formatDate(review.created_at)}
                  </Text>
                </View>
                <Text style={styles.bookingPill}>Booking {String(review.booking_id || 'N/A').slice(0, 8)}</Text>
              </View>
              <Text style={styles.routeText}>
                {review.pickup || 'Pickup'} to {review.drop || 'Drop'}
              </Text>
              <Text style={styles.commentText}>
                {String(review.comment || '').trim() || 'No written comment was added.'}
              </Text>
              <View style={styles.reviewFooter}>
                <Text style={styles.referenceText}>{review.appeal_reference || `rating:${review.id}`}</Text>
                <TouchableOpacity
                  style={styles.appealButton}
                  onPress={() => onAppealReview?.(review)}>
                  <Text style={styles.appealButtonText}>Appeal</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View style={[styles.emptyCard, SHADOWS.card]}>
            <Text style={styles.emptyTitle}>No reviews yet</Text>
            <Text style={styles.emptyText}>Passenger feedback will appear here after completed rated rides.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  loadingContainer: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.textMain, marginBottom: 4 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 16 },
  errorText: { color: '#D32F2F', fontSize: 12, marginBottom: 10 },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: COLORS.textMain },
  distributionCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 12 },
  distributionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  distributionStar: { width: 48, fontSize: 12, color: COLORS.textMain },
  distributionTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#ECEFF3', overflow: 'hidden' },
  distributionFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  distributionCount: { width: 32, textAlign: 'right', fontSize: 12, color: COLORS.textMuted },
  reviewList: { gap: 12, marginBottom: 16 },
  reviewCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  reviewRating: { fontSize: 16, fontWeight: '800', color: COLORS.textMain },
  reviewMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  bookingPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F2F4F7',
    fontSize: 11,
    color: COLORS.textMuted,
  },
  routeText: { fontSize: 13, color: COLORS.textMain, marginBottom: 8 },
  commentText: { fontSize: 13, color: COLORS.textMain, lineHeight: 19, marginBottom: 12 },
  reviewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  referenceText: { flex: 1, fontSize: 11, color: COLORS.textMuted },
  appealButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.primary },
  appealButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textMain, marginBottom: 4 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
});
