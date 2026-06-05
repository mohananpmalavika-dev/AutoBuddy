import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

const PassengerPreview = ({ rating, totalRatings, recentReviews = [] }) => {
  const getRatingColor = useMemo(() => {
    if (!rating) return theme.COLORS.grey5;
    if (rating >= 4.5) return theme.COLORS.success;
    if (rating >= 4.0) return '#66BB6A';
    if (rating >= 3.5) return theme.COLORS.warning;
    return theme.COLORS.danger;
  }, [rating]);

  const getRatingLabel = useMemo(() => {
    if (!rating) return 'Unknown';
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 4.0) return 'Good';
    if (rating >= 3.5) return 'Average';
    return 'Low Rating';
  }, [rating]);

  return (
    <View style={styles.container}>
      {/* Rating Header */}
      <View style={styles.ratingHeader}>
        <View style={styles.ratingDisplay}>
          <Text style={[styles.ratingValue, { color: getRatingColor }]}>★ {rating?.toFixed(1) || 'N/A'}</Text>
          <Text style={styles.ratingLabel}>{getRatingLabel}</Text>
        </View>
        <Text style={styles.totalRatings}>{totalRatings} rides</Text>
      </View>

      {/* Recent Reviews */}
      {recentReviews && recentReviews.length > 0 && (
        <View style={styles.reviewsSection}>
          <Text style={styles.reviewsTitle}>Recent Feedback</Text>
          {recentReviews.slice(0, 2).map((review, idx) => (
            <View key={idx} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewRating}>★ {review.rating}</Text>
                {review.date && <Text style={styles.reviewDate}>{review.date}</Text>}
              </View>
              {review.comment && <Text style={styles.reviewText}>{review.comment}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* Rating Badge */}
      <View style={[styles.badge, { borderColor: getRatingColor }]}>
        <Text style={[styles.badgeText, { color: getRatingColor }]}>
          {rating >= 4.5 ? '✓ Trusted' : rating >= 4.0 ? '✓ Good' : '⚠ Review'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.COLORS.white,
    borderRadius: 12,
    padding: 14,
    ...theme.SHADOWS.medium,
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ratingDisplay: {
    flex: 1,
  },
  ratingValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  ratingLabel: {
    fontSize: 12,
    color: theme.COLORS.grey5,
  },
  totalRatings: {
    fontSize: 12,
    color: theme.COLORS.grey5,
    fontWeight: '500',
  },
  reviewsSection: {
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.grey2,
    paddingTop: 10,
    marginBottom: 10,
  },
  reviewsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 6,
  },
  reviewItem: {
    marginBottom: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reviewRating: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.COLORS.warning,
  },
  reviewDate: {
    fontSize: 10,
    color: theme.COLORS.grey5,
  },
  reviewText: {
    fontSize: 11,
    color: theme.COLORS.grey5,
    fontStyle: 'italic',
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default PassengerPreview;
