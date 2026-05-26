import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiRequest } from '../lib/api';
import { normalizeAdminPaymentOptions, requiresUtrForPaymentMethod } from '../lib/paymentOptions';
import { COLORS, SHADOWS } from '../theme';
import WebCommandBar from '../components/WebCommandBar';
import VoiceTextInput from '../components/VoiceTextInput';

const LOGO_SOURCE = require('../../assets/images/autobuddy-logo.jpg');

export default function DriverProfile({ token, user, onLogout, onBack }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Account info
  const [userData, setUserData] = useState(user || {});
  const [autoDetails, setAutoDetails] = useState(null);
  const [ownerDetails, setOwnerDetails] = useState(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [pendingSubscriptionDues, setPendingSubscriptionDues] = useState([]);
  const [subscriptionPaymentOptions, setSubscriptionPaymentOptions] = useState(null);
  const [subscriptionPaymentMethod, setSubscriptionPaymentMethod] = useState('');
  const [subscriptionPaymentUtr, setSubscriptionPaymentUtr] = useState('');
  const [subscriptionPaymentRef, setSubscriptionPaymentRef] = useState('');
  const [referralInfo, setReferralInfo] = useState(null);

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Phone change
  const [showPhoneChange, setShowPhoneChange] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpError, setPhoneOtpError] = useState('');
  const [pendingPhoneVerification, setPendingPhoneVerification] = useState(null);
  const [phoneOtpSendFailed, setPhoneOtpSendFailed] = useState(false);
  const [adminRequesting, setAdminRequesting] = useState(false);
  const subscriptionPaymentConfig = normalizeAdminPaymentOptions(subscriptionPaymentOptions || {});

  const callApi = async (fn, successMessage) => {
    try {
      setLoading(true);
      setError('');
      if (successMessage) {
        setMessage('');
      }
      const result = await fn();
      if (successMessage) {
        setMessage(successMessage);
      }
      return result;
    } catch (err) {
      setError(err.message || 'Request failed.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const refreshProfileData = useCallback(async () => {
    try {
      const data = await apiRequest('/users/profile', { token });
      if (data) {
        setUserData(data);
        setPendingPhoneVerification(data.pending_phone_change || null);
      }
    } catch {
      setError('Failed to load profile data.');
    }

    try {
      const referralPayload = await apiRequest('/revenue/referral/me', { token });
      setReferralInfo(referralPayload?.referral || null);
    } catch {
      // Ignore referral fetch errors
    }

    try {
      const driverData = await apiRequest('/drivers/profile', { token });
      if (driverData) {
        setAutoDetails(driverData.auto_details || {});
        setOwnerDetails(driverData.owner_details || {});
      }
    } catch {
      // Ignore driver data fetch errors
    }

    try {
      const subPayload = await apiRequest('/subscriptions/me', { token }).catch(() => null);
      if (subPayload?.subscription) {
        setSubscriptionInfo(subPayload.subscription);
      }
      setPendingSubscriptionDues(Array.isArray(subPayload?.pending_dues) ? subPayload.pending_dues : []);
      setSubscriptionPaymentOptions(subPayload?.payment_options || null);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshProfileData().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshProfileData]);

  const changePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError('All password fields are required.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    const success = await callApi(
      () =>
        apiRequest('/users/change-password', {
          method: 'PUT',
          token,
          body: {
            current_password: currentPassword,
            new_password: newPassword,
          },
        }),
      'Password changed successfully.',
    );

    if (success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);
    }
  };

  const sendPhoneOtp = async () => {
    const normalizedPhone = String(newPhone || '').trim();
    if (!normalizedPhone) {
      setPhoneOtpError('Please enter a phone number.');
      return;
    }
    if (!/^[0-9]{10}$/.test(normalizedPhone)) {
      setPhoneOtpError('Phone number must be exactly 10 digits.');
      return;
    }
    if (normalizedPhone === userData?.phone) {
      setPhoneOtpError('New phone must be different from current phone.');
      return;
    }

    const result = await callApi(
      () =>
        apiRequest('/users/request-phone-change', {
          method: 'POST',
          token,
          body: { new_phone: normalizedPhone },
        }),
      'OTP sent to your new phone number.',
    );

    if (result) {
      setPhoneOtpSent(true);
      setPhoneOtpError('');
      setPhoneOtpSendFailed(false);
    } else {
      // API call failed to send OTP; enable admin verification fallback
      setPhoneOtpSendFailed(true);
    }
  };

  const requestAdminPhoneChange = async () => {
    const normalizedPhone = String(newPhone || '').trim();
    if (!normalizedPhone) {
      setPhoneOtpError('Please enter a phone number.');
      return;
    }
    setAdminRequesting(true);
    setError('');
    try {
      await apiRequest('/users/request-phone-change-admin', {
        method: 'POST',
        token,
        body: { new_phone: normalizedPhone },
      });
      setMessage('Requested admin verification for phone change.');
      setPhoneOtpSendFailed(false);
      setShowPhoneChange(false);
      setPendingPhoneVerification(normalizedPhone);
      setNewPhone('');
    } catch (err) {
      setError(err.message || 'Could not request admin verification.');
    } finally {
      setAdminRequesting(false);
    }
  };

  const verifyPhoneOtp = async () => {
    const normalizedOtp = String(phoneOtp || '').trim();
    if (!normalizedOtp) {
      setPhoneOtpError('Please enter the OTP.');
      return;
    }

    const result = await callApi(
      () =>
        apiRequest('/users/verify-phone-change', {
          method: 'POST',
          token,
          body: {
            new_phone: newPhone,
            otp: normalizedOtp,
          },
        }),
      'Phone number change submitted for admin approval.',
    );

    if (result) {
      setPendingPhoneVerification(newPhone);
      setNewPhone('');
      setPhoneOtp('');
      setPhoneOtpSent(false);
      setShowPhoneChange(false);
      setPhoneOtpError('');
    }
  };

  const shareReferralCode = async () => {
    const code = String(referralInfo?.code || userData?.referral_code || '').trim();
    if (!code) {
      setError('Referral code is not available yet.');
      return;
    }
    const shareMessage = `Join AutoBuddy with my referral code ${code} and start riding smarter.`;
    try {
      await Share.share({ message: shareMessage });
    } catch {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(shareMessage);
          setMessage('Referral message copied. Share it on WhatsApp, SMS, or social media.');
          return;
        } catch {
          // Ignore clipboard failures.
        }
      }
      setError('Could not open share dialog.');
    }
  };

  const openSubscriptionRazorpayLink = async () => {
    const link = String(subscriptionPaymentOptions?.razorpay_payment_link || '').trim();
    if (!link) {
      setError('Razorpay link is not configured by admin.');
      return;
    }
    try {
      await Linking.openURL(link);
    } catch {
      setError('Could not open Razorpay link.');
    }
  };

  const paySubscriptionDue = async () => {
    if (!subscriptionPaymentMethod) {
      setError('Select a payment method.');
      return;
    }
    if (requiresUtrForPaymentMethod(subscriptionPaymentMethod) && !subscriptionPaymentUtr.trim()) {
      setError('Enter UTR number for QR/UPI payment.');
      return;
    }
    const paid = await callApi(
      () =>
        apiRequest('/subscriptions/pay-due', {
          method: 'POST',
          token,
          body: {
            payment_method: subscriptionPaymentMethod,
            payment_utr: requiresUtrForPaymentMethod(subscriptionPaymentMethod) ? subscriptionPaymentUtr.trim() : undefined,
            payment_ref: subscriptionPaymentRef.trim() || undefined,
          },
        }),
      'Subscription payment submitted for admin verification.',
    );
    if (paid) {
      setSubscriptionPaymentMethod('');
      setSubscriptionPaymentUtr('');
      setSubscriptionPaymentRef('');
      await refreshProfileData();
    }
  };

  const duesPendingVerification = pendingSubscriptionDues.filter((due) => due?.status === 'pending_verification');
  const duesRejected = pendingSubscriptionDues.filter((due) => due?.status === 'rejected');
  const canSubmitDuePayment =
    Number(subscriptionInfo?.outstanding_amount || 0) > 0 &&
    duesPendingVerification.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <WebCommandBar />
        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
            <View style={styles.headerUserBlock}>
              <Text style={styles.hello}>Profile</Text>
              <Text style={styles.sub}>Driver Account Settings</Text>
            </View>
            <Image source={LOGO_SOURCE} style={styles.headerLogo} resizeMode="contain" />
            <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {loading && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}
            {!!error && <Text style={styles.error}>{error}</Text>}
            {!!message && <Text style={styles.message}>{message}</Text>}

            {/* User Account Information */}
            <View style={styles.infoBlock}>
              <Text style={styles.infoTitle}>Account Information</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name:</Text>
                <Text style={styles.infoValue}>{userData?.name || 'N/A'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email:</Text>
                <Text style={styles.infoValue}>{userData?.email || 'N/A'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Phone:</Text>
                <Text style={styles.infoValue}>{userData?.phone || 'N/A'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Referral Code:</Text>
                <Text style={styles.infoValue}>{referralInfo?.code || userData?.referral_code || 'Generating...'}</Text>
              </View>
              <TouchableOpacity style={styles.shareButton} onPress={shareReferralCode} disabled={loading}>
                <Text style={styles.shareButtonText}>Share Referral Code</Text>
              </TouchableOpacity>
              {pendingPhoneVerification && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    Phone change to {pendingPhoneVerification} is pending admin approval.
                  </Text>
                </View>
              )}
            </View>

            {/* Auto Details */}
            {autoDetails && Object.keys(autoDetails).length > 0 && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoTitle}>Auto Details</Text>
                {autoDetails.auto_number && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Auto Number:</Text>
                    <Text style={styles.infoValue}>{autoDetails.auto_number}</Text>
                  </View>
                )}
                {autoDetails.auto_stand_licence_number && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Stand License:</Text>
                    <Text style={styles.infoValue}>{autoDetails.auto_stand_licence_number}</Text>
                  </View>
                )}
                {autoDetails.auto_model && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Auto Model:</Text>
                    <Text style={styles.infoValue}>{autoDetails.auto_model}</Text>
                  </View>
                )}
                {autoDetails.auto_color && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Color:</Text>
                    <Text style={styles.infoValue}>{autoDetails.auto_color}</Text>
                  </View>
                )}
                {autoDetails.auto_registration_number && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Registration Number:</Text>
                    <Text style={styles.infoValue}>{autoDetails.auto_registration_number}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Subscription Information */}
            {subscriptionInfo && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoTitle}>Subscription Details</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Plan:</Text>
                  <Text style={styles.infoValue}>{String(subscriptionInfo.plan_type || 'None')}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Status:</Text>
                  <Text style={styles.infoValue}>{subscriptionInfo.is_active && subscriptionInfo.activated_by_admin ? 'Active' : 'Inactive'}</Text>
                </View>
                {subscriptionInfo.period_expires_at && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Expires:</Text>
                    <Text style={styles.infoValue}>{String(subscriptionInfo.period_expires_at)}</Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Outstanding Due:</Text>
                  <Text style={styles.infoValue}>INR {Number(subscriptionInfo.outstanding_amount || 0).toFixed(2)}</Text>
                </View>
                {Number(subscriptionInfo.outstanding_amount || 0) > 0 && (
                  <View style={styles.subscriptionDueBox}>
                    {!!subscriptionInfo?.per_trip_block_after_completed_rides && (
                      <Text style={styles.infoText}>
                        Per-trip limit: blocked after ride {subscriptionInfo.per_trip_block_after_completed_rides} until payment is verified.
                      </Text>
                    )}
                    {!!subscriptionInfo?.per_trip_rides_remaining_before_block && (
                      <Text style={styles.infoText}>
                        Rides left before block: {subscriptionInfo.per_trip_rides_remaining_before_block}
                      </Text>
                    )}
                    {duesPendingVerification.length > 0 && (
                      <Text style={styles.warningText}>
                        Payment is pending admin verification. New submission is locked.
                      </Text>
                    )}
                    {duesRejected.length > 0 && (
                      <Text style={styles.error}>
                        Last payment was rejected. Please repay and submit again.
                      </Text>
                    )}
                    <Text style={styles.inputLabel}>Payment Method</Text>
                    <View style={styles.optionRow}>
                      {subscriptionPaymentConfig.methods.map((method) => (
                        <TouchableOpacity
                          key={method.key}
                          style={[
                            styles.optionChip,
                            subscriptionPaymentMethod === method.key && styles.optionChipActive,
                          ]}
                          onPress={() => setSubscriptionPaymentMethod(method.key)}
                          disabled={loading || !canSubmitDuePayment}>
                          <Text
                            style={[
                              styles.optionChipText,
                              subscriptionPaymentMethod === method.key && styles.optionChipTextActive,
                            ]}>
                            {method.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {subscriptionPaymentMethod === 'qr' && (
                      <>
                        {!!subscriptionPaymentConfig.qrCodeUrl && (
                          <Image
                            source={{ uri: subscriptionPaymentConfig.qrCodeUrl }}
                            style={styles.subscriptionQrImage}
                            resizeMode="contain"
                          />
                        )}
                        {!!subscriptionPaymentConfig.upiId && (
                          <Text style={styles.infoText}>UPI ID: {subscriptionPaymentConfig.upiId}</Text>
                        )}
                      </>
                    )}
                    {requiresUtrForPaymentMethod(subscriptionPaymentMethod) && (
                      <>
                        <VoiceTextInput
                          style={styles.input}
                          value={subscriptionPaymentUtr}
                          onChangeText={setSubscriptionPaymentUtr}
                          placeholder="Enter UTR number (required)"
                          placeholderTextColor={COLORS.textMuted}
                          editable={!loading && canSubmitDuePayment}
                        />
                      </>
                    )}
                    {subscriptionPaymentMethod === 'razorpay' && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={openSubscriptionRazorpayLink}
                        disabled={loading || !canSubmitDuePayment}>
                        <Text style={styles.actionText}>Open Razorpay Link</Text>
                      </TouchableOpacity>
                    )}
                    <VoiceTextInput
                      style={styles.input}
                      value={subscriptionPaymentRef}
                      onChangeText={setSubscriptionPaymentRef}
                      placeholder="Payment reference (optional)"
                      placeholderTextColor={COLORS.textMuted}
                      editable={!loading && canSubmitDuePayment}
                    />
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={paySubscriptionDue}
                      disabled={loading || !canSubmitDuePayment}>
                      <Text style={styles.actionText}>Submit Payment For Verification</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {pendingSubscriptionDues.length > 0 && (
                  <>
                    <Text style={styles.infoTitle}>Pending Dues</Text>
                    {pendingSubscriptionDues.slice(0, 5).map((due) => (
                      <Text key={due.id} style={styles.infoText}>
                        Cycle {due.cycle_number}: INR {Number(due.amount || 0).toFixed(2)} ({due.status})
                        {due.payment_reject_reason ? ` - ${due.payment_reject_reason}` : ''}
                      </Text>
                    ))}
                  </>
                )}
              </View>
            )}

            {/* Owner Details - For Rented Auto */}
            {ownerDetails && Object.keys(ownerDetails).length > 0 && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoTitle}>
                  {autoDetails?.auto_ownership_type === 'rented' ? 'Auto Owner Details' : 'Owner Information'}
                </Text>
                {ownerDetails.owner_name && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Owner Name:</Text>
                    <Text style={styles.infoValue}>{ownerDetails.owner_name}</Text>
                  </View>
                )}
                {ownerDetails.owner_phone && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Owner Phone:</Text>
                    <Text style={styles.infoValue}>{ownerDetails.owner_phone}</Text>
                  </View>
                )}
                {ownerDetails.owner_email && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Owner Email:</Text>
                    <Text style={styles.infoValue}>{ownerDetails.owner_email}</Text>
                  </View>
                )}
                {ownerDetails.owner_address && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Owner Address:</Text>
                    <Text style={styles.infoValue}>{ownerDetails.owner_address}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Password Change */}
            {!showPasswordChange && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setShowPasswordChange(true)}
                disabled={loading}>
                <Text style={styles.actionText}>Change Password</Text>
              </TouchableOpacity>
            )}

            {showPasswordChange && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoTitle}>Change Password</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Current password"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={true}
                />
                <VoiceTextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password (min 8 characters)"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={true}
                />
                <VoiceTextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={true}
                />
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={changePassword}
                    disabled={loading}>
                    <Text style={styles.actionText}>Update Password</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowPasswordChange(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setError('');
                    }}
                    disabled={loading}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Phone Number Change */}
            {!showPhoneChange && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setShowPhoneChange(true)}
                disabled={loading}>
                <Text style={styles.actionText}>Change Phone Number</Text>
              </TouchableOpacity>
            )}

            {showPhoneChange && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoTitle}>Change Phone Number</Text>
                <Text style={styles.infoText}>Current: {userData?.phone}</Text>

                {!phoneOtpSent ? (
                  <>
                    <VoiceTextInput
                      style={styles.input}
                      value={newPhone}
                      onChangeText={(text) => {
                        setNewPhone(text);
                        setPhoneOtpError('');
                      }}
                      placeholder="New phone number (10 digits)"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="phone-pad"
                    />
                    {phoneOtpError && <Text style={styles.error}>{phoneOtpError}</Text>}
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={sendPhoneOtp}
                      disabled={loading}>
                      <Text style={styles.actionText}>Send OTP</Text>
                    </TouchableOpacity>
                    {phoneOtpSendFailed && (
                      <TouchableOpacity
                        style={[styles.actionButton, { marginTop: 8 }]}
                        onPress={requestAdminPhoneChange}
                        disabled={adminRequesting || loading}>
                        <Text style={styles.actionText}>{adminRequesting ? 'Requesting...' : 'Request admin verification'}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={styles.infoText}>
                      OTP sent to {newPhone}. Enter it below to verify:
                    </Text>
                    <VoiceTextInput
                      style={styles.input}
                      value={phoneOtp}
                      onChangeText={(text) => {
                        setPhoneOtp(text);
                        setPhoneOtpError('');
                      }}
                      placeholder="Enter OTP"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    {phoneOtpError && <Text style={styles.error}>{phoneOtpError}</Text>}
                    <View style={styles.buttonRow}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={verifyPhoneOtp}
                        disabled={loading}>
                        <Text style={styles.actionText}>Verify & Change</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={sendPhoneOtp}
                        disabled={loading}>
                        <Text style={styles.actionText}>Resend OTP</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowPhoneChange(false);
                    setNewPhone('');
                    setPhoneOtp('');
                    setPhoneOtpSent(false);
                    setPhoneOtpError('');
                    setError('');
                  }}
                  disabled={loading}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.spacer} />
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FDFB' },
  container: { flex: 1 },
  panel: { flex: 1, marginHorizontal: 20, marginVertical: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#202020',
    fontWeight: '600',
    fontSize: 14,
  },
  headerUserBlock: { flex: 1, marginLeft: 12 },
  hello: { fontSize: 22, fontWeight: '700', color: '#202020' },
  sub: { fontSize: 13, color: '#666666', marginTop: 2 },
  headerLogo: { width: 50, height: 50, borderRadius: 25 },
  logoutButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFE3E3',
    borderRadius: 8,
  },
  logoutText: { color: '#D32F2F', fontWeight: '600', fontSize: 13 },
  loader: { marginVertical: 16 },
  error: { color: '#D32F2F', marginVertical: 8, fontWeight: '600' },
  message: { color: '#2E7D32', marginVertical: 8, fontWeight: '600' },
  warningBox: {
    borderWidth: 1,
    borderColor: '#FFA726',
    borderRadius: 8,
    backgroundColor: '#FFF3E0',
    padding: 10,
    marginTop: 8,
  },
  warningText: { color: '#E65100', fontSize: 13, fontWeight: '500' },
  infoBlock: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
    ...SHADOWS.soft,
  },
  infoTitle: { fontSize: 16, fontWeight: '700', color: '#202020', marginBottom: 10 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  infoLabel: { fontSize: 13, fontWeight: '600', color: '#666666' },
  infoValue: { fontSize: 13, fontWeight: '500', color: '#202020' },
  infoText: { fontSize: 13, color: '#555555', marginBottom: 8 },
  inputLabel: { fontSize: 13, color: '#1E3126', fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    color: '#202020',
  },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
    ...SHADOWS.soft,
  },
  subscriptionDueBox: {
    marginTop: 8,
    gap: 8,
  },
  optionRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  optionChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F6FAF7',
  },
  optionChipActive: {
    borderColor: '#2E7D32',
    backgroundColor: '#E3F2E8',
  },
  optionChipText: { color: '#355243', fontWeight: '700' },
  optionChipTextActive: { color: '#2E7D32' },
  subscriptionQrImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
  },
  shareButton: {
    marginTop: 8,
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  actionText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  cancelButton: {
    backgroundColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flex: 1,
  },
  cancelText: { color: '#202020', fontWeight: '700', textAlign: 'center' },
  spacer: { height: 20 },
});
