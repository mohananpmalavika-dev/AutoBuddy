import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface DocumentStatus {
  name: string;
  label: string;
  status: 'pending' | 'verified' | 'rejected' | 'uploading' | 'expired';
  uploadedAt?: Date;
  expiresAt?: Date;
  rejectionReason?: string;
}

interface DriverDocumentStatusProps {
  documents: DocumentStatus[];
  onUploadDocument?: (docName: string) => void;
  loading?: boolean;
}

export function DriverDocumentStatus({
  documents,
  onUploadDocument,
  loading = false,
}: DriverDocumentStatusProps) {
  const verified = documents.filter(d => d.status === 'verified').length;
  const total = documents.length;
  const progress = Math.round((verified / total) * 100);

  const getStatusIcon = (status: DocumentStatus['status']) => {
    switch (status) {
      case 'verified':
        return <MaterialIcons name="check-circle" size={24} color="#4CAF50" />;
      case 'pending':
        return <MaterialIcons name="schedule" size={24} color="#FFC107" />;
      case 'uploading':
        return <ActivityIndicator size={24} color="#2196F3" />;
      case 'rejected':
        return <MaterialIcons name="error" size={24} color="#F44336" />;
      case 'expired':
        return <MaterialIcons name="warning" size={24} color="#FF9800" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: DocumentStatus['status']) => {
    switch (status) {
      case 'verified':
        return '#4CAF50';
      case 'pending':
        return '#FFC107';
      case 'uploading':
        return '#2196F3';
      case 'rejected':
        return '#F44336';
      case 'expired':
        return '#FF9800';
      default:
        return '#999';
    }
  };

  const getStatusText = (status: DocumentStatus['status']) => {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'pending':
        return 'Pending';
      case 'uploading':
        return 'Uploading...';
      case 'rejected':
        return 'Rejected';
      case 'expired':
        return 'Expired';
      default:
        return 'Unknown';
    }
  };

  const formatDate = (date?: Date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.container}>
      {/* Header with progress */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Document Verification</Text>
          <Text style={styles.subtitle}>{verified} of {total} verified</Text>
        </View>
        <View style={styles.progressCircle}>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBar,
            { width: `${progress}%` },
          ]}
        />
      </View>

      {/* Documents list */}
      <View style={styles.documentsList}>
        {documents.map((doc, index) => (
          <DocumentRow
            key={`${doc.name}-${index}`}
            document={doc}
            onUpload={() => onUploadDocument?.(doc.name)}
            status={getStatusText(doc.status)}
            icon={getStatusIcon(doc.status)}
            color={getStatusColor(doc.status)}
          />
        ))}
      </View>

      {/* Next step indicator */}
      {progress < 100 && (
        <View style={styles.nextStepCard}>
          <MaterialIcons name="info" size={20} color="#2196F3" />
          <View style={styles.nextStepContent}>
            <Text style={styles.nextStepTitle}>Next Step</Text>
            <Text style={styles.nextStepText}>
              {getNextStep(documents)}
            </Text>
          </View>
        </View>
      )}

      {/* Completion message */}
      {progress === 100 && (
        <View style={[styles.nextStepCard, styles.completionCard]}>
          <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
          <View style={styles.nextStepContent}>
            <Text style={styles.nextStepTitle}>Verification Complete!</Text>
            <Text style={styles.nextStepText}>
              Your profile is ready. You can start accepting rides.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

interface DocumentRowProps {
  document: DocumentStatus;
  onUpload: () => void;
  status: string;
  icon: React.ReactNode;
  color: string;
}

function DocumentRow({ document, onUpload, status, icon, color }: DocumentRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      style={styles.documentRow}
      onPress={() => setExpanded(!expanded)}
    >
      <View style={styles.documentRowContent}>
        <View style={styles.documentIcon}>{icon}</View>
        <View style={styles.documentInfo}>
          <Text style={styles.documentLabel}>{document.label}</Text>
          <Text style={[styles.documentStatus, { color }]}>
            {status}
          </Text>
        </View>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={24}
          color="#999"
        />
      </View>

      {/* Expanded details */}
      {expanded && (
        <View style={styles.documentDetails}>
          {document.status === 'verified' && document.uploadedAt && (
            <DetailRow
              label="Verified on"
              value={formatDate(document.uploadedAt)}
            />
          )}
          {document.expiresAt && (
            <DetailRow
              label="Expires on"
              value={formatDate(document.expiresAt)}
            />
          )}
          {document.status === 'rejected' && document.rejectionReason && (
            <View style={styles.rejectionReason}>
              <Text style={styles.rejectionLabel}>Reason for Rejection:</Text>
              <Text style={styles.rejectionText}>
                {document.rejectionReason}
              </Text>
            </View>
          )}
          {document.status === 'rejected' && (
            <Pressable
              style={styles.reuploadButton}
              onPress={onUpload}
            >
              <MaterialIcons name="upload-file" size={18} color="#2196F3" />
              <Text style={styles.reuploadButtonText}>Re-upload Document</Text>
            </Pressable>
          )}
          {document.status === 'pending' && (
            <Text style={styles.pendingText}>
              Your document is under review. This usually takes 24-48 hours.
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function formatDate(date: Date | string) {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getNextStep(documents: DocumentStatus[]): string {
  const pending = documents.find(d => d.status === 'pending');
  if (pending) {
    return `Upload ${pending.label}`;
  }
  const rejected = documents.find(d => d.status === 'rejected');
  if (rejected) {
    return `Re-upload ${rejected.label}`;
  }
  const notUploaded = documents.find(d => d.status === 'pending' || d.status === 'uploading');
  if (notUploaded) {
    return `Upload ${notUploaded.label}`;
  }
  return 'All documents verified!';
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  progressCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  progressText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2196F3',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  documentsList: {
    marginBottom: 16,
  },
  documentRow: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  documentRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  documentIcon: {
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  documentStatus: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  documentDetails: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  rejectionReason: {
    backgroundColor: '#ffebee',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C62828',
  },
  rejectionText: {
    fontSize: 12,
    color: '#C62828',
    marginTop: 4,
  },
  reuploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
  },
  reuploadButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 12,
  },
  pendingText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  nextStepCard: {
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
    padding: 12,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  completionCard: {
    backgroundColor: '#E8F5E9',
    borderLeftColor: '#4CAF50',
  },
  nextStepContent: {
    flex: 1,
    marginLeft: 12,
  },
  nextStepTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565C0',
  },
  nextStepText: {
    fontSize: 12,
    color: '#0D47A1',
    marginTop: 4,
  },
});
