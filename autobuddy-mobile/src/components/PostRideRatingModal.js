import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import LostItemTab from './LostItemTab';
import PostRideTabs from './PostRideTabs';
import ReceiptTab from './ReceiptTab';
import { formatToIST } from '../utils/time';

const POST_RIDE_TABS = [
  { key: 'rate', label: 'Rate Ride' },
  { key: 'report', label: 'Report Issue' },
  { key: 'lost', label: 'Lost Item' },
  { key: 'receipt', label: 'Receipt' },
];

const REPORT_CATEGORIES = [
  { label: 'Booking', value: 'booking' },
  { label: 'Payment', value: 'payment' },
  { label: 'Driver', value: 'driver' },
  { label: 'Safety', value: 'safety' },
  { label: 'Other', value: 'other' },
];

function formatMoney(value) {
  const amount = Number(value || 0);
  return `INR ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}

function RatingStars({ current, onSelect, size = 'large' }) {
  const starSize = size === 'large' ? 36 : 26;
  const tapSize = size === 'large' ? 48 : 38;

  return (
    <View style={styles.starsContainer}>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => {
          const selected = star <= current;
          return (
            <TouchableOpacity
              key={star}
              onPress={() => onSelect(star)}
              style={[styles.starTouchable, { width: tapSize, height: tapSize }, selected && styles.starTouchableActive]}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${star} star${star === 1 ? '' : 's'}`}
              accessibilityState={{ selected }}>
              <Text style={[styles.star, { fontSize: starSize }, selected && styles.starActive]}>
                {star}
              </Text>
            </TouchableOpacity>
          );
        })}
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
  const [reportCategory, setReportCategory] = useState('booking');
  const [reportDescription, setReportDescription] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSuccess, setReportSuccess] = useState('');

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setScore(0);
      setFeedback('');
      setError('');
      setSubmitted(false);
      setActiveTab('rate');
      setReportCategory('booking');
      setReportDescription('');
      setReportSuccess('');
    }, 0);
    return () => clearTimeout(timer);
  }, [visible]);

  const rideDetails = useMemo(() => ({
    driverName: booking?.driver_name || 'Driver',
    id: booking?.id ? String(booking.id).substring(0, 8) : '',
    date: booking?.created_at ? formatToIST(booking.created_at, { dateStyle: 'short' }) : '',
    fare: booking?.final_fare || booking?.estimated_fare || booking?.fare || 0,
  }), [booking]);

  const handleTabChange = useCallback((tabKey) => {
    setActiveTab(tabKey);
    setError('');
  }, []);

  const handleRatingSubmit = useCallback(async () => {
    if (!booking?.id) {
      setError('Booking is unavailable for rating.');
      return;
    }
    if (score === 0) {
      setError('Please select a rating.');
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
      setTimeout(() => {
        if (typeof onRatingSubmitted === 'function') {
          onRatingSubmitted(response?.data || response);
        }
        onClose?.();
      }, 900);
    } catch (err) {
      setError(err.message || 'Failed to submit rating.');
    } finally {
      setLoading(false);
    }
  }, [booking, score, feedback, token, onRatingSubmitted, onClose]);

  const handleReportSubmit = useCallback(async () => {
    if (!booking?.id) {
      setError('Booking is unavailable for this issue report.');
      return;
    }
    const description = reportDescription.trim();
    if (!description) {
      setError('Describe the issue before sending it to support.');
      return;
    }

    try {
      setError('');
      setReportSuccess('');
      setReportLoading(true);
      const shortId = String(booking.id).slice(0, 8);
      await apiRequest('/v1/passengers/support/tickets', {
        method: 'POST',
        token,
        body: {
          subject: `Post-ride issue ${shortId}`,
          category: reportCategory,
          priority: reportCategory === 'safety' ? 'urgent' : 'normal',
          description: [
            description,
            '',
            `Booking ID: ${booking.id}`,
            booking.driver_id ? `Driver ID: ${booking.driver_id}` : '',
          ].filter(Boolean).join('\n'),
        },
      });
      setReportSuccess('Support ticket created.');
      setReportDescription('');
    } catch (err) {
      setError(err.message || 'Failed to create support ticket.');
    } finally {
      setReportLoading(false);
    }
  }, [booking, reportCategory, reportDescription, token]);

  const renderRideSummary = () => (
    <View style={styles.rideInfoCard}>
      <Text style={styles.rideInfoDriver}>{rideDetails.driverName}</Text>
      <Text style={styles.rideInfoDetails}>
        Ride {rideDetails.id || 'N/A'}{rideDetails.date ? ` | ${rideDetails.date}` : ''}
      </Text>
      <Text style={styles.rideInfoFare}>{formatMoney(rideDetails.fare)}</Text>
    </View>
  );

  const renderError = () => (
    !!error && (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    )
  );

  const renderRatingTab = () => (
    <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {renderRideSummary()}
      <View style={styles.ratingSection}>
        <Text style={styles.sectionTitle}>How was your ride?</Text>
        <RatingStars current={score} onSelect={setScore} />
      </View>
      <View style={styles.quickRatings}>
        {[
          { score: 1, label: 'Poor' },
          { score: 3, label: 'Okay' },
          { score: 5, label: 'Great' },
        ].map((item) => {
          const selected = score === item.score;
          return (
            <TouchableOpacity
              key={item.score}
              style={[styles.quickRatingButton, selected && styles.quickRatingButtonActive]}
              onPress={() => setScore(item.score)}
              accessibilityRole="button"
              accessibilityState={{ selected }}>
              <Text style={[styles.quickRatingText, selected && styles.quickRatingTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.feedbackSection}>
        <Text style={styles.sectionTitle}>Optional feedback</Text>
        <VoiceTextInput
          value={feedback}
          onChangeText={(text) => setFeedback(text.slice(0, 500))}
          placeholder="Share anything that helps improve the ride experience"
          placeholderTextColor={COLORS.textMuted}
          multiline
          style={styles.feedbackInput}
        />
        <Text style={styles.characterCount}>{feedback.length}/500</Text>
      </View>
      {renderError()}
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.button, styles.skipButton]} onPress={onClose} disabled={loading}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.submitButton, loading && styles.buttonDisabled]}
          onPress={handleRatingSubmit}
          disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Submit Rating</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderReportTab = () => (
    <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {renderRideSummary()}
      <Text style={styles.sectionTitle}>What needs attention?</Text>
      <View style={styles.categoryRow}>
        {REPORT_CATEGORIES.map((category) => {
          const selected = reportCategory === category.value;
          return (
            <TouchableOpacity
              key={category.value}
              style={[styles.categoryChip, selected && styles.categoryChipActive]}
              onPress={() => setReportCategory(category.value)}
              disabled={reportLoading}
              accessibilityRole="button"
              accessibilityState={{ selected }}>
              <Text style={[styles.categoryChipText, selected && styles.categoryChipTextActive]}>
                {category.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.fieldLabel}>Issue details</Text>
      <VoiceTextInput
        value={reportDescription}
        onChangeText={(text) => setReportDescription(text.slice(0, 700))}
        placeholder="Describe what happened"
        placeholderTextColor={COLORS.textMuted}
        multiline
        style={styles.feedbackInput}
      />
      <Text style={styles.characterCount}>{reportDescription.length}/700</Text>
      {renderError()}
      {!!reportSuccess && <Text style={styles.successText}>{reportSuccess}</Text>}
      <TouchableOpacity
        style={[styles.fullWidthButton, reportLoading && styles.buttonDisabled]}
        onPress={handleReportSubmit}
        disabled={reportLoading}
        accessibilityRole="button">
        {reportLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Create Support Ticket</Text>}
      </TouchableOpacity>
    </ScrollView>
  );

  const renderActiveTab = () => {
    if (activeTab === 'report') {
      return renderReportTab();
    }
    if (activeTab === 'lost') {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          {renderRideSummary()}
          <LostItemTab bookingId={booking?.id} token={token} />
        </ScrollView>
      );
    }
    if (activeTab === 'receipt') {
      return (
        <ScrollView showsVerticalScrollIndicator={false}>
          <ReceiptTab bookingId={booking?.id} token={token} />
        </ScrollView>
      );
    }
    return renderRatingTab();
  };

  if (submitted) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.successContainer}>
            <Text style={styles.successIcon}>OK</Text>
            <Text style={styles.successTitle}>Rating Submitted</Text>
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
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Post-Ride Actions</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button">
              <Text style={styles.closeIcon}>x</Text>
            </TouchableOpacity>
          </View>
          <PostRideTabs
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabs={POST_RIDE_TABS}>
            {renderActiveTab()}
          </PostRideTabs>
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
    marginHorizontal: 16,
    marginTop: 14,
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
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  starsContainer: {
    alignItems: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 8,
  },
  starTouchable: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8DEE8',
    backgroundColor: '#FFFFFF',
  },
  starTouchableActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E8F5E9',
  },
  star: {
    color: COLORS.textMuted,
    fontWeight: '900',
  },
  starActive: {
    color: COLORS.primary,
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
    gap: 8,
  },
  quickRatingButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderBottomWidth: 3,
    borderBottomColor: '#D8DEE8',
    borderWidth: 1,
    borderColor: '#D8DEE8',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  quickRatingButtonActive: {
    borderColor: COLORS.primary,
    borderBottomColor: COLORS.primary,
    backgroundColor: '#E8F5E9',
  },
  quickRatingText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  quickRatingTextActive: {
    color: COLORS.primary,
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
    backgroundColor: '#FFFFFF',
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
    paddingVertical: 4,
    marginBottom: 12,
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
  buttonDisabled: {
    opacity: 0.65,
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
    fontSize: 28,
    color: '#4CAF50',
    fontWeight: '900',
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
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: '#D8DEE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  categoryChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E8F5E9',
  },
  categoryChipText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryChipTextActive: {
    color: COLORS.primary,
  },
  fieldLabel: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  fullWidthButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 18,
  },
  successText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
});
