import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

/**
 * Enhanced PassengerRatingsPanel
 * 
 * Purpose:
 * - View and manage all passenger ratings
 * - Submit new ratings for completed rides
 * - Edit and delete existing ratings
 * - Filter ratings by status (unrated, rated, all)
 * 
 * Features:
 * - 5-star rating system with visual feedback
 * - Ride context display (driver, date, fare)
 * - Feedback text with character limit
 * - Rating history with quick edit/delete
 * - Support for post-ride rating flow
 */

function RatingStars({ current, onSelect, size = 'medium' }) {
  const starSize = size === 'large' ? 40 : size === 'medium' ? 32 : 24;
  const tapSize = size === 'large' ? 50 : size === 'medium' ? 42 : 32;
  
  return (
    <View style={styles.starsContainer}>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onSelect && onSelect(star)}
            style={[styles.starTouchable, { width: tapSize, height: tapSize }]}
            disabled={!onSelect}>
            <Text style={[styles.star, { fontSize: starSize }, star <= current && styles.starActive]}>
              {star <= current ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {current > 0 && (
        <Text style={styles.ratingLabel}>
          {current} star{current !== 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
}

function RideContextCard({ ride, style }) {
  if (!ride) return null;
  
  const rideDate = ride.created_at ? new Date(ride.created_at) : null;
  const formattedDate = rideDate?.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' });
  const formattedTime = rideDate?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.rideContextCard, style]}>
      <View style={styles.rideContextHeader}>
        <Text style={styles.driverName}>{ride.driver_name || 'Driver'}</Text>
        <Text style={styles.rideId}>#{ride.id?.substring(0, 8) || ''}</Text>
      </View>
      <View style={styles.rideContextDetails}>
        <Text style={styles.rideContextText}>📍 {ride.pickup_location || 'Pickup'}</Text>
        <Text style={styles.rideContextText}>↓</Text>
        <Text style={styles.rideContextText}>📍 {ride.drop_location || 'Dropoff'}</Text>
      </View>
      <View style={styles.rideContextFooter}>
        <Text style={styles.rideContextMeta}>
          {formattedDate} {formattedTime}
        </Text>
        <Text style={styles.rideFare}>₹{ride.estimated_fare || '0'}</Text>
      </View>
    </View>
  );
}

function formatRatingDate(value) {
  if (!value) {
    return 'Date unavailable';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }
  return date.toLocaleDateString();
}

export default function PassengerRatingsPanel({ token, onRideSelected = null }) {
  const [, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState([]);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [editingRatingId, setEditingRatingId] = useState(null);
  const [pastRides, setPastRides] = useState([]);
  const [selectedRideId, setSelectedRideId] = useState(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // unrated, rated, all
  const [submitting, setSubmitting] = useState(false);

  // Map rated rides for quick lookup
  const ratedBookingIds = useMemo(
    () => new Set(ratings.map((rating) => rating.booking_id).filter(Boolean)),
    [ratings],
  );

  // Get unrated rides
  const unratedRides = useMemo(
    () => pastRides.filter((ride) => !ratedBookingIds.has(ride.id)).slice(0, 15),
    [pastRides, ratedBookingIds],
  );

  // Filter ratings based on status
  const filteredRatings = useMemo(() => {
    if (filterStatus === 'rated') return ratings;
    if (filterStatus === 'unrated') return [];
    return ratings;
  }, [ratings, filterStatus]);

  const resetForm = useCallback(() => {
    setScore(0);
    setFeedback('');
    setSelectedRideId(null);
    setEditingRatingId(null);
    setShowSubmitForm(false);
    setError('');
  }, []);

  const fetchRatings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/ratings', { token });
      const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      setRatings(data);
    } catch (err) {
      setError('Failed to load ratings');
      console.error('Fetch ratings error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchPastRides = useCallback(async () => {
    try {
      const response = await apiRequest('/bookings', { token });
      const rides = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      const completed = rides
        .filter((ride) => String(ride.status || '').toLowerCase() === 'completed')
        .filter((ride) => ride.driver_id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 30);
      setPastRides(completed);
    } catch (err) {
      console.error('Fetch past rides error:', err);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      fetchRatings().catch(() => null);
      fetchPastRides().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchRatings, fetchPastRides]);

  const selectedRide = useMemo(
    () => pastRides.find((ride) => ride.id === selectedRideId),
    [pastRides, selectedRideId],
  );

  const handleOpenRatingForm = useCallback(
    (rideId) => {
      if (onRideSelected) {
        onRideSelected(rideId);
      }
      const ride = pastRides.find((r) => r.id === rideId);
      if (ride) {
        setSelectedRideId(rideId);
        setShowSubmitForm(true);
        setEditingRatingId(null);
        setScore(0);
        setFeedback('');
        setError('');
      }
    },
    [pastRides, onRideSelected],
  );

  const handleEditRating = useCallback((rating) => {
    setEditingRatingId(rating.id);
    setSelectedRideId(rating.booking_id);
    setScore(rating.score || 0);
    setFeedback(rating.feedback || '');
    setShowSubmitForm(true);
    setError('');
  }, []);

  const submitRating = useCallback(async () => {
    if (score === 0) {
      setError('Please select a rating');
      return;
    }
    if (!selectedRideId) {
      setError('Please select a ride');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const selectedRide = pastRides.find((r) => r.id === selectedRideId);

      if (editingRatingId) {
        // Update existing rating
        await apiRequest(`/v1/passengers/ratings/${editingRatingId}`, {
          method: 'PATCH',
          token,
          body: { score, feedback: feedback.trim() || null },
        });
        setRatings((prev) =>
          prev.map((r) =>
            r.id === editingRatingId ? { ...r, score, feedback } : r,
          ),
        );
      } else {
        // Create new rating
        const response = await apiRequest('/v1/passengers/ratings', {
          method: 'POST',
          token,
          body: {
            booking_id: selectedRideId,
            driver_id: selectedRide?.driver_id,
            score,
            feedback: feedback.trim() || null,
          },
        });
        setRatings((prev) => [response?.data || response, ...prev]);
      }

      resetForm();
    } catch (err) {
      setError(err.message || 'Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  }, [token, score, selectedRideId, pastRides, feedback, resetForm, editingRatingId]);

  const deleteRating = useCallback(
    (ratingId) => {
      Alert.alert('Delete Rating', 'Are you sure you want to delete this rating?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiRequest(`/v1/passengers/ratings/${ratingId}`, {
                method: 'DELETE',
                token,
              });
              setRatings((prev) => prev.filter((r) => r.id !== ratingId));
            } catch (_err) {
              setError('Failed to delete rating');
            }
          },
        },
      ]);
    },
    [token],
  );

  // ==================== FORM VIEW ====================
  if (showSubmitForm) {
    return (
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={styles.formSection}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {editingRatingId ? '✏️ Update Rating' : '⭐ Rate Your Ride'}
            </Text>
            <TouchableOpacity onPress={resetForm} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {!!error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Ride Context */}
          {!editingRatingId && (
            <>
              <Text style={styles.sectionLabel}>Select a Ride</Text>
              {unratedRides.length === 0 ? (
                <Text style={styles.noRidesText}>
                  {pastRides.length === 0
                    ? 'No completed rides available'
                    : 'All completed rides are already rated'}
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 16 }}>
                  {unratedRides.map((ride) => (
                    <TouchableOpacity
                      key={ride.id}
                      onPress={() => setSelectedRideId(ride.id)}
                      style={[
                        styles.rideSelectButton,
                        selectedRideId === ride.id && styles.rideSelectButtonActive,
                      ]}>
                      <Text style={styles.rideSelectDriver}>{ride.driver_name || 'Driver'}</Text>
                      <Text style={styles.rideSelectDate}>
                        {new Date(ride.created_at).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          )}

          {/* Selected Ride Context */}
          {selectedRide && (
            <RideContextCard ride={selectedRide} style={{ marginBottom: 16 }} />
          )}

          {/* Star Rating */}
          <Text style={styles.sectionLabel}>How was your experience?</Text>
          <RatingStars current={score} onSelect={setScore} size="large" />

          {/* Quick Rating Buttons */}
          {score === 0 && (
            <View style={styles.quickRatings}>
              <TouchableOpacity
                onPress={() => setScore(5)}
                style={[styles.quickButton, { backgroundColor: '#C8E6C9' }]}>
                <Text style={styles.quickEmoji}>😍</Text>
                <Text style={styles.quickLabel}>Excellent</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScore(4)}
                style={[styles.quickButton, { backgroundColor: '#DCEDC8' }]}>
                <Text style={styles.quickEmoji}>😊</Text>
                <Text style={styles.quickLabel}>Good</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScore(3)}
                style={[styles.quickButton, { backgroundColor: '#FFF9C4' }]}>
                <Text style={styles.quickEmoji}>😐</Text>
                <Text style={styles.quickLabel}>Average</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScore(2)}
                style={[styles.quickButton, { backgroundColor: '#FFE0B2' }]}>
                <Text style={styles.quickEmoji}>😕</Text>
                <Text style={styles.quickLabel}>Poor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScore(1)}
                style={[styles.quickButton, { backgroundColor: '#FFCDD2' }]}>
                <Text style={styles.quickEmoji}>😞</Text>
                <Text style={styles.quickLabel}>Terrible</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Feedback Section */}
          {score > 0 && (
            <>
              <Text style={styles.sectionLabel}>Add Feedback (Optional)</Text>
              <VoiceTextInput
                style={[styles.feedbackInput]}
                value={feedback}
                onChangeText={(text) => setFeedback(text.slice(0, 300))}
                placeholder="What could be improved? What went well?"
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={4}
              />
              <Text style={styles.charCount}>{feedback.length}/300 characters</Text>
            </>
          )}

          {/* Action Buttons */}
          <View style={styles.formActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={resetForm}
              disabled={submitting}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, score === 0 && styles.submitBtnDisabled]}
              onPress={submitRating}
              disabled={score === 0 || submitting}>
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {editingRatingId ? 'Update' : 'Submit'} Rating
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ==================== LIST VIEW ====================
  return (
    <View style={styles.container}>
      {/* Header & Filter Tabs */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Your Ratings</Text>
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, filterStatus === 'all' && styles.filterTabActive]}
            onPress={() => setFilterStatus('all')}>
            <Text style={styles.filterTabText}>All ({ratings.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filterStatus === 'rated' && styles.filterTabActive]}
            onPress={() => setFilterStatus('rated')}>
            <Text style={styles.filterTabText}>Rated ({ratings.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filterStatus === 'unrated' && styles.filterTabActive]}
            onPress={() => setFilterStatus('unrated')}>
            <Text style={styles.filterTabText}>Unrated ({unratedRides.length})</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Error Message */}
      {!!error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Unrated Rides Section */}
      {unratedRides.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rate These Rides</Text>
          {unratedRides.map((ride) => (
            <View key={ride.id} style={styles.unratedRideCard}>
              <View style={styles.unratedRideContent}>
                <Text style={styles.driverName}>{ride.driver_name || 'Driver'}</Text>
                <Text style={styles.rideDate}>
                  {new Date(ride.created_at).toLocaleDateString()}
                </Text>
                <Text style={styles.rideFare}>₹{ride.estimated_fare}</Text>
              </View>
              <TouchableOpacity
                style={styles.rateButton}
                onPress={() => handleOpenRatingForm(ride.id)}>
                <Text style={styles.rateButtonText}>Rate</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Rated Rides Section */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {filteredRatings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⭐</Text>
            <Text style={styles.emptyTitle}>{ratings.length === 0 ? 'No Ratings Yet' : 'No Ratings Match'}</Text>
            <Text style={styles.emptySubtitle}>
              {ratings.length === 0 ? 'Rate your completed rides' : 'Try another rating filter'}
            </Text>
            {unratedRides.length > 0 && (
              <TouchableOpacity
                style={styles.rateNowBtn}
                onPress={() => handleOpenRatingForm(unratedRides[0].id)}>
                <Text style={styles.rateNowBtnText}>Rate Now</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rating History</Text>
            {filteredRatings.map((rating) => {
              const ride = pastRides.find((r) => r.id === rating.booking_id);
              return (
                <View key={rating.id} style={styles.ratingCard}>
                  <View style={styles.ratingHeader}>
                    <View>
                      <Text style={styles.ratingDriver}>{ride?.driver_name || 'Driver'}</Text>
                      <Text style={styles.ratingDate}>
                        {formatRatingDate(rating.created_at)}
                      </Text>
                    </View>
                    <View style={styles.ratingScore}>
                      <Text style={styles.ratingStars}>
                        {'★'.repeat(rating.score)}
                        {'☆'.repeat(5 - rating.score)}
                      </Text>
                    </View>
                  </View>
                  {!!rating.feedback && (
                    <Text style={styles.ratingFeedback}>{rating.feedback}</Text>
                  )}
                  <View style={styles.ratingActions}>
                    <TouchableOpacity
                      onPress={() => handleEditRating(rating)}
                      style={styles.actionLink}>
                      <Text style={styles.actionLinkText}>✏️ Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => deleteRating(rating.id)}
                      style={styles.actionLink}>
                      <Text style={styles.actionLinkText}>🗑️ Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },

  // ========== LIST VIEW STYLES ==========
  listHeader: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F5F5F5',
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMain,
  },

  section: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },

  unratedRideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOWS.light,
  },
  unratedRideContent: {
    flex: 1,
  },
  driverName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  rideDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  rideFare: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  rateButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  rateButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  ratingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.light,
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  ratingDriver: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  ratingDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  ratingScore: {
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  ratingStars: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '700',
  },
  ratingFeedback: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginBottom: 10,
    lineHeight: 16,
  },
  ratingActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionLink: {
    paddingVertical: 6,
  },
  actionLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  rateNowBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  rateNowBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },

  // ========== FORM VIEW STYLES ==========
  formSection: {
    padding: 16,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  errorContainer: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: '500',
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 10,
  },

  noRidesText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },

  rideSelectButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginRight: 10,
    minWidth: 100,
    borderWidth: 2,
    borderColor: '#F5F5F5',
  },
  rideSelectButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2FD',
  },
  rideSelectDriver: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  rideSelectDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  rideContextCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  rideContextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  rideId: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  rideContextDetails: {
    marginBottom: 10,
  },
  rideContextText: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '500',
    marginVertical: 2,
  },
  rideContextFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  rideContextMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  starsContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  starTouchable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  star: {
    color: '#CCCCCC',
  },
  starActive: {
    color: '#FFD700',
  },
  ratingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  quickRatings: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 16,
  },
  quickButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  quickEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  quickLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMain,
  },

  feedbackInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textMain,
    textAlignVertical: 'top',
    marginBottom: 6,
  },
  charCount: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginBottom: 16,
  },

  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.textMain,
    fontWeight: '600',
    fontSize: 13,
  },
  submitBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
