import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView } from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { useRatings } from '../contexts/RatingsContext';

/**
 * RatingModal - Post-trip rating component
 */
export default function RatingModal({ booking, onClose, onSubmit, token }) {
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState('');
  const { submitRating } = useRatings();

  const handleSubmitRating = useCallback(async () => {
    const ratingId = submitRating(booking.id, booking.driver_id, score, feedback);
    
    // Sync with backend
    try {
      await fetch(`/api/v1/passengers/ratings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          booking_id: booking.id,
          driver_id: booking.driver_id,
          score,
          feedback,
        }),
      });
    } catch (error) {
      console.error('Error submitting rating:', error);
    }

    if (onSubmit) onSubmit(ratingId);
    onClose();
  }, [score, feedback, booking, submitRating, onSubmit, onClose, token]);

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Rate Your Ride</Text>
          <Text style={styles.driverName}>{booking.driver_name}</Text>

          {/* Star Rating */}
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setScore(star)}
                style={styles.starButton}
              >
                <Text style={[styles.star, score >= star && styles.starActive]}>
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Feedback Input */}
          <TextInput
            style={styles.feedbackInput}
            placeholder="Share your feedback (optional)"
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            value={feedback}
            onChangeText={setFeedback}
          />

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.submitButton, score === 0 && styles.submitButtonDisabled]}
              onPress={handleSubmitRating}
              disabled={score === 0}
            >
              <Text style={styles.submitButtonText}>Submit Rating</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  driverName: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  starButton: {
    padding: 8,
  },
  star: {
    fontSize: 32,
    color: '#DDD',
  },
  starActive: {
    color: '#FFB800',
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  cancelButtonText: {
    fontWeight: '600',
    color: COLORS.textMain,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontWeight: '700',
    color: 'white',
  },
});
