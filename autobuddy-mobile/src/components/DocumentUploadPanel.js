import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

const DOCUMENT_TYPES = [
  { key: 'driver_license', label: 'Driver License', requiresExpiry: true },
  { key: 'vehicle_registration', label: 'Vehicle Registration', requiresExpiry: true },
  { key: 'vehicle_insurance', label: 'Vehicle Insurance', requiresExpiry: true },
  { key: 'pollution_certificate', label: 'Pollution Certificate', requiresExpiry: true },
  { key: 'aadhar', label: 'Aadhar/ID Proof', requiresExpiry: false },
  { key: 'pan', label: 'PAN Card', requiresExpiry: false },
  { key: 'selfie', label: 'Selfie/Liveness Photo', requiresExpiry: false },
];

const DOCUMENT_LABELS = DOCUMENT_TYPES.reduce((labels, item) => {
  labels[item.key] = item.label;
  return labels;
}, {});

function buildEmptyDocument(docType) {
  return {
    id: null,
    type: docType,
    doc_type: docType,
    label: DOCUMENT_LABELS[docType],
    status: 'pending',
    verification_status: 'pending',
    expiry: null,
    expiry_date: null,
    lastUpdated: null,
    uploaded_at: null,
    filename: null,
    content_type: null,
    size: null,
    download_url: null,
    reject_reason: null,
    requires_expiry: Boolean(DOCUMENT_TYPES.find((item) => item.key === docType)?.requiresExpiry),
  };
}

function buildEmptyDocuments() {
  return DOCUMENT_TYPES.reduce((documents, item) => {
    documents[item.key] = buildEmptyDocument(item.key);
    return documents;
  }, {});
}

function normalizeDocument(docType, document = {}) {
  const expiry = document.expiry_date || document.expiry || null;
  return {
    ...buildEmptyDocument(docType),
    ...document,
    type: docType,
    doc_type: docType,
    label: document.label || DOCUMENT_LABELS[docType],
    status: document.status || document.verification_status || 'pending',
    verification_status: document.verification_status || document.status || 'pending',
    expiry,
    expiry_date: expiry,
    lastUpdated: document.lastUpdated || document.updated_at || document.uploaded_at || null,
    requires_expiry: document.requires_expiry ?? Boolean(DOCUMENT_TYPES.find((item) => item.key === docType)?.requiresExpiry),
  };
}

function normalizeDocumentsPayload(payload) {
  const source = payload?.documents || {};
  const nextDocuments = {};

  DOCUMENT_TYPES.forEach((item) => {
    const rawDocument = source[item.key] || (item.key === 'vehicle_insurance' ? source.insurance_policy : null);
    nextDocuments[item.key] = normalizeDocument(item.key, rawDocument || {});
  });

  return nextDocuments;
}

function getDaysUntilExpiry(document) {
  if (typeof document.days_until_expiry === 'number') return document.days_until_expiry;
  if (!document.expiry_date) return null;
  const expiryDate = new Date(document.expiry_date);
  if (Number.isNaN(expiryDate.getTime())) return null;
  const now = new Date();
  return Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
}

function buildLocalReminders(documents) {
  return DOCUMENT_TYPES.map((item) => documents[item.key])
    .filter((document) => document?.requires_expiry && document.expiry_date)
    .map((document) => ({ ...document, days_until_expiry: getDaysUntilExpiry(document) }))
    .filter((document) => typeof document.days_until_expiry === 'number' && document.days_until_expiry <= 30)
    .sort((left, right) => left.days_until_expiry - right.days_until_expiry)
    .map((document) => ({
      doc_type: document.doc_type,
      label: document.label,
      expiry_date: document.expiry_date,
      days_until_expiry: document.days_until_expiry,
      is_expired: document.days_until_expiry < 0,
      message: document.days_until_expiry < 0 ? 'Expired document requires renewal' : `Renewal due in ${document.days_until_expiry} days`,
    }));
}

function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (!bytes) return 'Unknown size';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentUploadPanel({ token, loading: parentLoading = false }) {
  const [documents, setDocuments] = useState(buildEmptyDocuments);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState(null);
  const [deletingDocType, setDeletingDocType] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailDocument, setDetailDocument] = useState(null);
  const [expiryDrafts, setExpiryDrafts] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const setTimedMessage = useCallback((nextMessage) => {
    setMessage(nextMessage);
    setTimeout(() => setMessage(''), 3000);
  }, []);

  const mergeExpiryDrafts = useCallback((nextDocuments) => {
    setExpiryDrafts((previous) => {
      const nextDrafts = { ...previous };
      DOCUMENT_TYPES.forEach((item) => {
        if (nextDrafts[item.key] === undefined) {
          nextDrafts[item.key] = nextDocuments[item.key]?.expiry_date || '';
        }
      });
      return nextDrafts;
    });
  }, []);

  const applyDocumentsResponse = useCallback(
    (payload) => {
      const nextDocuments = normalizeDocumentsPayload(payload);
      setDocuments(nextDocuments);
      setReminders(payload?.reminders || buildLocalReminders(nextDocuments));
      mergeExpiryDrafts(nextDocuments);
      return nextDocuments;
    },
    [mergeExpiryDrafts],
  );

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/documents', { token });
      applyDocumentsResponse(data);
    } catch (err) {
      setError(err.message || 'Could not load documents.');
      const emptyDocuments = buildEmptyDocuments();
      setDocuments(emptyDocuments);
      setReminders([]);
      mergeExpiryDrafts(emptyDocuments);
    } finally {
      setLoading(false);
    }
  }, [applyDocumentsResponse, mergeExpiryDrafts, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDocuments().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDocuments]);

  const updateDocumentState = useCallback((docType, document) => {
    setDocuments((previous) => {
      const nextDocuments = {
        ...previous,
        [docType]: normalizeDocument(docType, document),
      };
      setReminders(buildLocalReminders(nextDocuments));
      return nextDocuments;
    });
  }, []);

  const uploadDocument = useCallback(
    async (docType) => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/*'],
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.length) return;

        const asset = result.assets[0];
        if (asset.size && asset.size > 5 * 1024 * 1024) {
          Alert.alert('File Too Large', 'File size must be less than 5MB.');
          return;
        }

        setUploadingDocType(docType);
        setError('');

        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          type: asset.mimeType || 'application/octet-stream',
          name: asset.name || `${docType}.pdf`,
        });
        formData.append('doc_type', docType);
        if (expiryDrafts[docType]) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDrafts[docType])) {
            setError('Expiry date must use YYYY-MM-DD format.');
            return;
          }
          formData.append('expiry_date', expiryDrafts[docType]);
        }

        const response = await apiRequest(`/drivers/documents/${docType}`, {
          method: 'POST',
          token,
          body: formData,
          isFormData: true,
        });

        if (response?.document) {
          updateDocumentState(docType, response.document);
          setDetailDocument(response.document);
        }
        await fetchDocuments();
        setTimedMessage(`${DOCUMENT_LABELS[docType]} uploaded for verification.`);
      } catch (err) {
        setError(err.message || 'Upload failed');
        Alert.alert('Upload Failed', err.message || 'Could not upload document');
      } finally {
        setUploadingDocType(null);
      }
    },
    [expiryDrafts, fetchDocuments, setTimedMessage, token, updateDocumentState],
  );

  const openDocumentDetail = useCallback(
    async (docType) => {
      setSelectedDocType((current) => (current === docType ? null : docType));
      setDetailDocument(documents[docType]);
      if (selectedDocType === docType) return;

      try {
        setDetailLoading(true);
        setError('');
        const response = await apiRequest(`/drivers/documents/${docType}`, { token });
        if (response?.document) {
          const normalized = normalizeDocument(docType, response.document);
          setDetailDocument(normalized);
          updateDocumentState(docType, normalized);
          setExpiryDrafts((previous) => ({
            ...previous,
            [docType]: normalized.expiry_date || previous[docType] || '',
          }));
        }
      } catch (err) {
        setError(err.message || 'Failed to load document details');
      } finally {
        setDetailLoading(false);
      }
    },
    [documents, selectedDocType, token, updateDocumentState],
  );

  const deleteDocument = useCallback(
    (docType) => {
      Alert.alert('Delete Document', `Remove ${DOCUMENT_LABELS[docType]}? You can upload it again anytime.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingDocType(docType);
              setError('');
              await apiRequest(`/drivers/documents/${docType}`, {
                method: 'DELETE',
                token,
              });
              const emptyDocument = buildEmptyDocument(docType);
              updateDocumentState(docType, emptyDocument);
              setDetailDocument(emptyDocument);
              setExpiryDrafts((previous) => ({ ...previous, [docType]: '' }));
              setTimedMessage(`${DOCUMENT_LABELS[docType]} removed.`);
            } catch (err) {
              setError(err.message || 'Failed to delete document');
            } finally {
              setDeletingDocType(null);
            }
          },
        },
      ]);
    },
    [setTimedMessage, token, updateDocumentState],
  );

  const openDownload = useCallback(async (document) => {
    if (!document?.download_url) {
      Alert.alert('Document Unavailable', 'This document does not have a downloadable file yet.');
      return;
    }
    try {
      await Linking.openURL(document.download_url);
    } catch (err) {
      Alert.alert('Open Failed', err.message || 'Could not open document');
    }
  }, []);

  const verificationSummary = useMemo(() => {
    const values = Object.values(documents);
    const verified = values.filter((document) => document.status === 'verified').length;
    const uploaded = values.filter((document) => document.filename || document.uploaded_at).length;
    return { verified, uploaded, total: DOCUMENT_TYPES.length };
  }, [documents]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'verified':
        return COLORS.success;
      case 'rejected':
        return COLORS.error;
      case 'pending':
        return COLORS.warning;
      default:
        return COLORS.textMuted;
    }
  };

  const renderDetail = (docType) => {
    const document = detailDocument?.doc_type === docType ? detailDocument : documents[docType];
    const isUploaded = Boolean(document.filename || document.uploaded_at);
    const isBusy = uploadingDocType === docType || deletingDocType === docType || detailLoading;

    return (
      <View style={styles.detailPanel}>
        {detailLoading ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>File</Text>
              <Text style={styles.detailValue}>{document.filename || 'No file uploaded'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Uploaded</Text>
              <Text style={styles.detailValue}>{formatDate(document.uploaded_at || document.lastUpdated)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Size</Text>
              <Text style={styles.detailValue}>{formatFileSize(document.size)}</Text>
            </View>
            {document.reject_reason ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Review note</Text>
                <Text style={[styles.detailValue, styles.rejectedText]}>{document.reject_reason}</Text>
              </View>
            ) : null}

            {document.requires_expiry ? (
              <View style={styles.expiryInputGroup}>
                <Text style={styles.detailLabel}>Expiry date</Text>
                <TextInput
                  style={styles.expiryInput}
                  value={expiryDrafts[docType] || ''}
                  onChangeText={(value) => setExpiryDrafts((previous) => ({ ...previous, [docType]: value }))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                />
              </View>
            ) : null}

            <View style={styles.detailActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, (!isUploaded || isBusy) && styles.buttonDisabled]}
                onPress={() => openDownload(document)}
                disabled={!isUploaded || isBusy}
              >
                <Text style={styles.secondaryButtonText}>View file</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, (!isUploaded || isBusy) && styles.buttonDisabled]}
                onPress={() => deleteDocument(docType)}
                disabled={!isUploaded || isBusy}
              >
                <Text style={[styles.secondaryButtonText, styles.deleteText]}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, (parentLoading || isBusy) && styles.buttonDisabled]}
                onPress={() => uploadDocument(docType)}
                disabled={parentLoading || isBusy}
              >
                <Text style={styles.primaryButtonText}>{isUploaded ? 'Reupload' : 'Upload'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    );
  };

  if (loading && verificationSummary.uploaded === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Documents & Verification</Text>
      <Text style={styles.subtitle}>
        {verificationSummary.uploaded}/{verificationSummary.total} uploaded, {verificationSummary.verified} verified
      </Text>

      {error ? <Text style={[styles.message, styles.error]}>{error}</Text> : null}
      {message ? <Text style={[styles.message, styles.success]}>{message}</Text> : null}

      {reminders.length > 0 ? (
        <View style={styles.renewalReminder}>
          <Text style={styles.reminderTitle}>Renewal reminders</Text>
          {reminders.map((reminder) => (
            <View key={reminder.doc_type} style={styles.reminderItem}>
              <View style={styles.reminderCopy}>
                <Text style={styles.reminderLabel}>{reminder.label}</Text>
                <Text style={styles.reminderText}>
                  {reminder.is_expired ? 'Expired' : reminder.message} on {formatDate(reminder.expiry_date)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.reminderButton}
                onPress={() => {
                  setSelectedDocType(reminder.doc_type);
                  setDetailDocument(documents[reminder.doc_type]);
                  uploadDocument(reminder.doc_type);
                }}
              >
                <Text style={styles.reminderButtonText}>Renew</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.renewalReminder}>
          <Text style={styles.reminderTitle}>Renewal reminders</Text>
          <Text style={styles.reminderText}>No document renewals are due in the next 30 days.</Text>
        </View>
      )}

      <View style={styles.documentsGrid}>
        {DOCUMENT_TYPES.map((item) => {
          const document = documents[item.key] || buildEmptyDocument(item.key);
          const daysLeft = getDaysUntilExpiry(document);
          const isUploaded = Boolean(document.filename || document.uploaded_at);
          const isExpired = typeof daysLeft === 'number' && daysLeft < 0;
          const isExpiring = typeof daysLeft === 'number' && daysLeft >= 0 && daysLeft <= 30;
          const isBusy = uploadingDocType === item.key || deletingDocType === item.key;

          return (
            <View key={item.key} style={styles.documentCard}>
              <View style={styles.documentHeader}>
                <View style={styles.documentTitleBlock}>
                  <Text style={styles.documentLabel}>{item.label}</Text>
                  <Text style={styles.documentMeta}>{isUploaded ? document.filename : 'Not uploaded yet'}</Text>
                </View>
                <Text style={[styles.statusBadge, { backgroundColor: getStatusColor(document.status) }]}>
                  {document.status}
                </Text>
              </View>

              {item.requiresExpiry ? (
                <Text style={[styles.expiryText, (isExpired || isExpiring) && styles.expiryWarning]}>
                  Expiry: {formatDate(document.expiry_date)}
                  {typeof daysLeft === 'number' ? ` (${daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`})` : ''}
                </Text>
              ) : null}

              {document.status === 'rejected' ? (
                <Text style={styles.rejectionNote}>{document.reject_reason || 'Please re-upload a valid document.'}</Text>
              ) : null}

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.secondaryButton, isBusy && styles.buttonDisabled]}
                  onPress={() => openDocumentDetail(item.key)}
                  disabled={isBusy}
                >
                  <Text style={styles.secondaryButtonText}>
                    {selectedDocType === item.key ? 'Hide details' : 'Details'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, (parentLoading || isBusy) && styles.buttonDisabled]}
                  onPress={() => uploadDocument(item.key)}
                  disabled={parentLoading || isBusy}
                >
                  <Text style={styles.primaryButtonText}>
                    {uploadingDocType === item.key ? 'Uploading...' : isUploaded ? 'Reupload' : 'Upload'}
                  </Text>
                </TouchableOpacity>
              </View>

              {selectedDocType === item.key ? renderDetail(item.key) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.complianceInfo}>
        <Text style={styles.infoTitle}>Compliance requirements</Text>
        <Text style={styles.infoText}>
          All driver and vehicle documents must be clear, valid, and current. Expiring documents trigger renewal reminders from backend expiry data.
        </Text>
      </View>
    </ScrollView>
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
    marginBottom: 16,
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
  renewalReminder: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.info,
    marginBottom: 16,
  },
  reminderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  reminderCopy: {
    flex: 1,
    paddingRight: 10,
  },
  reminderLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  reminderText: {
    fontSize: 12,
    color: COLORS.textMain,
    lineHeight: 16,
  },
  reminderButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reminderButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  documentsGrid: {
    marginBottom: 20,
  },
  documentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.soft,
  },
  documentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  documentTitleBlock: {
    flex: 1,
    paddingRight: 10,
  },
  documentLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  documentMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  expiryText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 8,
  },
  expiryWarning: {
    color: COLORS.error,
    fontWeight: '800',
  },
  rejectionNote: {
    color: COLORS.error,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    flex: 1,
    ...SHADOWS.soft,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#F4F6F8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border || '#D7DEE8',
  },
  secondaryButtonText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  detailPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border || '#D7DEE8',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  detailLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  detailValue: {
    color: COLORS.textMain,
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
  rejectedText: {
    color: COLORS.error,
    fontWeight: '700',
  },
  expiryInputGroup: {
    marginTop: 4,
    marginBottom: 12,
  },
  expiryInput: {
    borderWidth: 1,
    borderColor: COLORS.border || '#D7DEE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    color: COLORS.textMain,
    backgroundColor: COLORS.background,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 8,
  },
  deleteText: {
    color: COLORS.error,
  },
  complianceInfo: {
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.textMain,
    lineHeight: 18,
  },
});
