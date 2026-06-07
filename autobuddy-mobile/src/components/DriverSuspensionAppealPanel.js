import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { apiRequest } from '../lib/api';
import { GlassCard, PremiumEmptyState } from './PremiumUI';
import { formatToIST } from '../utils/time';

const FALLBACK_STATUSES = new Set([404, 405, 501]);
const ACTIVE_SUSPENSION_STATUS = {
  status: 'active',
  has_pending_appeal: false,
  can_appeal: false,
  appeal_deadline_days: 7,
};

function isEndpointUnavailable(err) {
  return FALLBACK_STATUSES.has(Number(err?.status));
}

export default function DriverSuspensionAppealPanel({ token, onAppealSubmitted = undefined }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [suspensionData, setSuspensionData] = useState(null);
  const [appealReason, setAppealReason] = useState('');
  const [supportingDetails, setSupportingDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const fetchSuspensionDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      let data;
      try {
        data = await apiRequest('/drivers/suspension-status', { token });
      } catch (err) {
        if (!isEndpointUnavailable(err)) {
          throw err;
        }
        data = ACTIVE_SUSPENSION_STATUS;
      }
      if (data) {
        setSuspensionData(data);
        setSubmitted(!!data.has_pending_appeal);
      }
    } catch (err) {
      setError(err.message || 'Could not load suspension details');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuspensionDetails().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchSuspensionDetails]);

  const handleSubmitAppeal = async () => {
    if (!appealReason.trim()) {
      setError('Please provide a reason for your appeal');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/drivers/suspension-appeals', {
        method: 'POST',
        token,
        body: {
          reason: appealReason.trim(),
          details: supportingDetails.trim(),
          timestamp: new Date().toISOString(),
        },
      });

      if (response) {
        setMessage('Appeal submitted successfully. Our team will review it within 48 hours.');
        setAppealReason('');
        setSupportingDetails('');
        setSubmitted(true);
        if (onAppealSubmitted) {
          onAppealSubmitted(response);
        }
        // Refresh suspension status
        await fetchSuspensionDetails();
      }
    } catch (err) {
      if (isEndpointUnavailable(err)) {
        setError('Appeal service is being updated. Please try again after the backend redeploy finishes.');
        return;
      }
      setError(err.message || 'Could not submit appeal');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !suspensionData) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error && !suspensionData) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchSuspensionDetails}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!suspensionData || suspensionData.status !== 'suspended') {
    return (
      <PremiumEmptyState
        title="No Active Suspension"
        subtitle="Your account is in good standing"
      />
    );
  }

  const suspensionReason = suspensionData.reason || 'Policy violation';
  const suspensionDate = suspensionData.suspended_at 
    ? formatToIST(suspensionData.suspended_at, { dateStyle: 'short' })
    : 'N/A';
  const daysRemaining = suspensionData.days_remaining || 'N/A';
  const canAppeal = suspensionData.can_appeal !== false;
  const appealDeadline = suspensionData.appeal_deadline_days || 7;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {message && (
        <GlassCard style={[styles.messageCard, styles.successCard]}>
          <Text style={styles.messageText}>{message}</Text>
        </GlassCard>
      )}

      {error && (
        <GlassCard style={[styles.messageCard, styles.errorCard]}>
          <Text style={styles.errorMessageText}>{error}</Text>
        </GlassCard>
      )}

      {/* Suspension Details */}
      <GlassCard style={styles.detailsCard}>
        <Text style={styles.sectionTitle}>Suspension Details</Text>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Reason:</Text>
          <Text style={styles.detailValue}>{suspensionReason}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Suspended On:</Text>
          <Text style={styles.detailValue}>{suspensionDate}</Text>
        </View>

        {suspensionData.days_suspended && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Days Suspended:</Text>
            <Text style={styles.detailValue}>{suspensionData.days_suspended}</Text>
          </View>
        )}

        {daysRemaining !== 'N/A' && (
          <View style={[styles.detailRow, styles.remainingRow]}>
            <Text style={styles.detailLabel}>Days Remaining:</Text>
            <Text style={[styles.detailValue, styles.remainingValue]}>
              {daysRemaining}
            </Text>
          </View>
        )}

        {suspensionData.suspension_end_date && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Eligible for Reinstatement:</Text>
            <Text style={styles.detailValue}>
              {formatToIST(suspensionData.suspension_end_date, { dateStyle: 'short' })}
            </Text>
          </View>
        )}
      </GlassCard>

      {/* Appeal Policy */}
      <GlassCard style={styles.policyCard}>
        <Text style={styles.sectionTitle}>Appeal Policy</Text>
        <View style={styles.policyContent}>
          <Text style={styles.policyText}>
            • You have {appealDeadline} days from suspension date to submit an appeal
          </Text>
          <Text style={styles.policyText}>
            • Appeals are reviewed by our compliance team within 48 hours
          </Text>
          <Text style={styles.policyText}>
            • Provide detailed context about why you believe the suspension was in error
          </Text>
          <Text style={styles.policyText}>
            • Supporting documents (photos, videos, messages) strengthen your appeal
          </Text>
          <Text style={styles.policyText}>
            • Successful appeals result in immediate reinstatement
          </Text>
        </View>
      </GlassCard>

      {/* Appeal Form */}
      {canAppeal && !submitted && (
        <GlassCard style={styles.formCard}>
          <Text style={styles.sectionTitle}>Submit Your Appeal</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Reason for Appeal *</Text>
            <TextInput
              style={styles.input}
              placeholder="Explain why you believe this suspension was unjustified"
              placeholderTextColor={COLORS.textSecondary}
              value={appealReason}
              onChangeText={setAppealReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Supporting Details (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Add any additional context, evidence, or references"
              placeholderTextColor={COLORS.textSecondary}
              value={supportingDetails}
              onChangeText={setSupportingDetails}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity 
            style={styles.submitButton}
            onPress={handleSubmitAppeal}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Appeal</Text>
            )}
          </TouchableOpacity>
        </GlassCard>
      )}

      {submitted && (
        <GlassCard style={[styles.submittedCard, styles.successCard]}>
          <Text style={styles.submittedTitle}>Appeal Submitted</Text>
          <Text style={styles.submittedText}>
            Your appeal has been submitted and is under review. You will receive an email update within 48 hours.
          </Text>
          <TouchableOpacity 
            style={styles.viewAppealButton}
            onPress={() => {/* Navigate to appeal history */}}
          >
            <Text style={styles.viewAppealButtonText}>View Appeal Status</Text>
          </TouchableOpacity>
        </GlassCard>
      )}

      {!canAppeal && (
        <GlassCard style={[styles.deniedCard, styles.errorCard]}>
          <Text style={styles.deniedTitle}>Appeal Deadline Passed</Text>
          <Text style={styles.deniedText}>
            Unfortunately, the appeal deadline for this suspension has passed. 
            Your account will be eligible for reinstatement on the date shown above.
          </Text>
        </GlassCard>
      )}

      {/* FAQs */}
      <GlassCard style={styles.faqCard}>
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>How long does appeal review take?</Text>
          <Text style={styles.faqAnswer}>
            Most appeals are reviewed within 48 hours. Complex cases may take up to 5 business days.
          </Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Can I appeal multiple times?</Text>
          <Text style={styles.faqAnswer}>
            You can submit one appeal per suspension. If your first appeal is denied, you may request a review with new evidence.
          </Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>What happens if my appeal is approved?</Text>
          <Text style={styles.faqAnswer}>
            Your account will be immediately reinstated and you can resume accepting rides.
          </Text>
        </View>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  messageCard: {
    marginBottom: 16,
    padding: 12,
  },
  successCard: {
    backgroundColor: '#34C75910',
    borderLeftWidth: 4,
    borderLeftColor: '#34C759',
  },
  errorCard: {
    backgroundColor: '#FF3B3010',
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
  },
  messageText: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '500',
  },
  errorMessageText: {
    fontSize: 13,
    color: '#FF3B30',
    fontWeight: '500',
  },
  detailsCard: {
    marginBottom: 16,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  remainingRow: {
    backgroundColor: `${COLORS.primary}10`,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  remainingValue: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  policyCard: {
    marginBottom: 16,
    padding: 14,
  },
  policyContent: {
    gap: 6,
  },
  policyText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  formCard: {
    marginBottom: 16,
    padding: 14,
  },
  formGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  submittedCard: {
    marginBottom: 16,
    padding: 14,
  },
  submittedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34C759',
    marginBottom: 8,
  },
  submittedText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
    marginBottom: 12,
  },
  viewAppealButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#34C75920',
    borderRadius: 6,
  },
  viewAppealButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
    textAlign: 'center',
  },
  deniedCard: {
    marginBottom: 16,
    padding: 14,
  },
  deniedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 8,
  },
  deniedText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  faqCard: {
    padding: 14,
  },
  faqItem: {
    marginVertical: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  faqQuestion: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  faqAnswer: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
});
