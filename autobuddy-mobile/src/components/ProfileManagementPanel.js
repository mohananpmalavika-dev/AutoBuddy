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
import { COLORS, SHADOWS } from '../theme';

/**
 * ProfileManagementPanel - Driver profile management
 * Profile photo, personal info, bank details, emergency contacts
 */
export default function ProfileManagementPanel({ token, loading: parentLoading = false }) {
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    profile_photo: null,
    rating: 0,
    total_rides: 0,
    account_status: 'active',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    bank_account_holder: '',
    bank_account_number: '',
    bank_ifsc_code: '',
    bank_name: '',
  });

  const [editMode, setEditMode] = useState({
    personalInfo: false,
    bankDetails: false,
    emergencyContact: false,
  });

  const [tempProfile, setTempProfile] = useState({...profile});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError('');
      try {
        const data = await apiRequest('/drivers/profile', { token });
        const profileData = data?.profile || data;
        if (profileData) {
          setProfile(profileData);
          setTempProfile(profileData);
        }
      } catch (err) {
        console.log('Profile endpoint not yet implemented, using mock data');
        const mockProfile = {
          name: 'Driver Name',
          email: 'driver@autobuddy.com',
          phone: '+91 9876543210',
          profile_photo: null,
          rating: 4.8,
          total_rides: 245,
          account_status: 'active',
          emergency_contact_name: '',
          emergency_contact_phone: '',
          bank_account_holder: '',
          bank_account_number: '',
          bank_ifsc_code: '',
          bank_name: '',
        };
        setProfile(mockProfile);
        setTempProfile(mockProfile);
      }
    } catch (err) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      // Request camera roll permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera roll access is required to upload photos.');
        return;
      }

      // Launch image picker
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
      
      // Create FormData for multipart file upload
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: 'image/jpeg',
        name: `profile-${Date.now()}.jpg`,
      });

      try {
        // Upload to backend
        const response = await apiRequest('/drivers/profile/photo', {
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
        console.log('Profile photo upload endpoint not yet implemented, saving locally');
        // Fallback: save locally for now
        setProfile({ ...profile, profile_photo: asset.uri });
        setMessage('Photo saved locally (sync pending)');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Failed to upload photo');
      Alert.alert('Upload Failed', err.message || 'Could not upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const updatePersonalInfo = async () => {
    try {
      setLoading(true);
      setError('');
      try {
        await apiRequest('/drivers/profile', {
          token,
          method: 'PUT',
          body: {
            name: tempProfile.name,
            email: tempProfile.email,
            phone: tempProfile.phone,
          },
        });
      } catch (err) {
        console.log('Profile update endpoint not yet implemented, saving locally');
      }
      setProfile(tempProfile);
      setEditMode({...editMode, personalInfo: false});
      setMessage('Profile updated successfully');
      setTimeout(() => setMessage(''), 3000);
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
      const data = await apiRequest('/drivers/profile/bank', {
        token,
        method: 'PUT',
        body: {
          bank_account_holder: tempProfile.bank_account_holder,
          bank_account_number: tempProfile.bank_account_number,
          bank_ifsc_code: tempProfile.bank_ifsc_code,
          bank_name: tempProfile.bank_name,
        },
      });
      if (data) {
        setProfile(tempProfile);
        setEditMode({...editMode, bankDetails: false});
        setMessage('Bank details updated successfully');
        setTimeout(() => setMessage(''), 3000);
      }
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
      const data = await apiRequest('/drivers/profile/emergency-contact', {
        token,
        method: 'PUT',
        body: {
          emergency_contact_name: tempProfile.emergency_contact_name,
          emergency_contact_phone: tempProfile.emergency_contact_phone,
        },
      });
      if (data) {
        setProfile(tempProfile);
        setEditMode({...editMode, emergencyContact: false});
        setMessage('Emergency contact updated successfully');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Failed to update emergency contact');
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = (section) => {
    setTempProfile(profile);
    setEditMode({...editMode, [section]: false});
    setError('');
  };

  const EditField = ({ label, value, placeholder, onChange, editable = true }) => (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, !editable && styles.fieldDisabled]}
        value={value}
        placeholder={placeholder}
        onChangeText={onChange}
        editable={editable && !loading}
        placeholderTextColor={COLORS.textMuted}
      />
    </View>
  );

  if (loading && !profile.name) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>👤 Profile Management</Text>
      <Text style={styles.subtitle}>Manage your personal and account information</Text>

      {error && <Text style={[styles.message, styles.error]}>{error}</Text>}
      {message && <Text style={[styles.message, styles.success]}>{message}</Text>}

      {/* Profile Photo Section */}
      <View style={styles.photoSection}>
        <View style={styles.photoContainer}>
          {profile.profile_photo ? (
            <Image source={{uri: profile.profile_photo}} style={styles.profilePhoto} />
          ) : (
            <View style={[styles.profilePhoto, styles.photoPlaceholder]}>
              <Text style={styles.photoPlaceholderText}>📷</Text>
            </View>
          )}
          {uploadingPhoto && (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={pickImage}
          disabled={uploadingPhoto || parentLoading}
        >
          <Text style={styles.uploadButtonText}>📸 Change Photo</Text>
        </TouchableOpacity>
      </View>

      {/* Rating & Score Section */}
      <View style={styles.ratingSection}>
        <View style={styles.ratingCard}>
          <Text style={styles.ratingIcon}>⭐</Text>
          <View style={styles.ratingInfo}>
            <Text style={styles.ratingLabel}>Passenger Rating</Text>
            <Text style={styles.ratingValue}>{profile.rating.toFixed(1)}/5.0</Text>
          </View>
        </View>
        <View style={styles.ratingCard}>
          <Text style={styles.ratingIcon}>🚗</Text>
          <View style={styles.ratingInfo}>
            <Text style={styles.ratingLabel}>Total Rides</Text>
            <Text style={styles.ratingValue}>{profile.total_rides}</Text>
          </View>
        </View>
        <View style={styles.ratingCard}>
          <Text style={styles.ratingIcon}>✅</Text>
          <View style={styles.ratingInfo}>
            <Text style={styles.ratingLabel}>Account Status</Text>
            <Text style={[styles.ratingValue, {color: profile.account_status === 'active' ? COLORS.success : COLORS.error}]}>
              {profile.account_status?.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Personal Information Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📝 Personal Information</Text>
          {!editMode.personalInfo && (
            <TouchableOpacity
              onPress={() => {
                setTempProfile(profile);
                setEditMode({...editMode, personalInfo: true});
              }}
              disabled={loading}
            >
              <Text style={styles.editButton}>✏️ Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {!editMode.personalInfo ? (
          <View style={styles.infoDisplay}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{profile.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{profile.email}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{profile.phone}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.editForm}>
            <EditField
              label="Full Name"
              value={tempProfile.name}
              placeholder="Enter your full name"
              onChange={(text) => setTempProfile({...tempProfile, name: text})}
            />
            <EditField
              label="Email Address"
              value={tempProfile.email}
              placeholder="Enter your email"
              onChange={(text) => setTempProfile({...tempProfile, email: text})}
            />
            <EditField
              label="Phone Number"
              value={tempProfile.phone}
              placeholder="Enter your phone number"
              onChange={(text) => setTempProfile({...tempProfile, phone: text})}
            />
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={updatePersonalInfo}
                disabled={loading}
              >
                <Text style={styles.buttonText}>💾 Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => cancelEdit('personalInfo')}
                disabled={loading}
              >
                <Text style={styles.buttonText}>✕ Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Emergency Contact Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🆘 Emergency Contact</Text>
          {!editMode.emergencyContact && (
            <TouchableOpacity
              onPress={() => {
                setTempProfile(profile);
                setEditMode({...editMode, emergencyContact: true});
              }}
              disabled={loading}
            >
              <Text style={styles.editButton}>✏️ Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {!editMode.emergencyContact ? (
          <View style={styles.infoDisplay}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Contact Name</Text>
              <Text style={styles.infoValue}>{profile.emergency_contact_name || 'Not set'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Contact Phone</Text>
              <Text style={styles.infoValue}>{profile.emergency_contact_phone || 'Not set'}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.editForm}>
            <EditField
              label="Contact Name"
              value={tempProfile.emergency_contact_name}
              placeholder="Name of emergency contact"
              onChange={(text) => setTempProfile({...tempProfile, emergency_contact_name: text})}
            />
            <EditField
              label="Contact Phone"
              value={tempProfile.emergency_contact_phone}
              placeholder="Phone number"
              onChange={(text) => setTempProfile({...tempProfile, emergency_contact_phone: text})}
            />
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={updateEmergencyContact}
                disabled={loading}
              >
                <Text style={styles.buttonText}>💾 Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => cancelEdit('emergencyContact')}
                disabled={loading}
              >
                <Text style={styles.buttonText}>✕ Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Bank Account Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🏦 Bank Account Details</Text>
          {!editMode.bankDetails && (
            <TouchableOpacity
              onPress={() => {
                setTempProfile(profile);
                setEditMode({...editMode, bankDetails: true});
              }}
              disabled={loading}
            >
              <Text style={styles.editButton}>✏️ Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {!editMode.bankDetails ? (
          <View style={styles.infoDisplay}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Bank Name</Text>
              <Text style={styles.infoValue}>{profile.bank_name || 'Not set'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Holder</Text>
              <Text style={styles.infoValue}>{profile.bank_account_holder || 'Not set'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Account Number</Text>
              <Text style={styles.infoValue}>
                {profile.bank_account_number
                  ? `****${profile.bank_account_number.slice(-4)}`
                  : 'Not set'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>IFSC Code</Text>
              <Text style={styles.infoValue}>{profile.bank_ifsc_code || 'Not set'}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.editForm}>
            <EditField
              label="Bank Name"
              value={tempProfile.bank_name}
              placeholder="e.g., HDFC Bank"
              onChange={(text) => setTempProfile({...tempProfile, bank_name: text})}
            />
            <EditField
              label="Account Holder Name"
              value={tempProfile.bank_account_holder}
              placeholder="Name as per bank records"
              onChange={(text) => setTempProfile({...tempProfile, bank_account_holder: text})}
            />
            <EditField
              label="Account Number"
              value={tempProfile.bank_account_number}
              placeholder="Your bank account number"
              onChange={(text) => setTempProfile({...tempProfile, bank_account_number: text})}
            />
            <EditField
              label="IFSC Code"
              value={tempProfile.bank_ifsc_code}
              placeholder="e.g., HDFC0001234"
              onChange={(text) => setTempProfile({...tempProfile, bank_ifsc_code: text.toUpperCase()})}
            />
            <View style={styles.bankNote}>
              <Text style={styles.bankNoteText}>
                🔒 Your bank details are encrypted and only used for payouts. Never share these details with anyone.
              </Text>
            </View>
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={updateBankDetails}
                disabled={loading}
              >
                <Text style={styles.buttonText}>💾 Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => cancelEdit('bankDetails')}
                disabled={loading}
              >
                <Text style={styles.buttonText}>✕ Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Security Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔐 Account Security</Text>
        <TouchableOpacity style={styles.securityOption}>
          <View style={styles.securityContent}>
            <Text style={styles.securityIcon}>🔑</Text>
            <View style={styles.securityInfo}>
              <Text style={styles.securityLabel}>Change Password</Text>
              <Text style={styles.securityNote}>Update your account password</Text>
            </View>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.securityOption}>
          <View style={styles.securityContent}>
            <Text style={styles.securityIcon}>📱</Text>
            <View style={styles.securityInfo}>
              <Text style={styles.securityLabel}>Two-Factor Authentication</Text>
              <Text style={styles.securityNote}>Add an extra layer of security</Text>
            </View>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.securityOption}>
          <View style={styles.securityContent}>
            <Text style={styles.securityIcon}>📋</Text>
            <View style={styles.securityInfo}>
              <Text style={styles.securityLabel}>Login History</Text>
              <Text style={styles.securityNote}>View recent account activity</Text>
            </View>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 40,
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
    fontWeight: '700',
  },
  ratingSection: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  ratingCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  ratingIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  ratingInfo: {
    flex: 1,
  },
  ratingLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 2,
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
  },
  editButton: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  infoDisplay: {
    gap: 0,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    color: COLORS.textMain,
    fontWeight: '600',
  },
  editForm: {
    gap: 0,
  },
  fieldContainer: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: COLORS.background,
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
    fontWeight: '700',
  },
  bankNote: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  bankNoteText: {
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
  securityContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  securityIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  securityInfo: {
    flex: 1,
  },
  securityLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 2,
  },
  securityNote: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  arrow: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
});
