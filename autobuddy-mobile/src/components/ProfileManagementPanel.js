import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

const EMPTY_PROFILE = {
  name: '',
  email: '',
  phone: '',
  profile_photo: null,
  rating: 0,
  total_rides: 0,
  account_status: 'active',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
  emergency_contact_verified: false,
  emergency_contact_updated_at: null,
  bank_account_holder: '',
  bank_account_number: '',
  bank_account_masked: '',
  bank_ifsc_code: '',
  bank_name: '',
  bank_verification_status: 'not_submitted',
  bank_updated_at: null,
  two_factor_enabled: false,
};

function normalizeProfile(value = {}) {
  return {
    ...EMPTY_PROFILE,
    ...value,
    rating: Number(value.rating || 0),
    total_rides: Number(value.total_rides || 0),
  };
}

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function maskAccountNumber(value, fallback = '') {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return fallback || 'Not set';
  return `****${digits.slice(-4)}`;
}

function getStatusColor(status) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'verified', 'approved'].includes(normalized)) return COLORS.success;
  if (['pending', 'pending_verification', 'not_submitted'].includes(normalized)) return COLORS.warning;
  return COLORS.error;
}

function FormField({
  label,
  value,
  placeholder,
  onChange,
  editable = true,
  secure = false,
  keyboardType = 'default',
  disabled = false,
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, (!editable || disabled) && styles.fieldDisabled]}
        value={value}
        placeholder={placeholder}
        onChangeText={onChange}
        editable={editable && !disabled}
        placeholderTextColor={COLORS.textMuted}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

function EditableSectionHeader({ title, editing, onEdit }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!editing ? (
        <TouchableOpacity onPress={onEdit}>
          <Text style={styles.editButton}>Edit</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SecurityOption({ label, note, open, onPress }) {
  return (
    <TouchableOpacity style={styles.securityOption} onPress={onPress}>
      <View style={styles.securityInfo}>
        <Text style={styles.securityLabel}>{label}</Text>
        <Text style={styles.securityNote}>{note}</Text>
      </View>
      <Text style={styles.arrow}>{open ? 'Hide' : 'Open'}</Text>
    </TouchableOpacity>
  );
}

export default function ProfileManagementPanel({ token, loading: parentLoading = false }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [tempProfile, setTempProfile] = useState(EMPTY_PROFILE);
  const [editMode, setEditMode] = useState({
    personalInfo: false,
    bankDetails: false,
    emergencyContact: false,
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [twoFactor, setTwoFactor] = useState({ enabled: false, otpDemo: '', otp: '', disablePassword: '' });
  const [loginHistory, setLoginHistory] = useState([]);
  const [securityOpen, setSecurityOpen] = useState({
    password: false,
    twoFactor: false,
    loginHistory: false,
  });
  const [loading, setLoading] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const setTimedMessage = useCallback((nextMessage) => {
    setMessage(nextMessage);
    setTimeout(() => setMessage(''), 3000);
  }, []);

  const applyProfile = useCallback((payload) => {
    const nextProfile = normalizeProfile(payload?.profile || payload || {});
    setProfile(nextProfile);
    setTempProfile(nextProfile);
    setTwoFactor((previous) => ({ ...previous, enabled: Boolean(nextProfile.two_factor_enabled) }));
  }, []);

  const fetchSecurityState = useCallback(async () => {
    try {
      const [twoFactorPayload, loginPayload] = await Promise.all([
        apiRequest('/users/security/2fa', { token }),
        apiRequest('/users/security/login-history', { token }),
      ]);
      setTwoFactor((previous) => ({
        ...previous,
        enabled: Boolean(twoFactorPayload?.enabled),
      }));
      setLoginHistory(Array.isArray(loginPayload?.logins) ? loginPayload.logins : []);
    } catch {
      setLoginHistory([]);
    }
  }, [token]);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/profile', { token });
      applyProfile(data);
      await fetchSecurityState();
    } catch (err) {
      setError(err.message || 'Could not load profile.');
    } finally {
      setLoading(false);
    }
  }, [applyProfile, fetchSecurityState, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProfile().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchProfile]);

  const updateProfileFromResponse = (response, fallbackProfile = tempProfile) => {
    if (response?.profile) {
      applyProfile(response.profile);
    } else {
      applyProfile(fallbackProfile);
    }
  };

  const uploadProfilePhoto = useCallback(
    async (asset) => {
      try {
        setUploadingPhoto(true);
        setError('');

        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          type: asset.mimeType || 'image/jpeg',
          name: asset.fileName || `profile-${Date.now()}.jpg`,
        });

        const response = await apiRequest('/drivers/profile/photo', {
          token,
          method: 'POST',
          body: formData,
          isFormData: true,
        });

        applyProfile({ ...profile, profile_photo: response?.profile_photo || asset.uri });
        setTimedMessage('Profile photo updated.');
      } catch (err) {
        setError(err.message || 'Failed to upload photo');
        Alert.alert('Upload Failed', err.message || 'Could not upload photo');
      } finally {
        setUploadingPhoto(false);
      }
    },
    [applyProfile, profile, setTimedMessage, token],
  );

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is required to upload photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length) {
      await uploadProfilePhoto(result.assets[0]);
    }
  };

  const captureImage = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is required to capture a profile photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length) {
      await uploadProfilePhoto(result.assets[0]);
    }
  };

  const updatePersonalInfo = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/drivers/profile', {
        token,
        method: 'PUT',
        body: {
          name: tempProfile.name,
          email: tempProfile.email,
          phone: tempProfile.phone,
        },
      });
      updateProfileFromResponse(response, tempProfile);
      setEditMode((previous) => ({ ...previous, personalInfo: false }));
      setTimedMessage('Profile updated.');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const updateBankDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const payload = {
        bank_account_holder: tempProfile.bank_account_holder,
        bank_account_number: tempProfile.bank_account_number,
        bank_ifsc_code: tempProfile.bank_ifsc_code,
        bank_name: tempProfile.bank_name,
      };
      const response = await apiRequest('/drivers/profile/bank', {
        token,
        method: 'PUT',
        body: payload,
      });
      updateProfileFromResponse(response, {
        ...tempProfile,
        bank_account_masked: maskAccountNumber(payload.bank_account_number),
        bank_verification_status: 'pending_verification',
        bank_updated_at: new Date().toISOString(),
      });
      setEditMode((previous) => ({ ...previous, bankDetails: false }));
      setTimedMessage('Bank details submitted for verification.');
    } catch (err) {
      setError(err.message || 'Failed to update bank details');
    } finally {
      setLoading(false);
    }
  };

  const updateEmergencyContact = async () => {
    try {
      setLoading(true);
      setError('');
      const payload = {
        emergency_contact_name: tempProfile.emergency_contact_name,
        emergency_contact_phone: tempProfile.emergency_contact_phone,
        relationship: tempProfile.emergency_contact_relationship || 'Emergency contact',
      };
      const response = await apiRequest('/drivers/profile/emergency-contact', {
        token,
        method: 'PUT',
        body: payload,
      });
      updateProfileFromResponse(response, {
        ...tempProfile,
        emergency_contact_relationship: payload.relationship,
        emergency_contact_verified: true,
        emergency_contact_updated_at: new Date().toISOString(),
      });
      setEditMode((previous) => ({ ...previous, emergencyContact: false }));
      setTimedMessage('Emergency contact activated.');
    } catch (err) {
      setError(err.message || 'Failed to update emergency contact');
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (!passwordForm.current || !passwordForm.next || !passwordForm.confirm) {
      setError('All password fields are required.');
      return;
    }
    if (passwordForm.next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setError('New passwords do not match.');
      return;
    }

    try {
      setSecurityLoading(true);
      setError('');
      await apiRequest('/users/change-password', {
        token,
        method: 'PUT',
        body: {
          current_password: passwordForm.current,
          new_password: passwordForm.next,
        },
      });
      setPasswordForm({ current: '', next: '', confirm: '' });
      setSecurityOpen((previous) => ({ ...previous, password: false }));
      setTimedMessage('Password changed successfully.');
    } catch (err) {
      setError(err.message || 'Failed to change password');
    } finally {
      setSecurityLoading(false);
    }
  };

  const requestTwoFactor = async () => {
    try {
      setSecurityLoading(true);
      setError('');
      const response = await apiRequest('/users/security/2fa/request', {
        token,
        method: 'POST',
      });
      setTwoFactor((previous) => ({
        ...previous,
        otpDemo: response?.otp_demo || '',
        otp: response?.otp_demo || '',
      }));
      setTimedMessage('Verification code sent.');
    } catch (err) {
      setError(err.message || 'Failed to start two-factor setup');
    } finally {
      setSecurityLoading(false);
    }
  };

  const verifyTwoFactor = async () => {
    if (!twoFactor.otp.trim()) {
      setError('Enter the verification code.');
      return;
    }
    try {
      setSecurityLoading(true);
      setError('');
      await apiRequest('/users/security/2fa/verify', {
        token,
        method: 'POST',
        body: { otp: twoFactor.otp.trim() },
      });
      setTwoFactor((previous) => ({ ...previous, enabled: true, otp: '', otpDemo: '' }));
      applyProfile({ ...profile, two_factor_enabled: true });
      setTimedMessage('Two-factor authentication enabled.');
    } catch (err) {
      setError(err.message || 'Failed to verify code');
    } finally {
      setSecurityLoading(false);
    }
  };

  const disableTwoFactor = async () => {
    if (!twoFactor.disablePassword.trim()) {
      setError('Enter your current password to disable 2FA.');
      return;
    }
    try {
      setSecurityLoading(true);
      setError('');
      await apiRequest('/users/security/2fa/disable', {
        token,
        method: 'POST',
        body: { current_password: twoFactor.disablePassword },
      });
      setTwoFactor((previous) => ({ ...previous, enabled: false, disablePassword: '' }));
      applyProfile({ ...profile, two_factor_enabled: false });
      setTimedMessage('Two-factor authentication disabled.');
    } catch (err) {
      setError(err.message || 'Failed to disable two-factor authentication');
    } finally {
      setSecurityLoading(false);
    }
  };

  const refreshLoginHistory = async () => {
    try {
      setSecurityLoading(true);
      const response = await apiRequest('/users/security/login-history', { token });
      setLoginHistory(Array.isArray(response?.logins) ? response.logins : []);
    } catch (err) {
      setError(err.message || 'Failed to load login history');
    } finally {
      setSecurityLoading(false);
    }
  };

  const cancelEdit = (section) => {
    setTempProfile(profile);
    setEditMode((previous) => ({ ...previous, [section]: false }));
    setError('');
  };

  const stats = useMemo(
    () => [
      { label: 'Driver Rating', value: `${profile.rating.toFixed(1)}/5.0` },
      { label: 'Total Rides', value: profile.total_rides },
      { label: 'Account Status', value: String(profile.account_status || 'active').toUpperCase() },
    ],
    [profile.account_status, profile.rating, profile.total_rides],
  );

  if (loading && !profile.name) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Profile Management</Text>
      <Text style={styles.subtitle}>Manage driver identity, payout, emergency, and security settings.</Text>

      {error ? <Text style={[styles.message, styles.error]}>{error}</Text> : null}
      {message ? <Text style={[styles.message, styles.success]}>{message}</Text> : null}

      <View style={styles.photoSection}>
        <View style={styles.photoContainer}>
          {profile.profile_photo ? (
            <Image source={{ uri: profile.profile_photo }} style={styles.profilePhoto} />
          ) : (
            <View style={[styles.profilePhoto, styles.photoPlaceholder]}>
              <Text style={styles.photoPlaceholderText}>Photo</Text>
            </View>
          )}
          {uploadingPhoto ? (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : null}
        </View>
        <View style={styles.photoActions}>
          <TouchableOpacity style={styles.uploadButton} onPress={captureImage} disabled={uploadingPhoto || parentLoading}>
            <Text style={styles.uploadButtonText}>Use Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickImage} disabled={uploadingPhoto || parentLoading}>
            <Text style={styles.secondaryButtonText}>Choose Photo</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.ratingSection}>
        {stats.map((item) => (
          <View key={item.label} style={styles.ratingCard}>
            <Text style={styles.ratingLabel}>{item.label}</Text>
            <Text
              style={[
                styles.ratingValue,
                item.label === 'Account Status' && { color: getStatusColor(profile.account_status) },
              ]}
            >
              {item.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <EditableSectionHeader
          title="Personal Information"
          editing={editMode.personalInfo}
          onEdit={() => {
            setTempProfile(profile);
            setEditMode((previous) => ({ ...previous, personalInfo: true }));
          }}
        />
        {!editMode.personalInfo ? (
          <View style={styles.infoDisplay}>
            <InfoRow label="Name" value={profile.name || 'Not set'} />
            <InfoRow label="Email" value={profile.email || 'Not set'} />
            <InfoRow label="Phone" value={profile.phone || 'Not set'} />
          </View>
        ) : (
          <View style={styles.editForm}>
            <FormField disabled={loading || securityLoading} label="Full Name" value={tempProfile.name} placeholder="Enter your full name" onChange={(text) => setTempProfile({ ...tempProfile, name: text })} />
            <FormField disabled={loading || securityLoading} label="Email Address" value={tempProfile.email} placeholder="Enter your email" onChange={(text) => setTempProfile({ ...tempProfile, email: text })} keyboardType="email-address" />
            <FormField disabled={loading || securityLoading} label="Phone Number" value={tempProfile.phone} placeholder="10-digit phone number" onChange={(text) => setTempProfile({ ...tempProfile, phone: text })} keyboardType="phone-pad" />
            <ActionButtons onSave={updatePersonalInfo} onCancel={() => cancelEdit('personalInfo')} loading={loading} />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <EditableSectionHeader
          title="Emergency Contact"
          editing={editMode.emergencyContact}
          onEdit={() => {
            setTempProfile(profile);
            setEditMode((previous) => ({ ...previous, emergencyContact: true }));
          }}
        />
        {!editMode.emergencyContact ? (
          <View style={styles.infoDisplay}>
            <InfoRow label="Contact Name" value={profile.emergency_contact_name || 'Not set'} />
            <InfoRow label="Contact Phone" value={profile.emergency_contact_phone || 'Not set'} />
            <InfoRow label="Relationship" value={profile.emergency_contact_relationship || 'Not set'} />
            <InfoRow label="Status" value={profile.emergency_contact_verified ? 'Active for SOS escalation' : 'Not active'} />
            <InfoRow label="Updated" value={formatDate(profile.emergency_contact_updated_at)} />
          </View>
        ) : (
          <View style={styles.editForm}>
            <FormField disabled={loading || securityLoading} label="Contact Name" value={tempProfile.emergency_contact_name} placeholder="Name of emergency contact" onChange={(text) => setTempProfile({ ...tempProfile, emergency_contact_name: text })} />
            <FormField disabled={loading || securityLoading} label="Contact Phone" value={tempProfile.emergency_contact_phone} placeholder="10-digit phone number" onChange={(text) => setTempProfile({ ...tempProfile, emergency_contact_phone: text })} keyboardType="phone-pad" />
            <FormField disabled={loading || securityLoading} label="Relationship" value={tempProfile.emergency_contact_relationship} placeholder="Spouse, sibling, parent..." onChange={(text) => setTempProfile({ ...tempProfile, emergency_contact_relationship: text })} />
            <ActionButtons onSave={updateEmergencyContact} onCancel={() => cancelEdit('emergencyContact')} loading={loading} />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <EditableSectionHeader
          title="Bank Account Details"
          editing={editMode.bankDetails}
          onEdit={() => {
            setTempProfile(profile);
            setEditMode((previous) => ({ ...previous, bankDetails: true }));
          }}
        />
        {!editMode.bankDetails ? (
          <View style={styles.infoDisplay}>
            <InfoRow label="Bank Name" value={profile.bank_name || 'Not set'} />
            <InfoRow label="Account Holder" value={profile.bank_account_holder || 'Not set'} />
            <InfoRow label="Account Number" value={maskAccountNumber(profile.bank_account_number, profile.bank_account_masked)} />
            <InfoRow label="IFSC Code" value={profile.bank_ifsc_code || 'Not set'} />
            <InfoRow label="Verification" value={String(profile.bank_verification_status || 'not_submitted').replace(/_/g, ' ')} />
            <InfoRow label="Updated" value={formatDate(profile.bank_updated_at)} />
          </View>
        ) : (
          <View style={styles.editForm}>
            <FormField disabled={loading || securityLoading} label="Bank Name" value={tempProfile.bank_name} placeholder="e.g., HDFC Bank" onChange={(text) => setTempProfile({ ...tempProfile, bank_name: text })} />
            <FormField disabled={loading || securityLoading} label="Account Holder Name" value={tempProfile.bank_account_holder} placeholder="Name as per bank records" onChange={(text) => setTempProfile({ ...tempProfile, bank_account_holder: text })} />
            <FormField disabled={loading || securityLoading} label="Account Number" value={tempProfile.bank_account_number} placeholder="Your bank account number" onChange={(text) => setTempProfile({ ...tempProfile, bank_account_number: text })} keyboardType="number-pad" />
            <FormField disabled={loading || securityLoading} label="IFSC Code" value={tempProfile.bank_ifsc_code} placeholder="e.g., HDFC0001234" onChange={(text) => setTempProfile({ ...tempProfile, bank_ifsc_code: text.toUpperCase() })} />
            <View style={styles.noticeBlock}>
              <Text style={styles.noticeText}>Bank details are encrypted and submitted for payout verification before withdrawals use them.</Text>
            </View>
            <ActionButtons onSave={updateBankDetails} onCancel={() => cancelEdit('bankDetails')} loading={loading} />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Security</Text>
        <SecurityOption
          label="Change Password"
          note="Update your account password."
          open={securityOpen.password}
          onPress={() => setSecurityOpen((previous) => ({ ...previous, password: !previous.password }))}
        />
        {securityOpen.password ? (
          <View style={styles.securityPanel}>
            <FormField disabled={loading || securityLoading} label="Current Password" value={passwordForm.current} placeholder="Current password" secure onChange={(text) => setPasswordForm({ ...passwordForm, current: text })} />
            <FormField disabled={loading || securityLoading} label="New Password" value={passwordForm.next} placeholder="New password" secure onChange={(text) => setPasswordForm({ ...passwordForm, next: text })} />
            <FormField disabled={loading || securityLoading} label="Confirm Password" value={passwordForm.confirm} placeholder="Confirm new password" secure onChange={(text) => setPasswordForm({ ...passwordForm, confirm: text })} />
            <TouchableOpacity style={[styles.fullButton, securityLoading && styles.disabledButton]} onPress={changePassword} disabled={securityLoading}>
              <Text style={styles.fullButtonText}>Change Password</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <SecurityOption
          label="Two-Factor Authentication"
          note={twoFactor.enabled ? 'Enabled for this account.' : 'Add OTP verification to this account.'}
          open={securityOpen.twoFactor}
          onPress={() => setSecurityOpen((previous) => ({ ...previous, twoFactor: !previous.twoFactor }))}
        />
        {securityOpen.twoFactor ? (
          <View style={styles.securityPanel}>
            <InfoRow label="Status" value={twoFactor.enabled ? 'Enabled' : 'Disabled'} />
            {!twoFactor.enabled ? (
              <>
                <TouchableOpacity style={[styles.fullButton, securityLoading && styles.disabledButton]} onPress={requestTwoFactor} disabled={securityLoading}>
                  <Text style={styles.fullButtonText}>Send Verification Code</Text>
                </TouchableOpacity>
                {twoFactor.otpDemo ? <Text style={styles.devOtp}>Dev code: {twoFactor.otpDemo}</Text> : null}
                <FormField disabled={loading || securityLoading} label="Verification Code" value={twoFactor.otp} placeholder="6-digit code" onChange={(text) => setTwoFactor({ ...twoFactor, otp: text })} keyboardType="number-pad" />
                <TouchableOpacity style={[styles.fullButton, securityLoading && styles.disabledButton]} onPress={verifyTwoFactor} disabled={securityLoading}>
                  <Text style={styles.fullButtonText}>Enable 2FA</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <FormField disabled={loading || securityLoading} label="Current Password" value={twoFactor.disablePassword} placeholder="Current password" secure onChange={(text) => setTwoFactor({ ...twoFactor, disablePassword: text })} />
                <TouchableOpacity style={[styles.dangerFullButton, securityLoading && styles.disabledButton]} onPress={disableTwoFactor} disabled={securityLoading}>
                  <Text style={styles.fullButtonText}>Disable 2FA</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}

        <SecurityOption
          label="Login History"
          note="View recent signed-in sessions."
          open={securityOpen.loginHistory}
          onPress={() => {
            setSecurityOpen((previous) => ({ ...previous, loginHistory: !previous.loginHistory }));
            refreshLoginHistory();
          }}
        />
        {securityOpen.loginHistory ? (
          <View style={styles.securityPanel}>
            {securityLoading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
            {loginHistory.length > 0 ? (
              loginHistory.map((item) => (
                <View key={item.id || `${item.created_at}-${item.ip}`} style={styles.loginItem}>
                  <Text style={styles.loginTime}>{formatDate(item.created_at)}</Text>
                  <Text style={styles.loginMeta}>{item.ip || 'unknown'} - {item.status || 'active'}</Text>
                  <Text style={styles.loginAgent} numberOfLines={2}>{item.user_agent || 'Unknown device'}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No recent login sessions found.</Text>
            )}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ActionButtons({ onSave, onCancel, loading }) {
  return (
    <View style={styles.buttonGroup}>
      <TouchableOpacity style={[styles.button, styles.saveButton, loading && styles.disabledButton]} onPress={onSave} disabled={loading}>
        <Text style={styles.buttonText}>Save</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.cancelButton, loading && styles.disabledButton]} onPress={onCancel} disabled={loading}>
        <Text style={styles.buttonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 20,
  },
  message: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  error: {
    backgroundColor: '#FFEBEE',
    color: COLORS.error,
  },
  success: {
    backgroundColor: '#E8F5E9',
    color: COLORS.success,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  photoContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  profilePhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surface,
    ...SHADOWS.medium,
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  photoPlaceholderText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
  uploadButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    ...SHADOWS.soft,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '800',
  },
  ratingSection: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  ratingCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    ...SHADOWS.soft,
  },
  ratingLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...SHADOWS.soft,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  editButton: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  infoDisplay: {
    gap: 0,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    color: COLORS.textMain,
    fontWeight: '700',
  },
  editForm: {
    gap: 0,
  },
  fieldContainer: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 11,
    fontSize: 13,
    color: COLORS.textMain,
    backgroundColor: COLORS.background,
  },
  fieldDisabled: {
    color: COLORS.textMuted,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  saveButton: {
    backgroundColor: COLORS.success,
  },
  cancelButton: {
    backgroundColor: COLORS.error,
  },
  buttonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.5,
  },
  noticeBlock: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  noticeText: {
    fontSize: 12,
    color: COLORS.textMain,
    lineHeight: 16,
  },
  securityOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  securityInfo: {
    flex: 1,
    paddingRight: 12,
  },
  securityLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 2,
  },
  securityNote: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  arrow: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  securityPanel: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  fullButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 8,
  },
  dangerFullButton: {
    backgroundColor: COLORS.error,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 8,
  },
  fullButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  devOtp: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  loginItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  loginTime: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  loginMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 3,
  },
  loginAgent: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 3,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
