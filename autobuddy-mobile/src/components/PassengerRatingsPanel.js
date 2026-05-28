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

function RatingStars({ current, onSelect }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onSelect(star)} style={styles.starContainer}>
          <Text style={[styles.star, star <= current && styles.starActive]}>
            {star <= current ? '*' : '-'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function PassengerRatingsPanel({ token, initialRideId = null, onRatingComplete = null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState([]);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [editingRatingId, setEditingRatingId] = useState(null);
  const [pastRides, setPastRides] = useState([]);
  const [selectedRideId, setSelectedRideId] = useState(initialRideId);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState('');

  const ratedBookingIds = useMemo(
    () => new Set(ratings.map((rating) => rating.booking_id).filter(Boolean)),
    [ratings],
  );

  const resetForm = useCallback(() => {
    setScore(0);
    setFeedback('');
    setSelectedRideId(null);
    setEditingRatingId(null);
    setError('');
  }, []);

  const fetchRatings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/ratings', { token });
      setRatings(Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load ratings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchPastRides = useCallback(async () => {
    try {
      const response = await apiRequest('/bookings', { token });
      const rides = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      setPastRides(
        rides
          .filter((ride) => String(ride.status || '').toLowerCase() === 'completed')
          .filter((ride) => ride.driver_id)
          .slice(0, 20),
      );
    } catch (err) {
      setError(err.message || 'Failed to load completed rides');
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchRatings().catch(() => null);
      fetchPastRides().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchRatings, fetchPastRides]);

  const unratedRides = useMemo(
    () => pastRides.filter((ride) => !ratedBookingIds.has(ride.id)).slice(0, 10),
    [pastRides, ratedBookingIds],
  );

  const submitRating = useCallback(async () => {
    const selectedRide = pastRides.find((ride) => ride.id === selectedRideId);
    if (score === 0 || (!editingRatingId && !selectedRide)) {
      setError('Please select a ride and give a rating');
      return;
    }

    try {
      setError('');
      setLoading(true);
      if (editingRatingId) {
        const response = await apiRequest(`/v1/passengers/ratings/${editingRatingId}`, {
          method: 'PATCH',
          token,
          body: {
            score,
            feedback: feedback.trim() || null,
          },
        });
        const updatedRating = response?.data || response;
        if (updatedRating) {
          setRatings((prev) =>
            prev.map((rating) => (rating.id === updatedRating.id ? updatedRating : rating)),
          );
        }
      } else {
        const response = await apiRequest('/v1/passengers/ratings', {
          method: 'POST',
          token,
          body: {
            booking_id: selectedRide.id,
            driver_id: selectedRide.driver_id,
            score,
            feedback: feedback.trim() || null,
          },
        });

        const newRating = response?.data || response;
        if (newRating) {
          setRatings((prev) => [newRating, ...prev]);
        }
      }
      setShowSubmitForm(false);
      resetForm();
    } catch (err) {
      setError(err.message || 'Failed to save rating');
    } finally {
      setLoading(false);
    }
  }, [token, score, selectedRideId, pastRides, feedback, resetForm, editingRatingId]);

  const deleteRating = useCallback(
    async (ratingId) => {
      Alert.alert('Delete Rating', 'Remove this rating?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiRequest(`/v1/passengers/ratings/${ratingId}`, { method: 'DELETE', token });
              setRatings((prev) => prev.filter((rating) => rating.id !== ratingId));
            } catch (err) {
              setError(err.message || 'Failed to delete rating');
            }
          },
        },
      ]);
    },
    [token],
  );

  if (showSubmitForm) {
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.formSection}>
          <Text style={styles.formTitle}>{editingRatingId ? 'Update Rating' : 'Rate Your Ride'}</Text>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {!editingRatingId && (
            <>
              <Text style={styles.fieldLabel}>Select Ride</Text>
              {unratedRides.length === 0 ? (
                <Text style={styles.noRidesText}>No completed rides available to rate</Text>
              ) : (
                <View style={styles.ridesDropdown}>
                  {unratedRides.map((ride) => (
                    <TouchableOpacity
                      key={ride.id}
                      style={[styles.rideOption, selectedRideId === ride.id && styles.rideOptionActive]}
                      onPress={() => setSelectedRideId(ride.id)}>
                      <Text style={styles.rideOptionText}>
                        {ride.driver_name || 'Driver'} - {new Date(ride.created_at).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={styles.fieldLabel}>Rating</Text>
          <RatingStars current={score} onSelect={setScore} />
          <Text style={styles.ratingText}>{score > 0 ? `${score} star${score !== 1 ? 's' : ''}` : 'Select a rating'}</Text>

          <Text style={styles.fieldLabel}>Feedback (Optional)</Text>
          <VoiceTextInput
            style={[styles.input, styles.textArea]}
            value={feedback}
            onChangeText={setFeedback}
            placeholder="Share your experience..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={3}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => {
                setShowSubmitForm(false);
                resetForm();
              }}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={submitRating}
              disabled={loading || score === 0}>
              <Text style={styles.submitButtonText}>
                {loading ? 'Saving...' : editingRatingId ? 'Update Rating' : 'Submit Rating'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {unratedRides.length > 0 && (
        <TouchableOpacity style={styles.addButton} onPress={() => setShowSubmitForm(true)}>
          <Text style={styles.addButtonText}>Rate a Ride</Text>
        </TouchableOpacity>
      )}

      {loading && ratings.length === 0 ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      ) : ratings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>Stars</Text>
          <Text style={styles.emptyStateText}>No ratings yet</Text>
          <Text style={styles.emptyStateSubtext}>Rate your rides to help improve driver quality</Text>
        </View>
      ) : (
        <View style={styles.ratingsList}>
          {ratings.map((rating) => (
            <View key={rating.id} style={styles.ratingCard}>
              <View style={styles.ratingHeader}>
                <View style={styles.ratingInfo}>
                  <Text style={styles.driverName}>{rating.driver_name || rating.driver_id || 'Driver'}</Text>
                  <Text style={styles.ratingStars}>{'*'.repeat(Number(rating.score || 0))}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteRating(rating.id)}>
                  <Text style={styles.deleteIcon}>X</Text>
                </TouchableOpacity>
              </View>

              {!!rating.feedback && <Text style={styles.ratingFeedback}>{rating.feedback}</Text>}

              <TouchableOpacity
                style={styles.editButton}
                onPress={() => {
                  setEditingRatingId(rating.id);
                  setScore(Number(rating.score || 0));
                  setFeedback(String(rating.feedback || ''));
                  setSelectedRideId(rating.booking_id || null);
                  setShowSubmitForm(true);
                }}>
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>

              <Text style={styles.ratingDate}>{new Date(rating.created_at).toLocaleDateString()}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  addButton: {
    margin: 12,
    padding: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  errorText: { color: '#D32F2F', fontSize: 12, margin: 12 },
  loader: { marginVertical: 40 },
  emptyState: { alignItems: 'center', marginVertical: 40 },
  emptyStateIcon: { fontSize: 20, fontWeight: '800', color: COLORS.primary, marginBottom: 10 },
  emptyStateText: { fontSize: 14, fontWeight: '700', color: COLORS.textMain },
  emptyStateSubtext: { fontSize: 12, color: COLORS.textMuted, marginTop: 6, maxWidth: 220, textAlign: 'center' },
  ratingsList: { padding: 12 },
  ratingCard: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
    ...SHADOWS.soft,
  },
  ratingHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  ratingInfo: { flex: 1 },
  driverName: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  ratingStars: { fontSize: 16, marginTop: 4, color: '#FFC107' },
  deleteIcon: { fontSize: 14, color: '#D32F2F', fontWeight: '700' },
  ratingFeedback: { fontSize: 12, color: COLORS.textMain, lineHeight: 16, marginBottom: 8 },
  editButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  editButtonText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  ratingDate: { fontSize: 10, color: COLORS.textMuted },
  formSection: {
    padding: 16,
    margin: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    ...SHADOWS.soft,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMain, marginBottom: 6 },
  noRidesText: { fontSize: 12, color: COLORS.textMuted, marginBottom: 16 },
  ridesDropdown: { marginBottom: 16 },
  rideOption: {
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    marginBottom: 8,
  },
  rideOptionActive: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  rideOptionText: { fontSize: 12, color: COLORS.textMain },
  starsRow: { flexDirection: 'row', marginBottom: 8 },
  starContainer: { padding: 4 },
  star: { fontSize: 32, color: '#CCCCCC' },
  starActive: { color: '#FFC107' },
  ratingText: { fontSize: 12, color: COLORS.textMuted, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textMain,
    marginBottom: 12,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: COLORS.border },
  submitButton: { backgroundColor: COLORS.primary },
  cancelButtonText: { color: COLORS.textMain, fontWeight: '700', fontSize: 13 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
