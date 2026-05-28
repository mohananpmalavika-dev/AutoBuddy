import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest } from '../lib/api';
import { appendPickerAssetToFormData } from '../lib/uploadFormData';
import { COLORS, SHADOWS } from '../theme';

/**
 * PassengerDocumentsPanel - Document uploads and management
 * Proof of address, identity documents, emergency documents
 */
export default function PassengerDocumentsPanel({ token }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(null); // null or document type being uploaded

  const DOCUMENT_TYPES = [
    { key: 'address_proof', label: 'Proof of Address', icon: '🏠' },
    { key: 'id_proof', label: 'Identity Proof', icon: '📋' },
    { key: 'emergency_doc', label: 'Emergency Contact Document', icon: '🆘' },
    { key: 'insurance', label: 'Insurance Document', icon: '🛡️' },
    { key: 'other', label: 'Other Documents', icon: '📄' },
  ];

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/passengers/documents', { token });
      setDocuments(data?.documents || []);
    } catch (err) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDocuments().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDocuments]);

  const pickAndUploadDocument = async (docType) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (asset.size > 5 * 1024 * 1024) {
        Alert.alert('Error', 'File size must be less than 5MB');
        return;
      }

      setUploading(docType);
      await uploadDocument(docType, asset);
      setUploading(null);
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document: ' + err.message);
    }
  };

  const uploadDocument = async (docType, asset) => {
    try {
      setError('');

      const formData = new FormData();
      formData.append('document_type', docType);
      await appendPickerAssetToFormData(
        formData,
        'file',
        asset,
        asset.name || `${docType}-document`,
        asset.mimeType || 'application/octet-stream',
      );

      const response = await apiRequest('/passengers/documents/upload', {
        token,
        method: 'POST',
        body: formData,
        isFormData: true,
      });

      const newDoc = {
        id: response?.id || `doc-${documents.length + 1}`,
        type: response?.type || docType,
        filename: response?.filename || asset.name,
        uploaded_at: response?.uploaded_at || new Date().toISOString(),
        verified: Boolean(response?.verified),
      };

      setDocuments([...documents, newDoc]);
      setMessage('Document uploaded successfully. Pending verification.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to upload document');
    }
  };

  const deleteDocument = (docId) => {
    Alert.alert('Delete Document', 'Are you sure you want to delete this document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiRequest(`/passengers/documents/${docId}`, {
              token,
              method: 'DELETE',
            });
            setDocuments(documents.filter((d) => d.id !== docId));
            setMessage('Document deleted successfully');
            setTimeout(() => setMessage(''), 3000);
          } catch (err) {
            setError(err.message || 'Failed to delete document');
          }
        },
      },
    ]);
  };

  const getDocTypeLabel = (type) => {
    const doc = DOCUMENT_TYPES.find((d) => d.key === type);
    return doc ? doc.label : type;
  };

  const getDocTypeIcon = (type) => {
    const doc = DOCUMENT_TYPES.find((d) => d.key === type);
    return doc ? doc.icon : '📄';
  };

  const renderDocumentItem = ({ item }) => (
    <View style={[styles.documentCard, SHADOWS.card]}>
      <View style={styles.documentHeader}>
        <Text style={styles.documentIcon}>{getDocTypeIcon(item.type)}</Text>
        <View style={styles.documentInfo}>
          <Text style={styles.documentType}>{getDocTypeLabel(item.type)}</Text>
          <Text style={styles.documentFilename}>{item.filename}</Text>
          <Text style={styles.documentDate}>
            Uploaded: {new Date(item.uploaded_at).toLocaleDateString()}
          </Text>
        </View>
      </View>

      <View style={styles.documentFooter}>
        <View style={[styles.verificationBadge, item.verified && styles.verificationBadgeVerified]}>
          <Text style={styles.verificationText}>
            {item.verified ? '✓ Verified' : '⏳ Pending'}
          </Text>
        </View>

        <TouchableOpacity onPress={() => deleteDocument(item.id)} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading && documents.length === 0) {
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

      {/* Information Card */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Document Management</Text>
        <Text style={styles.descriptionText}>
          Upload important documents to your AutoBuddy profile. Documents are stored in protected upload storage and used only for verification. Keep your profile updated with current documents for better safety and service quality.
        </Text>
      </View>

      {/* Upload Options */}
      <View style={[styles.uploadBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Upload New Document</Text>
        <View style={styles.uploadGrid}>
          {DOCUMENT_TYPES.map((docType) => (
            <TouchableOpacity
              key={docType.key}
              style={styles.uploadOption}
              onPress={() => pickAndUploadDocument(docType.key)}
              disabled={uploading !== null}
            >
              <Text style={styles.uploadIcon}>{docType.icon}</Text>
              <Text style={styles.uploadLabel}>{docType.label}</Text>
              {uploading === docType.key && (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 4 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Uploaded Documents */}
      {documents.length > 0 ? (
        <View style={styles.documentsSection}>
          <Text style={styles.sectionTitle}>Your Documents ({documents.length})</Text>
          <FlatList
            scrollEnabled={false}
            data={documents}
            keyExtractor={(item) => item.id}
            renderItem={renderDocumentItem}
          />
        </View>
      ) : (
        <View style={[styles.emptyBlock, SHADOWS.card]}>
          <Text style={styles.emptyText}>📄 No documents uploaded yet</Text>
          <Text style={styles.emptySubtext}>Upload your first document to get started</Text>
        </View>
      )}

      {/* Document Guidelines */}
      <View style={[styles.guidelinesBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Document Guidelines</Text>
        <View style={styles.guidelineItem}>
          <Text style={styles.guidelineTitle}>✓ Accepted Formats</Text>
          <Text style={styles.guidelineText}>PDF, JPG, PNG (Max 5MB per file)</Text>
        </View>
        <View style={styles.guidelineItem}>
          <Text style={styles.guidelineTitle}>✓ Quality Requirements</Text>
          <Text style={styles.guidelineText}>Clear, legible documents without blur or glare</Text>
        </View>
        <View style={styles.guidelineItem}>
          <Text style={styles.guidelineTitle}>✓ Verification Time</Text>
          <Text style={styles.guidelineText}>Usually verified within 24-48 hours</Text>
        </View>
        <View style={styles.guidelineItem}>
          <Text style={styles.guidelineTitle}>✓ Privacy</Text>
          <Text style={styles.guidelineText}>Your documents are protected and only used for verification</Text>
        </View>
      </View>

      {/* Document Requirements */}
      <View style={[styles.requirementsBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Recommended Documents</Text>
        <Text style={styles.recommendationText}>
          While optional, uploading the following documents helps us verify your identity and provide better service:
        </Text>
        <Text style={styles.recommendationText}>• A government-issued ID (Aadhar, Pan Card, or License)</Text>
        <Text style={styles.recommendationText}>• Proof of current address (utility bill, lease agreement)</Text>
        <Text style={styles.recommendationText}>• Insurance document for additional security</Text>
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
  uploadBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  descriptionText: { fontSize: 13, color: COLORS.text, lineHeight: 20 },
  uploadGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  uploadOption: {
    width: '48%',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  uploadIcon: { fontSize: 32, marginBottom: 8 },
  uploadLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  documentsSection: { marginBottom: 16 },
  documentCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  documentHeader: { flexDirection: 'row', marginBottom: 12 },
  documentIcon: { fontSize: 32, marginRight: 12 },
  documentInfo: { flex: 1 },
  documentType: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  documentFilename: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  documentDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  documentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 },
  verificationBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verificationBadgeVerified: { backgroundColor: '#E8F5E9' },
  verificationText: { fontSize: 11, fontWeight: '600', color: '#FF9800' },
  deleteButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFEBEE', borderRadius: 4 },
  deleteButtonText: { fontSize: 11, fontWeight: '600', color: '#F44336' },
  emptyBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 32,
    marginBottom: 16,
    alignItems: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  emptySubtext: { fontSize: 12, color: COLORS.textMuted },
  guidelinesBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  guidelineItem: { marginBottom: 12 },
  guidelineTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  guidelineText: { fontSize: 12, color: COLORS.textMuted },
  requirementsBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  recommendationText: { fontSize: 12, color: COLORS.text, lineHeight: 20, marginBottom: 8 },
  errorText: { color: '#F44336', fontSize: 12, marginBottom: 12, fontWeight: '600' },
  messageText: { color: '#4CAF50', fontSize: 12, marginBottom: 12, fontWeight: '600' },
});
