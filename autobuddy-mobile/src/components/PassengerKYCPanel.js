import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
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
 * PassengerKYCPanel - KYC (Know Your Customer) verification
 * Identity verification, document verification status
 */
export default function PassengerKYCPanel({ token }) {
  const [kycStatus, setKycStatus] = useState({
    is_verified: false,
    verification_level: 'unverified', // unverified, basic, verified
    document_type: '', // aadhar, pan, license, passport
    document_number: '',
    verification_date: null,
    expiry_date: null,
  });

  const [kycForm, setKycForm] = useState({
    document_type: '',
    document_number: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [expiryWarning, setExpiryWarning] = useState('');

  const fetchKYCStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/passengers/kyc/status', { token });
      setKycStatus((prev) => data || prev);
      setRejectionReason(data?.rejection_reason || '');
      
      // Check for expiry warnings
      if (data?.expiry_date) {
        const expiryDate = new Date(data.expiry_date);
        const today = new Date();
        const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry < 30 && daysUntilExpiry >= 0) {
          setExpiryWarning(`Your KYC will expire in ${daysUntilExpiry} days. Please renew.`);
        } else if (daysUntilExpiry < 0) {
          setExpiryWarning('Your KYC has expired. Please submit a new one.');
        }
      }
      
      setKycForm({
        document_type: data?.document_type || '',
        document_number: '',
      });
    } catch (err) {
      setError(err.message || 'Failed to load KYC status');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchKYCStatus().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchKYCStatus]);

  // Auto-poll KYC status every 30 seconds when pending
  useEffect(() => {
    if (kycStatus.verification_level === 'pending') {
      const pollInterval = setInterval(() => {
        fetchKYCStatus().catch(() => null);
      }, 30000);
      return () => clearInterval(pollInterval);
    }
  }, [kycStatus.verification_level, fetchKYCStatus]);

  // Announce status changes for accessibility
  useEffect(() => {
    if (kycStatus.verification_level === 'verified') {
      AccessibilityInfo.announceForAccessibility('KYC verification successful');
    } else if (kycStatus.verification_level === 'rejected') {
      AccessibilityInfo.announceForAccessibility('KYC verification rejected. Check details for reason.');
    } else if (kycStatus.verification_level === 'pending') {
      AccessibilityInfo.announceForAccessibility('KYC verification pending. Check status in 30 seconds.');
    }
  }, [kycStatus.verification_level]);

  const handleSubmitKYC = async () => {
    if (!kycForm.document_type || !kycForm.document_number) {
      setError('Please select document type and enter document number');
      return;
    }

    try {
      setVerifying(true);
      setError('');

      const response = await apiRequest('/passengers/kyc/verify', {
        token,
        method: 'POST',
        body: kycForm,
      });

      setKycStatus(response || kycForm);
      setMessage('KYC verification submitted successfully. Please wait for confirmation.');
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to submit KYC');
    } finally {
      setVerifying(false);
    }
  };

  const getVerificationStatusColor = () => {
    switch (kycStatus.verification_level) {
      case 'verified':
        return '#4CAF50';
      case 'basic':
        return '#FF9800';
      case 'pending':
        return '#2196F3';
      case 'rejected':
        return '#D32F2F';
      default:
        return '#F44336';
    }
  };

  const getVerificationStatusLabel = () => {
    switch (kycStatus.verification_level) {
      case 'verified':
        return 'Verified ✓';
      case 'basic':
        return 'Basic (Pending Full Verification)';
      case 'pending':
        return 'Verification Pending';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Not Verified';
    }
  };

  if (loading && !kycStatus.document_type) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {error && <Text style={styles.errorText}>❌ {error}</Text>}
      {message && <Text style={styles.messageText}>✓ {message}</Text>}
      {expiryWarning && <Text style={styles.warningText}>⚠️ {expiryWarning}</Text>}

      {/* Current Verification Status */}
      <View style={[styles.statusBlock, SHADOWS.card, { borderLeftWidth: 4, borderLeftColor: getVerificationStatusColor() }]}>
        <Text style={styles.sectionTitle}>Current Status</Text>
        <View style={styles.statusRow}>
          <View>
            <Text style={styles.statusLabel}>Verification Level</Text>
            <Text style={[styles.statusValue, { color: getVerificationStatusColor() }]}>
              {getVerificationStatusLabel()}
            </Text>
          </View>
        </View>

        {kycStatus.verification_date && (
          <>
            <Text style={styles.infoLabel}>Verified On</Text>
            <Text style={styles.infoValue}>{formatToIST(kycStatus.verification_date, { dateStyle: 'short' })}</Text>
          </>
        )}

        {kycStatus.document_type && (
          <>
            <Text style={styles.infoLabel}>Document Type</Text>
            <Text style={styles.infoValue}>{kycStatus.document_type.toUpperCase()}</Text>
            <Text style={styles.infoLabel}>Document Number</Text>
            <Text style={styles.infoValue}>{kycStatus.document_number || 'Not set'}</Text>
          </>
        )}

        {kycStatus.expiry_date && (
          <>
            <Text style={styles.infoLabel}>Expires On</Text>
            <Text style={styles.infoValue}>{formatToIST(kycStatus.expiry_date, { dateStyle: 'short' })}</Text>
          </>
        )}

        {kycStatus.verification_level === 'rejected' && rejectionReason && (
          <>
            <Text style={styles.rejectionLabel}>Rejection Reason</Text>
            <Text style={[styles.rejectionValue, { color: '#D32F2F' }]}>{rejectionReason}</Text>
            <Text style={styles.hint}>Please correct the issue and submit again</Text>
          </>
        )}
      </View>

      {/* KYC Information Card */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>What is KYC?</Text>
        <Text style={styles.descriptionText}>
          Know Your Customer (KYC) verification helps us ensure the safety and security of our platform. It allows you to unlock premium features and higher ride limits.
        </Text>
        <Text style={styles.descriptionText}>Accepted Documents:</Text>
        <Text style={styles.descriptionText}>• Aadhar Card (Indian national ID)</Text>
        <Text style={styles.descriptionText}>• PAN Card (Tax identification)</Text>
        <Text style={styles.descriptionText}>• Driver License</Text>
        <Text style={styles.descriptionText}>• Passport</Text>
      </View>

      {/* KYC Submission Form */}
      {(!kycStatus.is_verified || kycStatus.verification_level === 'basic') && (
        <View style={[styles.infoBlock, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>Submit/Update KYC</Text>

          <Text style={styles.formLabel}>Document Type</Text>
          <View style={styles.documentOptions}>
            {['aadhar', 'pan', 'license', 'passport'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.documentButton,
                  kycForm.document_type === type && styles.documentButtonActive,
                ]}
                onPress={() => setKycForm({ ...kycForm, document_type: type })}
              >
                <Text
                  style={[
                    styles.documentButtonText,
                    kycForm.document_type === type && styles.documentButtonTextActive,
                  ]}
                >
                  {type.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.formLabel}>Document Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your document number"
            value={kycForm.document_number}
            onChangeText={(text) => setKycForm({ ...kycForm, document_number: text })}
            editable={!verifying}
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.hintText}>
            ⓘ Your document number will be encrypted and stored securely.
          </Text>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmitKYC}
            disabled={verifying || !kycForm.document_type || !kycForm.document_number}
          >
            <Text style={styles.submitButtonText}>
              {verifying ? 'Submitting...' : 'Submit for Verification'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Benefits of KYC Verification */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Benefits of Verification</Text>
        <View style={styles.benefitItem}>
          <Text style={styles.benefitTitle}>✓ Higher Ride Limits</Text>
          <Text style={styles.benefitDescription}>Increased daily ride allowance after verification</Text>
        </View>
        <View style={styles.benefitItem}>
          <Text style={styles.benefitTitle}>✓ Priority Support</Text>
          <Text style={styles.benefitDescription}>Fast-track customer support for verified users</Text>
        </View>
        <View style={styles.benefitItem}>
          <Text style={styles.benefitTitle}>✓ Exclusive Offers</Text>
          <Text style={styles.benefitDescription}>Access to special promotions and discounts</Text>
        </View>
        <View style={styles.benefitItem}>
          <Text style={styles.benefitTitle}>✓ Enhanced Security</Text>
          <Text style={styles.benefitDescription}>Better fraud protection and account security</Text>
        </View>
      </View>

      {/* Contact Support */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Need Help?</Text>
        <Text style={styles.helpText}>
          If you face any issues during KYC verification, please contact our support team at support@autobuddy.com
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  statusBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  statusValue: { fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  infoBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 8, fontWeight: '600' },
  infoValue: { fontSize: 14, color: COLORS.text, marginBottom: 8 },
  descriptionText: { fontSize: 13, color: COLORS.text, lineHeight: 20, marginBottom: 6 },
  formLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  documentOptions: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  documentButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  documentButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  documentButtonText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  documentButtonTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    color: COLORS.text,
    fontSize: 14,
  },
  hintText: { fontSize: 11, color: COLORS.textMuted, marginBottom: 12, fontStyle: 'italic' },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  benefitItem: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  benefitTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  benefitDescription: { fontSize: 12, color: COLORS.textMuted },
  helpText: { fontSize: 13, color: COLORS.text, lineHeight: 20 },
  errorText: { color: '#F44336', fontSize: 12, marginBottom: 12, fontWeight: '600', padding: 8, backgroundColor: '#FFEBEE', borderRadius: 4 },
  messageText: { color: '#4CAF50', fontSize: 12, marginBottom: 12, fontWeight: '600', padding: 8, backgroundColor: '#E8F5E9', borderRadius: 4 },
  warningText: { color: '#FF6F00', fontSize: 12, marginBottom: 12, fontWeight: '600', padding: 8, backgroundColor: '#FFF3E0', borderRadius: 4 },
  rejectionLabel: { fontSize: 12, color: '#D32F2F', marginTop: 8, fontWeight: '600' },
  rejectionValue: { fontSize: 13, marginBottom: 8, lineHeight: 20 },
  hint: { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 },
});
