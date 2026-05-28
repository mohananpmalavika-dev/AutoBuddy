import React, { useCallback, useEffect, useState } from 'react';
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
import { appendPickerAssetToFormData } from '../lib/uploadFormData';
import { COLORS, SHADOWS } from '../theme';

/**
 * PassengerProfilePanel - Passenger profile management
 * Personal info, profile photo, preferences, account settings
 */
export default function PassengerProfilePanel({ token, loading: parentLoading = false }) {
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    profile_photo: null,
    rating: 0,
    total_rides: 0,
    account_status: 'active',
    preferred_language: 'en',
    notifications_enabled: true,
    email_notifications: true,
    ride_sharing_enabled: false,
  });

  const [editMode, setEditMode] = useState({
    personalInfo: false,
    preferences: false,
  });

  const [tempProfile, setTempProfile] = useState({ ...profile });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/passengers/profile', { token });
      const profileData = data?.profile || data;
      if (profileData) {
        setProfile(profileData);
        setTempProfile(profileData);
      }
    } catch (err) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProfile().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchProfile]);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera roll access is required to upload photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingPhoto(true);
        await uploadProfilePhoto(result.assets[0]);
        setUploadingPhoto(false);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick image: ' + err.message);
    }
  };

  const uploadProfilePhoto = async (asset) => {
    try {
      setUploadingPhoto(true);
      setError('');

      const formData = new FormData();
      await appendPickerAssetToFormData(
        formData,
        'file',
        asset,
        'passenger-profile-photo.jpg',
        'image/jpeg',
      );

      const response = await apiRequest('/passengers/profile/photo', {
        token,
        method: 'POST',
        body: formData,
        isFormData: true,
      });

      if (response && response.profile_photo) {
        setProfile({ ...profile, profile_photo: response.profile_photo });
        setMessage('Profile photo updated successfully');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSavePersonalInfo = async () => {
    try {
      setLoading(true);
      setError('');

      const updateData = {
        name: tempProfile.name,
        email: tempProfile.email,
        phone: tempProfile.phone,
      };

      const response = await apiRequest('/passengers/profile/update', {
        token,
        method: 'POST',
        body: updateData,
      });

      const nextProfile = response?.profile || tempProfile;
      setProfile(nextProfile);
      setTempProfile(nextProfile);
      setEditMode({ ...editMode, personalInfo: false });
      setMessage('Personal info updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      setLoading(true);
      setError('');

      const updateData = {
        preferred_language: tempProfile.preferred_language,
        notifications_enabled: tempProfile.notifications_enabled,
        email_notifications: tempProfile.email_notifications,
        ride_sharing_enabled: tempProfile.ride_sharing_enabled,
      };

      const response = await apiRequest('/passengers/profile/preferences', {
        token,
        method: 'POST',
        body: updateData,
      });

      const nextProfile = response?.profile || tempProfile;
      setProfile(nextProfile);
      setTempProfile(nextProfile);
      setEditMode({ ...editMode, preferences: false });
      setMessage('Preferences updated successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    setError('');
    setMessage('');
    setDeleteConfirmationText('');
    setShowDeleteConfirm(true);
  };

  const submitDeleteAccountRequest = async () => {
    if (deleteConfirmationText.trim() !== 'DELETE') {
      setError('Type DELETE to confirm your account deletion request.');
      return;
    }

    try {
      setDeletingAccount(true);
      setError('');
      await apiRequest('/passengers/profile/delete', {
        token,
        method: 'DELETE',
        body: { confirmation: 'DELETE' },
      });
      setShowDeleteConfirm(false);
      setDeleteConfirmationText('');
      setProfile((prev) => ({ ...prev, account_status: 'deletion_pending' }));
      setMessage('Account deletion request submitted for admin review.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to request account deletion');
    } finally {
      setDeletingAccount(false);
    }
  };

  if (loading && profile.name === '') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {message && <Text style={styles.messageText}>{message}</Text>}

      {/* Profile Photo Section */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Profile Photo</Text>
        <View style={styles.photoSection}>
          {profile.profile_photo ? (
            <Image source={{ uri: profile.profile_photo }} style={styles.profilePhoto} />
          ) : (
            <View style={[styles.profilePhoto, { backgroundColor: COLORS.border }]}>
              <Text style={styles.photoPlaceholder}>📷</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.actionButton, { marginTop: 12 }]}
            onPress={pickImage}
            disabled={uploadingPhoto}
          >
            <Text style={styles.actionButtonText}>
              {uploadingPhoto ? 'Uploading...' : 'Change Photo'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile Stats */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Profile Stats</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.rating.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.total_rides}</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.account_status === 'active' ? '✓' : '✗'}</Text>
            <Text style={styles.statLabel}>Status</Text>
          </View>
        </View>
      </View>

      {/* Personal Information */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <TouchableOpacity onPress={() => setEditMode({ ...editMode, personalInfo: !editMode.personalInfo })}>
            <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
              {editMode.personalInfo ? 'Cancel' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        {editMode.personalInfo ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              value={tempProfile.name}
              onChangeText={(text) => setTempProfile({ ...tempProfile, name: text })}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={tempProfile.email}
              onChangeText={(text) => setTempProfile({ ...tempProfile, email: text })}
              keyboardType="email-address"
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone"
              value={tempProfile.phone}
              onChangeText={(text) => setTempProfile({ ...tempProfile, phone: text })}
              keyboardType="phone-pad"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleSavePersonalInfo}
              disabled={loading}
            >
              <Text style={styles.actionButtonText}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{profile.name}</Text>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{profile.email}</Text>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{profile.phone}</Text>
          </>
        )}
      </View>

      {/* Preferences */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <TouchableOpacity onPress={() => setEditMode({ ...editMode, preferences: !editMode.preferences })}>
            <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
              {editMode.preferences ? 'Cancel' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        {editMode.preferences ? (
          <>
            <Text style={styles.preferenceLabel}>Preferred Language</Text>
            <View style={styles.languageOptions}>
              {['en', 'ml', 'ta', 'te'].map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={[
                    styles.languageButton,
                    tempProfile.preferred_language === lang && styles.languageButtonActive,
                  ]}
                  onPress={() => setTempProfile({ ...tempProfile, preferred_language: lang })}
                >
                  <Text style={[styles.languageButtonText, tempProfile.preferred_language === lang && styles.languageButtonTextActive]}>
                    {lang.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Push Notifications</Text>
              <TouchableOpacity
                style={[styles.toggle, tempProfile.notifications_enabled && styles.toggleActive]}
                onPress={() => setTempProfile({ ...tempProfile, notifications_enabled: !tempProfile.notifications_enabled })}
              >
                <Text style={styles.toggleText}>{tempProfile.notifications_enabled ? 'On' : 'Off'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Email Notifications</Text>
              <TouchableOpacity
                style={[styles.toggle, tempProfile.email_notifications && styles.toggleActive]}
                onPress={() => setTempProfile({ ...tempProfile, email_notifications: !tempProfile.email_notifications })}
              >
                <Text style={styles.toggleText}>{tempProfile.email_notifications ? 'On' : 'Off'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Ride Sharing</Text>
              <TouchableOpacity
                style={[styles.toggle, tempProfile.ride_sharing_enabled && styles.toggleActive]}
                onPress={() => setTempProfile({ ...tempProfile, ride_sharing_enabled: !tempProfile.ride_sharing_enabled })}
              >
                <Text style={styles.toggleText}>{tempProfile.ride_sharing_enabled ? 'On' : 'Off'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleSavePreferences}
              disabled={loading}
            >
              <Text style={styles.actionButtonText}>
                {loading ? 'Saving...' : 'Save Preferences'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.infoLabel}>Language</Text>
            <Text style={styles.infoValue}>{profile.preferred_language.toUpperCase()}</Text>
            <Text style={styles.infoLabel}>Push Notifications</Text>
            <Text style={styles.infoValue}>{profile.notifications_enabled ? 'Enabled' : 'Disabled'}</Text>
            <Text style={styles.infoLabel}>Email Notifications</Text>
            <Text style={styles.infoValue}>{profile.email_notifications ? 'Enabled' : 'Disabled'}</Text>
          </>
        )}
      </View>

      {/* Account Actions */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Account Actions</Text>
        {showDeleteConfirm && (
          <View style={styles.deleteConfirmBox}>
            <Text style={styles.deleteConfirmTitle}>Confirm account deletion</Text>
            <Text style={styles.deleteConfirmText}>
              This submits a request for admin review. Type DELETE below to continue.
            </Text>
            <TextInput
              style={styles.input}
              value={deleteConfirmationText}
              onChangeText={setDeleteConfirmationText}
              placeholder="Type DELETE"
              autoCapitalize="characters"
              editable={!deletingAccount}
            />
            <View style={styles.deleteActionRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelDeleteButton]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmationText('');
                }}
                disabled={deletingAccount}
              >
                <Text style={styles.cancelDeleteButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.confirmDeleteButton,
                  deleteConfirmationText.trim() !== 'DELETE' && styles.disabledButton,
                ]}
                onPress={submitDeleteAccountRequest}
                disabled={deletingAccount || deleteConfirmationText.trim() !== 'DELETE'}
              >
                <Text style={styles.actionButtonText}>
                  {deletingAccount ? 'Submitting...' : 'Submit Request'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#F44336' }]}
          onPress={handleDeleteAccount}
          disabled={loading || deletingAccount}
        >
          <Text style={styles.actionButtonText}>Delete Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  infoBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  photoSection: { alignItems: 'center', marginBottom: 12 },
  profilePhoto: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  photoPlaceholder: { fontSize: 40 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  statCard: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  statLabel: { fontSize: 12, color: COLORS.textMuted },
  infoLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 8, fontWeight: '600' },
  infoValue: { fontSize: 14, color: COLORS.text, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    color: COLORS.text,
    fontSize: 14,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  actionButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  deleteConfirmBox: {
    borderWidth: 1,
    borderColor: '#F44336',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#FFF5F5',
  },
  deleteConfirmTitle: { color: '#B71C1C', fontSize: 14, fontWeight: '800', marginBottom: 6 },
  deleteConfirmText: { color: COLORS.text, fontSize: 13, lineHeight: 18, marginBottom: 10 },
  deleteActionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cancelDeleteButton: {
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    flex: 1,
    minWidth: 120,
  },
  cancelDeleteButtonText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  confirmDeleteButton: { backgroundColor: '#F44336', flex: 1, minWidth: 150 },
  disabledButton: { opacity: 0.5 },
  errorText: { color: '#F44336', fontSize: 12, marginBottom: 12, fontWeight: '600' },
  messageText: { color: '#4CAF50', fontSize: 12, marginBottom: 12, fontWeight: '600' },
  preferenceLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginBottom: 8 },
  languageOptions: { flexDirection: 'row', marginBottom: 16, flexWrap: 'wrap' },
  languageButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  languageButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  languageButtonText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  languageButtonTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  toggleLabel: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  toggle: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
});
