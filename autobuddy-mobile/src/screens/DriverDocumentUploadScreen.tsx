import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useDocumentUpload, Document } from '../hooks/useDocumentUpload';
import { DocumentUploadCard } from '../components/DocumentUploadCard';

interface DriverDocumentUploadScreenProps {
  token: string | null;
  userId: string;
}

const REQUIRED_DOCUMENTS: Document['type'][] = [
  'license',
  'registration',
  'insurance',
  'aadhar',
  'bank',
];

const documentDescriptions: Record<Document['type'], string> = {
  license: 'Valid driving license for the vehicle you drive',
  registration: 'Vehicle registration certificate (RC)',
  insurance: 'Current vehicle insurance policy',
  pollution: 'Pollution Under Control certificate',
  aadhar: 'Aadhar Card for identity verification',
  pan: 'PAN Card (optional)',
  bank: 'Bank account details for payouts',
};

export const DriverDocumentUploadScreen: React.FC<DriverDocumentUploadScreenProps> = ({
  token,
  userId,
}) => {
  // Check for required data
  if (!token) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Authentication token is required</Text>
      </View>
    );
  }

  const {
    documents,
    uploadProgress,
    loading,
    error,
    uploadDocument,
    deleteDocument,
    fetchDocuments,
    getDocumentsByType,
    getApprovedDocuments,
    getPendingDocuments,
    getExpiredDocuments,
  } = useDocumentUpload(token, userId);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedType, setSelectedType] = useState<Document['type'] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDocuments();
    setRefreshing(false);
  };

  const handleUploadDocument = async (type: Document['type']) => {
    try {
      setDocumentUploading(true);
      setUploadError(null);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets?.[0];
        if (!asset.uri) {
          throw new Error('Invalid document');
        }
        await uploadDocument(type, asset.uri);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to pick document';
      setUploadError(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally {
      setDocumentUploading(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      const success = await deleteDocument(documentId);
      if (success) {
        Alert.alert('Success', 'Document deleted');
      } else {
        Alert.alert('Error', 'Failed to delete document');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete document';
      Alert.alert('Error', errorMsg);
    }
  };

  const approvedDocs = getApprovedDocuments() || [];
  const pendingDocs = getPendingDocuments() || [];
  const expiredDocs = getExpiredDocuments() || [];

  const requiredDocsStatus = REQUIRED_DOCUMENTS.map((type) => ({
    type,
    approved: approvedDocs.some((d) => d && d.type === type),
  }));

  const completionPercent = 
    REQUIRED_DOCUMENTS.length > 0 
      ? Math.round((approvedDocs.length / REQUIRED_DOCUMENTS.length) * 100)
      : 0;
  const isVerified = REQUIRED_DOCUMENTS.every((type) => approvedDocs.some((d) => d && d.type === type));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Error banner if load failed */}
      {(uploadError || error) && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error" size={20} color="#D32F2F" />
          <Text style={styles.errorBannerText}>{uploadError || error || 'An error occurred'}</Text>
          <Pressable onPress={() => setUploadError(null)}>
            <MaterialIcons name="close" size={20} color="#D32F2F" />
          </Pressable>
        </View>
      )}

      {/* Status Card */}
      <View style={[styles.statusCard, isVerified && styles.statusCardVerified]}>
        <View style={styles.statusHeader}>
          <MaterialIcons
            name={isVerified ? 'verified-user' : 'security'}
            size={32}
            color={isVerified ? '#4CAF50' : '#2196F3'}
          />
          <View style={styles.statusContent}>
            <Text style={styles.statusTitle}>
              {isVerified ? 'Verified ✓' : 'Verification Pending'}
            </Text>
            <Text style={styles.statusSubtitle}>
              {completionPercent}% Complete
            </Text>
          </View>
        </View>

        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${completionPercent}%` }]} />
        </View>

        <View style={styles.statusStats}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{approvedDocs.length}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#FFC107' }]}>{pendingDocs.length}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#F44336' }]}>{expiredDocs.length}</Text>
            <Text style={styles.statLabel}>Expired</Text>
          </View>
        </View>
      </View>

      {/* Requirements Checklist */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Required Documents</Text>
        <View style={styles.checklist}>
          {requiredDocsStatus.map(({ type, approved }) => (
            <View key={type} style={styles.checklistItem}>
              <MaterialIcons
                name={approved ? 'check-circle' : 'radio-button-unchecked'}
                size={20}
                color={approved ? '#4CAF50' : '#ccc'}
              />
              <View style={styles.checklistContent}>
                <Text
                  style={[
                    styles.checklistLabel,
                    approved && styles.checklistLabelApproved,
                  ]}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
                <Text style={styles.checklistDescription}>
                  {documentDescriptions[type]}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={18} color="#F44336" />
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      )}

      {/* Document Uploads */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Document Uploads</Text>

        {loading && documents.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2196F3" />
          </View>
        ) : (
          <>
            {/* Approved Documents */}
            {approvedDocs.length > 0 && (
              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle}>Approved</Text>
                {approvedDocs.map((doc) => {
                  if (!doc || !doc.id) {return null;}
                  return (
                    <DocumentUploadCard
                      key={doc.id}
                      document={doc}
                      type={doc.type}
                      progress={uploadProgress[`${doc.type}_${doc.id}`] ?? 0}
                      onUpload={() => handleUploadDocument(doc.type)}
                      onDelete={() => handleDeleteDocument(doc.id)}
                      onRetry={() => {}}
                    />
                  );
                })}
              </View>
            )}

            {/* Pending Documents */}
            {pendingDocs.length > 0 && (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: '#FFC107' }]}>Pending Review</Text>
                {pendingDocs.map((doc) => {
                  if (!doc || !doc.id) {return null;}
                  return (
                    <DocumentUploadCard
                      key={doc.id}
                      document={doc}
                      type={doc.type}
                      progress={uploadProgress[`${doc.type}_${doc.id}`] ?? 0}
                      onUpload={() => handleUploadDocument(doc.type)}
                      onDelete={() => handleDeleteDocument(doc.id)}
                      onRetry={() => {}}
                    />
                  );
                })}
              </View>
            )}

            {/* Expired Documents */}
            {expiredDocs.length > 0 && (
              <View style={styles.subsection}>
                <Text style={[styles.subsectionTitle, { color: '#F44336' }]}>Expired</Text>
                {expiredDocs.map((doc) => {
                 if (!doc || !doc.id) {return null;}
                 return (
                   <DocumentUploadCard
                     key={doc.id}
                     document={doc}
                     type={doc.type}
                     progress={uploadProgress[`${doc.type}_${doc.id}`] ?? 0}
                     onUpload={() => handleUploadDocument(doc.type)}
                     onDelete={() => handleDeleteDocument(doc.id)}
                     onRetry={() => {}}
                   />
                 );
                })}
              </View>
            )}

            {/* Upload New Documents */}
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Add Document</Text>
              <View style={styles.addDocumentGrid}>
                {(['license', 'registration', 'insurance', 'pollution', 'aadhar', 'pan', 'bank'] as const).map((type) => {
                  const existing = getDocumentsByType(type);
                  return (
                    <Pressable
                      key={type}
                      style={styles.addDocumentButton}
                      onPress={() => handleUploadDocument(type)}
                    >
                      <MaterialIcons name="add" size={24} color="#2196F3" />
                      <Text style={styles.addDocumentText}>{type}</Text>
                      {existing.length > 0 && (
                        <View style={styles.existingBadge}>
                          <Text style={styles.existingBadgeText}>{existing.length}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </View>

      {/* Tips Section */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>Document Requirements</Text>
        <View style={styles.tipItem}>
          <MaterialIcons name="info" size={16} color="#2196F3" />
          <Text style={styles.tipText}>All documents must be clear, readable, and not expired</Text>
        </View>
        <View style={styles.tipItem}>
          <MaterialIcons name="info" size={16} color="#2196F3" />
          <Text style={styles.tipText}>Supported format: PDF files only, max 10MB each</Text>
        </View>
        <View style={styles.tipItem}>
          <MaterialIcons name="info" size={16} color="#2196F3" />
          <Text style={styles.tipText}>Verification usually takes 24-48 hours</Text>
        </View>
        <View style={styles.tipItem}>
          <MaterialIcons name="info" size={16} color="#2196F3" />
          <Text style={styles.tipText}>You'll receive notifications when documents are approved or rejected</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  statusCard: {
    backgroundColor: '#E3F2FD',
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  statusCardVerified: {
    backgroundColor: '#E8F5E9',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  statusSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  statusStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  subsection: {
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 8,
  },
  checklist: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checklistContent: {
    flex: 1,
  },
  checklistLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  checklistLabelApproved: {
    color: '#4CAF50',
    textDecorationLine: 'line-through',
  },
  checklistDescription: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF3CD',
    borderRadius: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#856404',
  },
  addDocumentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addDocumentButton: {
    flex: 0.5,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  addDocumentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2196F3',
    textTransform: 'capitalize',
  },
  existingBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  existingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  tipsSection: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
});

export default DriverDocumentUploadScreen;
