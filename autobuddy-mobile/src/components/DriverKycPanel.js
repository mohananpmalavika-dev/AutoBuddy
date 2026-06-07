import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { apiRequest } from '../lib/api';
import {
  appendPickerAssetToFormData,
  getPickerAssetSize,
  prepareImageAssetForUpload,
} from '../lib/uploadFormData';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

const DRIVER_DOCUMENT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const DRIVER_DOCUMENT_UPLOAD_TIMEOUT_MS = 60000;
const DRIVER_KYC_REQUEST_TIMEOUT_MS = 60000;
const DRIVER_DOCUMENT_IMAGE_MAX_DIMENSION = 1600;
const DRIVER_DOCUMENT_IMAGE_QUALITY = 0.76;
const DRIVER_SELFIE_PICKER_MEDIA_TYPES = ['images'];
const DRIVER_SELFIE_IMAGE_MAX_DIMENSION = 720;
const DRIVER_SELFIE_IMAGE_QUALITY = 0.65;

const REQUIRED_KYC_FILES = [
  {
    payloadKey: 'aadhaar_image_url',
    docType: 'aadhar',
    label: 'Aadhaar / ID proof',
    description: 'Upload a clear front/back scan or photo.',
    picker: 'document',
  },
  {
    payloadKey: 'license_image_url',
    docType: 'driver_license',
    label: 'Driving license',
    description: 'Upload the license image or PDF.',
    picker: 'document',
  },
  {
    payloadKey: 'rc_image_url',
    docType: 'vehicle_registration',
    label: 'Vehicle RC',
    description: 'Upload the registration certificate.',
    picker: 'document',
  },
  {
    payloadKey: 'selfie_image_url',
    docType: 'selfie',
    label: 'Live selfie',
    description: 'Take a current selfie for face and liveness review.',
    picker: 'selfie',
  },
];

const EMPTY_FORM = {
  aadhaar_number: '',
  license_number: '',
  rc_number: '',
  aadhaar_image_url: '',
  license_image_url: '',
  rc_image_url: '',
  selfie_image_url: '',
};

function digitsOnly(value, maxLength) {
  return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

function normalizeDocuments(payload = {}) {
  const source = payload?.documents && typeof payload.documents === 'object' ? payload.documents : {};
  return REQUIRED_KYC_FILES.reduce((documents, item) => {
    documents[item.docType] = source[item.docType] || null;
    return documents;
  }, {});
}

function getFileName(asset, fallbackName) {
  return asset?.name || asset?.fileName || fallbackName;
}

function getFileSize(asset) {
  return getPickerAssetSize(asset);
}

function getMimeType(asset, fallbackType) {
  return asset?.mimeType || asset?.type || fallbackType;
}

export default function DriverKycPanel({ token, onDataChanged }) {
  const [loading, setLoading] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [kycStatus, setKycStatus] = useState(null);
  const [documents, setDocuments] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);

  const setTimedMessage = useCallback((nextMessage) => {
    setMessage(nextMessage);
    setTimeout(() => setMessage(''), 3000);
  }, []);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const applyDocumentsPayload = useCallback((payload) => {
    const nextDocuments = normalizeDocuments(payload);
    const nextUrls = {};
    REQUIRED_KYC_FILES.forEach((item) => {
      const downloadUrl = nextDocuments[item.docType]?.download_url;
      if (downloadUrl) {
        nextUrls[item.payloadKey] = downloadUrl;
      }
    });
    setDocuments(nextDocuments);
    if (Object.keys(nextUrls).length > 0) {
      setForm((prev) => ({ ...prev, ...nextUrls }));
    }
    return nextDocuments;
  }, []);

  const refreshDocuments = useCallback(async () => {
    if (!token) {
      return null;
    }
    const payload = await apiRequest('/drivers/documents', { token, timeoutMs: DRIVER_KYC_REQUEST_TIMEOUT_MS });
    applyDocumentsPayload(payload);
    return payload;
  }, [applyDocumentsPayload, token]);

  const refreshKyc = useCallback(async () => {
    if (!token) {
      return;
    }
    const [kycResult, documentsResult] = await Promise.allSettled([
      apiRequest('/drivers/kyc', { token, timeoutMs: DRIVER_KYC_REQUEST_TIMEOUT_MS }),
      refreshDocuments(),
    ]);

    if (kycResult.status === 'rejected' && documentsResult.status === 'rejected') {
      const message =
        kycResult.reason?.message || documentsResult.reason?.message || 'Could not load KYC status.';
      setError(message);
      return;
    }

    setError('');
    const kycPayload = kycResult.status === 'fulfilled' ? kycResult.value : null;
    try {
      setKycStatus(kycPayload || null);
      if (kycPayload && kycPayload.status !== 'not_submitted') {
        const aadhaarFromServer = String(kycPayload.aadhaar_number || '');
        const rawAadhaarDigits = digitsOnly(aadhaarFromServer, 12);
        const canPrefillAadhaar = rawAadhaarDigits.length === 12 && !aadhaarFromServer.includes('*');
        setForm((prev) => ({
          ...prev,
          aadhaar_number: canPrefillAadhaar ? rawAadhaarDigits : prev.aadhaar_number || '',
          license_number: String(kycPayload.license_number || prev.license_number || ''),
          rc_number: String(kycPayload.rc_number || prev.rc_number || ''),
          aadhaar_image_url: String(kycPayload.aadhaar_image_url || prev.aadhaar_image_url || ''),
          license_image_url: String(kycPayload.license_image_url || prev.license_image_url || ''),
          rc_image_url: String(kycPayload.rc_image_url || prev.rc_image_url || ''),
          selfie_image_url: String(kycPayload.selfie_image_url || prev.selfie_image_url || ''),
        }));
      }
    } catch {
      setKycStatus(kycPayload || null);
    }
  }, [refreshDocuments, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshKyc().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshKyc]);

  const pickDocumentAsset = useCallback(async (requirement) => {
    if (requirement.picker === 'selfie') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is required to take a verification selfie.');
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: DRIVER_SELFIE_PICKER_MEDIA_TYPES,
        allowsEditing: true,
        aspect: [1, 1],
        quality: DRIVER_SELFIE_IMAGE_QUALITY,
      });
      return result.canceled ? null : result.assets?.[0] || null;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    return result.canceled ? null : result.assets?.[0] || null;
  }, []);

  const uploadRequirementFile = useCallback(
    async (requirement) => {
      try {
        const asset = await pickDocumentAsset(requirement);
        if (!asset) {
          return;
        }
        const fallbackName = getFileName(asset, `${requirement.docType}.jpg`);
        const preparedAsset = await prepareImageAssetForUpload(asset, {
          fallbackName,
          fallbackType: getMimeType(
            asset,
            requirement.picker === 'selfie' ? 'image/jpeg' : 'application/octet-stream',
          ),
          maxDimension:
            requirement.picker === 'selfie' ? DRIVER_SELFIE_IMAGE_MAX_DIMENSION : DRIVER_DOCUMENT_IMAGE_MAX_DIMENSION,
          quality: requirement.picker === 'selfie' ? DRIVER_SELFIE_IMAGE_QUALITY : DRIVER_DOCUMENT_IMAGE_QUALITY,
        });
        if (getFileSize(preparedAsset) > DRIVER_DOCUMENT_UPLOAD_MAX_BYTES) {
          Alert.alert('File Too Large', 'File size must be less than 5MB. For photos, crop or choose a smaller image.');
          return;
        }

        setUploadingDocType(requirement.docType);
        setError('');
        setMessage('');

        const formData = new FormData();
        await appendPickerAssetToFormData(
          formData,
          'file',
          preparedAsset,
          getFileName(preparedAsset, fallbackName),
          getMimeType(
            preparedAsset,
            requirement.picker === 'selfie' ? 'image/jpeg' : 'application/octet-stream',
          ),
        );

        const response = await apiRequest(`/drivers/documents/${requirement.docType}`, {
          method: 'POST',
          token,
          body: formData,
          isFormData: true,
          timeoutMs: DRIVER_DOCUMENT_UPLOAD_TIMEOUT_MS,
        });

        if (response?.document) {
          setDocuments((prev) => ({ ...prev, [requirement.docType]: response.document }));
          if (response.document.download_url) {
            setForm((prev) => ({ ...prev, [requirement.payloadKey]: response.document.download_url }));
          }
        }
        await refreshDocuments().catch(() => null);
        onDataChanged?.();
        setTimedMessage(`${requirement.label} uploaded for verification.`);
      } catch (err) {
        setError(err.message || 'Upload failed');
        Alert.alert('Upload Failed', err.message || 'Could not upload document');
      } finally {
        setUploadingDocType(null);
      }
    },
    [onDataChanged, pickDocumentAsset, refreshDocuments, setTimedMessage, token],
  );

  const submitKyc = async () => {
    const payload = {
      aadhaar_number: digitsOnly(form.aadhaar_number, 12),
      license_number: String(form.license_number || '').trim(),
      rc_number: String(form.rc_number || '').trim(),
      aadhaar_image_url: String(form.aadhaar_image_url || '').trim(),
      license_image_url: String(form.license_image_url || '').trim(),
      rc_image_url: String(form.rc_image_url || '').trim(),
      selfie_image_url: String(form.selfie_image_url || '').trim(),
    };
    const missingFile = REQUIRED_KYC_FILES.find((item) => !payload[item.payloadKey]);
    if (payload.aadhaar_number.length !== 12 || !payload.license_number || !payload.rc_number || missingFile) {
      setError('Complete Aadhaar, license, RC, and upload all required files before submitting.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setMessage('');
      const result = await apiRequest('/drivers/kyc', {
        method: 'POST',
        token,
        body: payload,
        timeoutMs: DRIVER_KYC_REQUEST_TIMEOUT_MS,
      });
      setTimedMessage(result?.message || 'KYC submitted for admin review.');
      await refreshKyc();
      onDataChanged?.();
    } catch (err) {
      setError(err.message || 'Could not submit KYC.');
    } finally {
      setLoading(false);
    }
  };

  const readyFilesCount = useMemo(
    () => REQUIRED_KYC_FILES.filter((item) => Boolean(form[item.payloadKey])).length,
    [form],
  );
  const maskedAadhaar = String(kycStatus?.aadhaar_number_masked || '').trim();

  const renderUploadRequirement = (requirement) => {
    const document = documents[requirement.docType] || {};
    const isUploaded = Boolean(form[requirement.payloadKey] || document.download_url);
    const isUploading = uploadingDocType === requirement.docType;

    return (
      <View key={requirement.docType} style={styles.uploadRow}>
        <View style={styles.uploadCopy}>
          <Text style={styles.uploadTitle}>{requirement.label}</Text>
          <Text style={styles.uploadMeta}>
            {isUploaded ? document.filename || 'File attached' : requirement.description}
          </Text>
        </View>
        <Text style={[styles.statusBadge, isUploaded ? styles.statusReady : styles.statusMissing]}>
          {isUploaded ? 'Ready' : 'Needed'}
        </Text>
        <TouchableOpacity
          style={[styles.uploadButton, (loading || isUploading) && styles.buttonDisabled]}
          onPress={() => uploadRequirementFile(requirement)}
          disabled={loading || isUploading}
        >
          <Text style={styles.uploadButtonText}>
            {isUploading ? 'Uploading...' : isUploaded ? 'Reupload' : requirement.picker === 'selfie' ? 'Take Selfie' : 'Upload'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>KYC & Driver Documents</Text>
      <Text style={styles.subtitle}>
        Status: {String(kycStatus?.status || 'not submitted')} - {readyFilesCount}/{REQUIRED_KYC_FILES.length} files ready
      </Text>
      {!!maskedAadhaar && <Text style={styles.maskedDocument}>Aadhaar on file: {maskedAadhaar}</Text>}
      {!!kycStatus?.reject_reason && (
        <Text style={styles.error}>Rejected: {kycStatus.reject_reason}</Text>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!message && <Text style={styles.message}>{message}</Text>}
      {(loading || uploadingDocType) && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}

      <Text style={styles.label}>Aadhaar Number</Text>
      <VoiceTextInput
        value={form.aadhaar_number}
        onChangeText={(value) => updateField('aadhaar_number', digitsOnly(value, 12))}
        keyboardType="number-pad"
        maxLength={12}
        placeholder={maskedAadhaar ? 'Enter full 12-digit Aadhaar to resubmit' : '12-digit Aadhaar'}
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Driving License Number</Text>
      <VoiceTextInput
        value={form.license_number}
        onChangeText={(value) => updateField('license_number', value.toUpperCase())}
        placeholder="License number"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>Vehicle RC Number</Text>
      <VoiceTextInput
        value={form.rc_number}
        onChangeText={(value) => updateField('rc_number', value.toUpperCase())}
        placeholder="RC number"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />

      <View style={styles.uploadSection}>
        <Text style={styles.sectionTitle}>Required uploads</Text>
        <Text style={styles.sectionHint}>
          Files are uploaded securely to your driver document vault. No pasted image URLs are required.
        </Text>
        {REQUIRED_KYC_FILES.map(renderUploadRequirement)}
      </View>

      <TouchableOpacity
        style={[styles.button, (loading || uploadingDocType) && styles.buttonDisabled]}
        onPress={submitKyc}
        disabled={loading || Boolean(uploadingDocType)}
      >
        <Text style={styles.buttonText}>Submit KYC For Review</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    backgroundColor: COLORS.surface,
    padding: 14,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  title: { color: COLORS.textMain, fontSize: 17, fontWeight: '900' },
  subtitle: { color: COLORS.textMuted, fontWeight: '700', marginTop: 4, marginBottom: 10 },
  maskedDocument: { color: COLORS.textMuted, fontWeight: '700', marginBottom: 10 },
  label: { color: COLORS.textMain, fontWeight: '700', marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: COLORS.textMain,
    marginBottom: 9,
  },
  uploadSection: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 10,
    marginBottom: 12,
  },
  sectionTitle: { color: COLORS.textMain, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  sectionHint: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 10, lineHeight: 17 },
  uploadRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5ECE7',
    paddingTop: 10,
    marginTop: 10,
  },
  uploadCopy: {
    marginBottom: 8,
  },
  uploadTitle: { color: COLORS.textMain, fontSize: 13, fontWeight: '800' },
  uploadMeta: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 8,
  },
  statusReady: {
    backgroundColor: COLORS.success,
  },
  statusMissing: {
    backgroundColor: COLORS.warning,
  },
  uploadButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  uploadButtonText: { color: COLORS.primary, fontWeight: '900' },
  button: {
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  error: { color: COLORS.danger, fontWeight: '700', marginBottom: 8 },
  message: { color: COLORS.primary, fontWeight: '700', marginBottom: 8 },
  loader: { marginBottom: 8 },
});
