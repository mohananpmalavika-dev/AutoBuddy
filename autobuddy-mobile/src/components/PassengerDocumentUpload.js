import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ProgressBarAndroid,
  ProgressViewIOS,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

const PassengerDocumentUpload = ({ token, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [requirements, setRequirements] = useState([]);
  const [status, setStatus] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(null);

  const loadDocumentRequirements = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', '/api/passenger/documents/requirements', null, {}, token);
      setRequirements(response.requirements || []);
    } catch (_error) {
      console.error('Error loading requirements:', _error);
      Alert.alert('Error', 'Failed to load document requirements');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadDocumentStatus = useCallback(async () => {
    try {
      const response = await apiRequest('GET', '/api/passenger/documents/status', null, {}, token);
      setStatus(response);
    } catch (_error) {
      console.error('Error loading status:', _error);
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted) {
        await loadDocumentRequirements();
        await loadDocumentStatus();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadDocumentRequirements, loadDocumentStatus]);

  const handleUploadDocument = async (documentType) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
      });

      if (result.canceled) {
        return;
      }

      const document = result.assets[0];
      
      // Create FormData
      const formData = new FormData();
      formData.append('file', {
        uri: document.uri,
        type: document.mimeType || 'application/octet-stream',
        name: document.name,
      });

      setUploadingDoc(documentType);

      await apiRequest(
        'POST',
        `/api/passenger/documents/upload/${documentType}`,
        formData,
        {
          'Content-Type': 'multipart/form-data',
        },
        token
      );

      Alert.alert('Success', 'Document uploaded successfully!');
      loadDocumentRequirements();
      loadDocumentStatus();
    } catch (_error) {
      console.error('Error uploading document:', _error);
      Alert.alert('Error', _error.message || 'Failed to upload document');
    } finally {
      setUploadingDoc(null);
    }
  };

  const getStatusColor = () => {
    if (!status) return COLORS.gray;
    switch (status.status) {
      case 'compliant':
      case 'exempt':
        return COLORS.success || '#4CAF50';
      case 'grace_period':
        return COLORS.warning || '#FF9800';
      case 'non_compliant':
        return COLORS.danger || '#F44336';
      default:
        return COLORS.gray;
    }
  };

  const getStatusIcon = () => {
    if (!status) return '?';
    switch (status.status) {
      case 'compliant':
      case 'exempt':
        return '✓';
      case 'grace_period':
        return '⏱';
      case 'non_compliant':
        return '✗';
      default:
        return '?';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Document Verification</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status Banner */}
        {status && (
          <View style={[styles.statusBanner, { borderLeftColor: getStatusColor() }]}>
            <View style={styles.statusContent}>
              <View style={[styles.statusIcon, { backgroundColor: getStatusColor() }]}>
                <Text style={styles.statusIconText}>{getStatusIcon()}</Text>
              </View>
              <View style={styles.statusText}>
                <Text style={styles.statusTitle}>{status.status.toUpperCase()}</Text>
                <Text style={styles.statusMessage}>{status.message}</Text>
                {status.days_remaining > 0 && status.status === 'grace_period' && (
                  <Text style={styles.graceText}>
                    ⏰ {status.days_remaining} days remaining
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Progress Bar */}
        {status && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Documents Uploaded</Text>
              <Text style={styles.progressCount}>
                {status.documents_completed} / {status.documents_required}
              </Text>
            </View>
            {Platform.OS === 'android' ? (
              <ProgressBarAndroid
                styleAttr="Horizontal"
                progress={
                  status.documents_required > 0
                    ? status.documents_completed / status.documents_required
                    : 0
                }
                color={getStatusColor()}
                style={styles.progressBar}
              />
            ) : (
              <ProgressViewIOS
                progress={
                  status.documents_required > 0
                    ? status.documents_completed / status.documents_required
                    : 0
                }
                progressTintColor={getStatusColor()}
                style={styles.progressBar}
              />
            )}
          </View>
        )}

        {/* Documents List */}
        <View style={styles.documentsSection}>
          <Text style={styles.sectionTitle}>Documents</Text>
          {requirements.length === 0 ? (
            <Text style={styles.emptyText}>No documents required</Text>
          ) : (
            requirements.map((req, idx) => (
              <View key={idx} style={styles.documentCard}>
                <View style={styles.documentHeader}>
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentName}>{req.display_name}</Text>
                    {req.is_mandatory && (
                      <View style={styles.mandatoryBadge}>
                        <Text style={styles.mandatoryText}>MANDATORY</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.documentStatus}>
                    {req.is_uploaded ? '✓ Uploaded' : '○ Pending'}
                  </Text>
                </View>

                {req.description && (
                  <Text style={styles.documentDescription}>{req.description}</Text>
                )}

                {req.is_verified !== null && (
                  <View style={styles.verificationStatus}>
                    {req.is_verified ? (
                      <Text style={styles.verifiedText}>✓ Verified</Text>
                    ) : (
                      <Text style={styles.pendingText}>⏳ Pending Verification</Text>
                    )}
                  </View>
                )}

                {req.rejection_reason && (
                  <View style={styles.rejectionBox}>
                    <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
                    <Text style={styles.rejectionText}>{req.rejection_reason}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.uploadButton,
                    uploadingDoc === req.document_type && styles.uploadButtonDisabled,
                  ]}
                  onPress={() => handleUploadDocument(req.document_type)}
                  disabled={uploadingDoc === req.document_type}
                >
                  {uploadingDoc === req.document_type ? (
                    <>
                      <ActivityIndicator size="small" color={COLORS.white} />
                      <Text style={styles.uploadButtonText}>Uploading...</Text>
                    </>
                  ) : (
                    <Text style={styles.uploadButtonText}>
                      {req.is_uploaded ? '📄 Re-upload' : '📤 Upload'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Document Verification</Text>
          <Text style={styles.infoText}>
            • Documents are optional through June 15, 2026
          </Text>
          <Text style={styles.infoText}>
            • You can still upload documents early for faster review
          </Text>
          <Text style={styles.infoText}>
            • Admin will verify your documents within 24 hours
          </Text>
          <Text style={styles.infoText}>
            • You can re-upload if your document is rejected
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background || '#F5F5F5',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text || '#000',
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: COLORS.lightGray || '#E0E0E0',
  },
  closeBtnText: {
    fontSize: 18,
    color: COLORS.gray || '#666',
  },
  statusBanner: {
    backgroundColor: '#F0F4FF',
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 20,
    ...SHADOWS,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusIconText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text || '#000',
    marginBottom: 4,
  },
  statusMessage: {
    fontSize: 14,
    color: COLORS.textSecondary || '#666',
    marginBottom: 8,
  },
  graceText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.warning || '#FF9800',
  },
  progressSection: {
    marginBottom: 24,
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 12,
    ...SHADOWS,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text || '#000',
  },
  progressCount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary || '#007AFF',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  documentsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text || '#000',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary || '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  documentCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS,
  },
  documentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text || '#000',
    marginBottom: 4,
  },
  mandatoryBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  mandatoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.danger || '#F44336',
  },
  documentStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.success || '#4CAF50',
  },
  documentDescription: {
    fontSize: 13,
    color: COLORS.textSecondary || '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  verificationStatus: {
    marginBottom: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray || '#E0E0E0',
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.success || '#4CAF50',
  },
  pendingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.warning || '#FF9800',
  },
  rejectionBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger || '#F44336',
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger || '#F44336',
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 13,
    color: COLORS.danger || '#F44336',
  },
  uploadButton: {
    backgroundColor: COLORS.primary || '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoSection: {
    backgroundColor: '#F0F4FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary || '#007AFF',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.text || '#000',
    lineHeight: 20,
    marginBottom: 8,
  },
});

export default PassengerDocumentUpload;
