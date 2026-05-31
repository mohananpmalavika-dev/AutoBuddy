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
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import { formatToIST } from '../utils/time';

const DriverDocumentUpload = ({ onClose }) => {
  const [loading, setLoading] = useState(false);
  const [requirements, setRequirements] = useState([]);
  const [status, setStatus] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(null);

  const loadDocumentRequirements = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', '/api/driver/documents/requirements');
      setRequirements(response.requirements || []);
    } catch (_error) {
      console.error('Error loading requirements:', _error);
      Alert.alert('Error', 'Failed to load document requirements');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDocumentStatus = useCallback(async () => {
    try {
      const response = await apiRequest('GET', '/api/driver/documents/status');
      setStatus(response);
    } catch (_error) {
      console.error('Error loading status:', _error);
    }
  }, []);

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
        `/api/driver/documents/upload/${documentType}`,
        formData,
        {
          'Content-Type': 'multipart/form-data',
        }
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
    if (!status) return COLORS.textSecondary;
    switch (status.status) {
      case 'compliant':
        return COLORS.success;
      case 'grace_period':
        return COLORS.warning;
      case 'non_compliant':
        return COLORS.danger;
      case 'exempt':
        return COLORS.success;
      default:
        return COLORS.text;
    }
  };

  const getStatusIcon = () => {
    if (!status) return '';
    switch (status.status) {
      case 'compliant':
        return '✓ ';
      case 'grace_period':
        return '⏱ ';
      case 'non_compliant':
        return '✗ ';
      case 'exempt':
        return '✓ ';
      default:
        return '';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Documents</Text>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        {status && (
          <View style={[styles.statusBanner, { borderLeftColor: getStatusColor() }]}>
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusIcon()}
              {status.message}
            </Text>
            {status.days_remaining > 0 && status.status === 'grace_period' && (
              <Text style={styles.gracePeriodText}>
                ⏱ {status.days_remaining} days remaining
              </Text>
            )}
            <View style={styles.statusProgress}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${
                        status.documents_required > 0
                          ? (status.documents_completed / status.documents_required) * 100
                          : 0
                      }%`,
                      backgroundColor: getStatusColor(),
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {status.documents_completed}/{status.documents_required} documents
              </Text>
            </View>
          </View>
        )}

        {/* Requirements List */}
        {requirements.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No document requirements</Text>
          </View>
        ) : (
          <View style={styles.requirementsList}>
            {requirements.map((req) => (
              <View key={req.document_type} style={styles.requirementCard}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.titleContainer}>
                    <Text style={styles.cardTitle}>{req.display_name}</Text>
                    {req.is_mandatory && (
                      <View style={styles.mandatoryBadge}>
                        <Text style={styles.badgeText}>Required</Text>
                      </View>
                    )}
                    {!req.is_mandatory && (
                      <View style={styles.optionalBadge}>
                        <Text style={styles.badgeText}>Optional</Text>
                      </View>
                    )}
                  </View>
                  {req.is_uploaded && (
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor: req.is_verified ? COLORS.success : COLORS.warning,
                        },
                      ]}
                    >
                      <Text style={styles.statusDotText}>
                        {req.is_verified ? '✓' : '⏱'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Description */}
                {req.description && (
                  <Text style={styles.cardDescription}>{req.description}</Text>
                )}

                {/* Status */}
                {req.is_uploaded ? (
                  <View style={styles.statusSection}>
                    <Text style={styles.statusLabel}>
                      Status:{' '}
                      <Text
                        style={{
                          color: req.is_verified ? COLORS.success : COLORS.warning,
                          fontWeight: '600',
                        }}
                      >
                        {req.is_verified ? 'Verified' : 'Pending Review'}
                      </Text>
                    </Text>
                    {req.upload_date && (
                      <Text style={styles.uploadDate}>
                        Uploaded: {formatToIST(req.upload_date, { dateStyle: 'short' })}
                      </Text>
                    )}
                    {req.rejection_reason && (
                      <View style={styles.rejectionContainer}>
                        <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
                        <Text style={styles.rejectionReason}>{req.rejection_reason}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.gracePeriodInfo}>
                    <Text style={styles.gracePeriodLabel}>
                      Grace period: {req.grace_period_days} days
                    </Text>
                  </View>
                )}

                {/* Upload Button */}
                <TouchableOpacity
                  style={[
                    styles.uploadBtn,
                    uploadingDoc === req.document_type && styles.uploadBtnDisabled,
                  ]}
                  onPress={() => handleUploadDocument(req.document_type)}
                  disabled={uploadingDoc === req.document_type}
                >
                  {uploadingDoc === req.document_type ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.uploadBtnText}>
                      {req.is_uploaded ? 'Update Document' : 'Upload Document'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Important</Text>
          <Text style={styles.infoText}>
            • Documents are optional through June 15, 2026
          </Text>
          <Text style={styles.infoText}>
            • Optional documents can be uploaded at any time
          </Text>
          <Text style={styles.infoText}>
            • Uploaded documents will be reviewed by our team
          </Text>
          <Text style={styles.infoText}>
            • You will be notified once your documents are verified
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: COLORS.background,
  },
  headerBtnText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statusBanner: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  gracePeriodText: {
    fontSize: 12,
    color: COLORS.warning,
    marginBottom: 8,
  },
  statusProgress: {
    marginTop: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  requirementsList: {
    marginBottom: 16,
  },
  requirementCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    ...SHADOWS.small,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  mandatoryBadge: {
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  optionalBadge: {
    backgroundColor: '#E5F5E5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDotText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  cardDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  statusSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  uploadDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  rejectionContainer: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rejectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.danger,
    marginBottom: 2,
  },
  rejectionReason: {
    fontSize: 11,
    color: COLORS.danger,
  },
  gracePeriodInfo: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  gracePeriodLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  uploadBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnDisabled: {
    opacity: 0.6,
  },
  uploadBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

export default DriverDocumentUpload;
