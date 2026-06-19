import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ProgressBarAndroid,
  ProgressViewIOS,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Document, DocumentUploadProgress } from '../hooks/useDocumentUpload';

interface DocumentUploadCardProps {
  document?: Document;
  type: Document['type'];
  progress?: DocumentUploadProgress;
  onUpload: () => void;
  onDelete: () => void;
  onRetry: () => void;
}

const documentLabels: Record<Document['type'], string> = {
  license: 'Driving License',
  registration: 'Vehicle Registration',
  insurance: 'Insurance Certificate',
  pollution: 'Pollution Certificate',
  aadhar: 'Aadhar Card',
  pan: 'PAN Card',
  bank: 'Bank Details',
};

const statusColors = {
  pending: '#FFC107',
  approved: '#4CAF50',
  rejected: '#F44336',
  expired: '#FF6F00',
};

const statusIcons = {
  pending: 'schedule',
  approved: 'check-circle',
  rejected: 'cancel',
  expired: 'warning',
};

export const DocumentUploadCard: React.FC<DocumentUploadCardProps> = ({
  document,
  type,
  progress,
  onUpload,
  onDelete,
  onRetry,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const handleDelete = () => {
    Alert.alert('Delete Document', 'Are you sure you want to delete this document?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Delete',
        onPress: onDelete,
        style: 'destructive',
      },
    ]);
  };

  const isExpired = document?.expiryDate && new Date(document.expiryDate) < new Date();
  const displayStatus = isExpired ? 'expired' : document?.status;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <MaterialIcons name="description" size={24} color="#2196F3" />
          <Text style={styles.title}>{documentLabels[type]}</Text>
        </View>
        {document && (
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColors[displayStatus || 'pending'] },
            ]}
          >
            <MaterialIcons
              name={statusIcons[displayStatus || 'pending'] as any}
              size={14}
              color="#fff"
            />
            <Text style={styles.statusText}>{displayStatus?.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* Upload Progress */}
      {progress?.status === 'uploading' && (
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>{progress.fileName}</Text>
          {Platform.OS === 'android' ? (
            <ProgressBarAndroid
              styleAttr="Horizontal"
              indeterminate={false}
              progress={progress.progress / 100}
              color="#2196F3"
              style={styles.progressBar}
            />
          ) : (
            <ProgressViewIOS progress={progress.progress / 100} style={styles.progressBar} />
          )}
          <Text style={styles.progressPercent}>{progress.progress}%</Text>
        </View>
      )}

      {/* Error State */}
      {progress?.status === 'error' && (
        <View style={styles.errorSection}>
          <MaterialIcons name="error-outline" size={18} color="#F44336" />
          <Text style={styles.errorText}>{progress.error || 'Upload failed'}</Text>
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Document Info */}
      {document && progress?.status !== 'uploading' && (
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Uploaded:</Text>
            <Text style={styles.infoValue}>
              {new Date(document.uploadedAt).toLocaleDateString()}
            </Text>
          </View>
          {document.expiryDate && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Expires:</Text>
              <Text style={[styles.infoValue, isExpired && styles.infoValueExpired]}>
                {new Date(document.expiryDate).toLocaleDateString()}
              </Text>
            </View>
          )}
          {document.rejectionReason && (
            <View style={styles.rejectionSection}>
              <Text style={styles.rejectionLabel}>Reason for rejection:</Text>
              <Text style={styles.rejectionText}>{document.rejectionReason}</Text>
            </View>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {!document || progress?.status === 'error' ? (
          <Pressable
            style={[styles.button, styles.uploadButton]}
            onPress={onUpload}
            disabled={progress?.status === 'uploading'}
          >
            {progress?.status === 'uploading' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="cloud-upload" size={18} color="#fff" />
                <Text style={styles.buttonText}>Upload Document</Text>
              </>
            )}
          </Pressable>
        ) : (
          <>
            <Pressable style={[styles.button, styles.viewButton]} onPress={() => setShowDetails(!showDetails)}>
              <MaterialIcons name="visibility" size={18} color="#2196F3" />
              <Text style={[styles.buttonText, styles.viewButtonText]}>
                {showDetails ? 'Hide' : 'View'}
              </Text>
            </Pressable>
            <Pressable style={[styles.button, styles.deleteButton]} onPress={handleDelete}>
              <MaterialIcons name="delete" size={18} color="#F44336" />
              <Text style={[styles.buttonText, styles.deleteButtonText]}>Delete</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  progressSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
  },
  progressLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    marginBottom: 8,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
    textAlign: 'right',
  },
  errorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFEBEE',
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#C62828',
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F44336',
    borderRadius: 4,
  },
  retryButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  infoValueExpired: {
    color: '#F44336',
  },
  rejectionSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  rejectionLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 12,
    color: '#C62828',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 6,
  },
  uploadButton: {
    backgroundColor: '#2196F3',
  },
  viewButton: {
    backgroundColor: '#f0f0f0',
  },
  deleteButton: {
    backgroundColor: '#FFE5E5',
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  viewButtonText: {
    color: '#2196F3',
  },
  deleteButtonText: {
    color: '#F44336',
  },
});
