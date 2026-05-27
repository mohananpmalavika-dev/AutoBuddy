import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PostRideTabs from './PostRideTabs';
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
import VoiceTextInput from './VoiceTextInput';

/**
 * PostRideRatingModal - Post-ride rating experience
 * 
 * Purpose:
 * - Trigger immediately after ride completion
 * - Seamless rating submission flow
 * - Driver feedback & trip review
 * - Option to skip for later
 * 
 * Features:
 * - 5-star rating system
 * - Optional feedback text
 * - Driver name & ride details
 * - Quick submit or skip
 * - Prevents duplicate ratings
 */

function RatingStars({ current, onSelect, size = 'large' }) {
  const starSize = size === 'large' ? 40 : 28;
  const tapSize = size === 'large' ? 50 : 40;
  
  return (
    <View style={styles.starsContainer}>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onSelect(star)}
            style={[styles.starTouchable, { width: tapSize, height: tapSize }]}>
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

export default function PostRideRatingModal({
  visible,
  booking,
  token,
  onClose,
  onRatingSubmitted,
}) {
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState('rate');
  const [receipt, setReceipt] = useState(null);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setScore(0);
      setFeedback('');
      setError('');
      setSubmitted(false);
    }
  }, [visible]);

  const rideDetails = useMemo(() => ({
    driverName: booking?.driver_name || 'Driver',
    id: booking?.id?.substring(0, 8) || '',
    date: booking?.created_at ? new Date(booking.created_at).toLocaleDateString() : '',
    fare: booking?.estimated_fare || booking?.fare || '0',
  }), [booking]);

  const handleSubmit = useCallback(async () => {
    if (score === 0) {
      setError('Please select a rating');
      return;
    }

    try {
      setError('');
      setLoading(true);

      const response = await apiRequest('/v1/passengers/ratings', {
        method: 'POST',
        token,
        body: {
          booking_id: booking.id,
          driver_id: booking.driver_id,
          score,
          feedback: feedback.trim() || null,
        },
      });

      setSubmitted(true);
      if (typeof onRatingSubmitted === 'function') {
        onRatingSubmitted(response?.data || response);
      }

      // Auto-close after 2 seconds on success
      setTimeout(() => {
        onClose?.();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to submit rating');
    } finally {
      setLoading(false);
    }
  }, [booking, score, feedback, token, onRatingSubmitted, onClose]);

  if (submitted) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.successContainer}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Rating Submitted!</Text>
            <Text style={styles.successSubtitle}>
              Thank you for your feedback. It helps us improve.
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Post-Ride Actions</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
          {/* Tabs for post-ride actions */}
          <PostRideTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            booking={{ ...booking, token }}
            receipt={receipt}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    ...SHADOWS.medium,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  closeButton: {
    padding: 8,
  },
  closeIcon: {
    fontSize: 20,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rideInfoCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  rideInfoDriver: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  rideInfoDetails: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  rideInfoFare: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  ratingSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 16,
    textAlign: 'center',
  },
  starsContainer: {
    alignItems: 'center',
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
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  quickRatings: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 6,
  },
  quickRatingButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderRadius: 8,
  },
  quickRatingEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  quickRatingText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  feedbackSection: {
    marginBottom: 16,
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
    minHeight: 100,
  },
  characterCount: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 6,
    textAlign: 'right',
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FAFAFA',
  },
  skipButtonText: {
    color: COLORS.textMain,
    fontWeight: '600',
    fontSize: 13,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  successContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 60,
    color: '#4CAF50',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
