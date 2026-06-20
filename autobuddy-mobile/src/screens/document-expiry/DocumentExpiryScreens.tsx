import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Dimensions,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useDocumentExpiry } from '../hooks/useDocumentExpiry';

const { width } = Dimensions.get('window');

// ==================== ALERT BANNER WIDGET ====================

export const DocumentExpiryAlertBanner: React.FC<{
  driverId: string;
  authToken: string;
  onViewAll?: () => void;
  onRenewNow?: (documentId: string) => void;
}> = ({ driverId, authToken, onViewAll, onRenewNow }) => {
  const { alerts, criticalAlertCount, isLoading } = useDocumentExpiry(driverId, authToken);

  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning' && a.alert_status === 'sent');

  if (isLoading || (criticalAlerts.length === 0 && warningAlerts.length === 0)) {
    return null;
  }

  if (criticalAlerts.length > 0) {
    return (
      <Pressable
        style={[styles.alertBanner, styles.criticalBanner]}
        onPress={onViewAll}
      >
        <View style={styles.alertContent}>
          <MaterialIcons name="error" size={24} color="#FFF" />
          <Text style={styles.alertText}>
            ⚠️ {criticalAlerts.length} document{criticalAlerts.length > 1 ? 's' : ''} expired
          </Text>
        </View>
        <View style={styles.alertActions}>
          <Pressable
            style={styles.renewButton}
            onPress={() => onRenewNow?.(criticalAlerts[0].document_id || '')}
          >
            <Text style={styles.renewButtonText}>Renew</Text>
          </Pressable>
          <Pressable style={styles.viewAllButton} onPress={onViewAll}>
            <Text style={styles.viewAllButtonText}>View All</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={[styles.alertBanner, styles.warningBanner]} onPress={onViewAll}>
      <View style={styles.alertContent}>
        <MaterialIcons name="warning" size={24} color="#F59E0B" />
        <Text style={styles.alertText}>
          📋 {warningAlerts.length} document{warningAlerts.length > 1 ? 's' : ''} expiring in 30 days
        </Text>
      </View>
      <Pressable style={styles.viewAllButton} onPress={onViewAll}>
        <Text style={styles.viewAllButtonText}>View All</Text>
      </Pressable>
    </Pressable>
  );
};

// ==================== EXPIRY LIST SCREEN ====================

export const DocumentExpiryListScreen: React.FC<{
  driverId: string;
  authToken: string;
}> = ({ driverId, authToken }) => {
  const { alerts, expiringDocuments, isLoading, fetchAllAlerts, dismissAlert } =
    useDocumentExpiry(driverId, authToken);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'all' | 'critical' | 'warning' | 'dismissed'>('all');
  const [renewalModalVisible, setRenewalModalVisible] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllAlerts();
    setRefreshing(false);
  };

  const filteredAlerts = alerts.filter(alert => {
    switch (selectedTab) {
      case 'critical':
        return alert.severity === 'critical';
      case 'warning':
        return alert.severity === 'warning';
      case 'dismissed':
        return alert.alert_status === 'dismissed';
      default:
        return true;
    }
  });

  const stats = {
    expired: alerts.filter(a => a.days_to_expiry < 0).length,
    expiringSoon: alerts.filter(a => a.days_to_expiry >= 0 && a.days_to_expiry <= 30).length,
    valid: expiringDocuments.filter(d => d.days_to_expiry > 30).length,
  };

  if (isLoading && !alerts.length) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
    >
      {/* Statistics */}
      <View style={styles.statsContainer}>
        <StatCard label="Expired" value={stats.expired} color="#DC2626" />
        <StatCard label="Expiring Soon" value={stats.expiringSoon} color="#EAB308" />
        <StatCard label="Valid" value={stats.valid} color="#10B981" />
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabContainer}>
        {(['all', 'critical', 'warning', 'dismissed'] as const).map(tab => (
          <Pressable
            key={tab}
            style={[styles.tab, selectedTab === tab && styles.activeTab]}
            onPress={() => setSelectedTab(tab)}
          >
            <Text style={[styles.tabText, selectedTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Document List */}
      {filteredAlerts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="check-circle" size={48} color="#10B981" />
          <Text style={styles.emptyText}>No documents to show</Text>
        </View>
      ) : (
        filteredAlerts.map(alert => (
          <ExpiryAlertCard
            key={alert.alert_id}
            alert={alert}
            onRenew={() => {
              setSelectedDocument(alert);
              setRenewalModalVisible(true);
            }}
            onDismiss={() => dismissAlert(alert.alert_id)}
          />
        ))
      )}

      <View style={{ height: 20 }} />

      {/* Renewal Modal */}
      {selectedDocument && (
        <DocumentRenewalModal
          visible={renewalModalVisible}
          documentId={selectedDocument.document_id}
          documentType={selectedDocument.document_type}
          currentExpiryDate={selectedDocument.expiry_date}
          driverId={driverId}
          authToken={authToken}
          onSuccess={() => {
            setRenewalModalVisible(false);
            setSelectedDocument(null);
            fetchAllAlerts();
          }}
          onCancel={() => {
            setRenewalModalVisible(false);
            setSelectedDocument(null);
          }}
        />
      )}
    </ScrollView>
  );
};

// ==================== EXPIRY ALERT CARD ====================

const ExpiryAlertCard: React.FC<{
  alert: any;
  onRenew: () => void;
  onDismiss: () => void;
}> = ({ alert, onRenew, onDismiss }) => {
  const statusColors = {
    critical: '#DC2626',
    warning: '#EAB308',
  };

  const daysColor = alert.days_to_expiry < 0 ? '#DC2626' : alert.days_to_expiry <= 7 ? '#DC2626' : '#EAB308';

  return (
    <View style={styles.alertCard}>
      <View style={styles.alertCardHeader}>
        <View style={styles.alertCardLeft}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: statusColors[alert.severity as keyof typeof statusColors] },
            ]}
          >
            <Text style={styles.categoryBadgeText}>
              {alert.severity === 'critical' ? '!' : '⚠'}
            </Text>
          </View>
          <View style={styles.alertCardInfo}>
            <Text style={styles.documentType}>{alert.document_type}</Text>
            <Text style={styles.documentCategory}>{alert.document_type_category}</Text>
          </View>
        </View>
        <Text style={[styles.daysToExpiry, { color: daysColor }]}>
          {alert.days_to_expiry < 0 ? 'Expired' : `${alert.days_to_expiry} days left`}
        </Text>
      </View>

      <View style={styles.alertCardFooter}>
        <Text style={styles.expiryDate}>Expires: {new Date(alert.expiry_date).toLocaleDateString()}</Text>
        <View style={styles.alertCardActions}>
          <Pressable style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </Pressable>
          <Pressable style={styles.renewCardButton} onPress={onRenew}>
            <Text style={styles.renewCardButtonText}>Renew</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

// ==================== RENEWAL MODAL ====================

interface DocumentRenewalModalProps {
  visible: boolean;
  documentId: string;
  documentType: string;
  currentExpiryDate: string;
  driverId: string;
  authToken: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const DocumentRenewalModal: React.FC<DocumentRenewalModalProps> = ({
  visible,
  documentId,
  documentType,
  currentExpiryDate,
  driverId,
  authToken,
  onSuccess,
  onCancel,
}) => {
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { submitRenewal } = useDocumentExpiry(driverId, authToken);

  const daysLeft = Math.ceil(
    (new Date(currentExpiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedFile(result.assets[0]);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      Alert.alert('Error', 'Please select a document');
      return;
    }

    setLoading(true);
    try {
      const file = new File(
        [selectedFile.uri],
        selectedFile.name,
        { type: selectedFile.mimeType }
      );

      const result = await submitRenewal(documentId, documentType, file, notes);
      if (result) {
        Alert.alert('Success', result.message || 'Renewal submitted successfully');
        onSuccess();
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to submit renewal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <ScrollView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onCancel}>
            <MaterialIcons name="close" size={24} color="#333" />
          </Pressable>
          <Text style={styles.modalTitle}>Renew {documentType}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.modalContent}>
          {/* Current Status */}
          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Current Expiry</Text>
            <Text style={styles.statusValue}>{new Date(currentExpiryDate).toLocaleDateString()}</Text>
            <Text style={[styles.statusDays, daysLeft <= 7 ? styles.critical : styles.warning]}>
              {daysLeft < 0 ? 'EXPIRED' : `${daysLeft} days left`}
            </Text>
          </View>

          {/* File Upload */}
          <View style={styles.uploadSection}>
            <Text style={styles.sectionTitle}>Upload Document</Text>
            <Pressable style={styles.uploadBox} onPress={handlePickFile}>
              <MaterialIcons name="cloud-upload" size={40} color="#FF6B35" />
              <Text style={styles.uploadBoxText}>
                {selectedFile ? selectedFile.name : 'Tap to select file (PDF or Image)'}
              </Text>
            </Pressable>
          </View>

          {/* Notes */}
          <View style={styles.notesSection}>
            <Text style={styles.sectionTitle}>Additional Notes (Optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Enter any additional information..."
              multiline
              numberOfLines={4}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {/* Buttons */}
          <View style={styles.modalActions}>
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitButton, !selectedFile && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!selectedFile || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Renewal</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
};

// ==================== RENEWAL STATUS CARD ====================

export const RenewalStatusCard: React.FC<{
  renewal: any;
  onRetry?: () => void;
}> = ({ renewal, onRetry }) => {
  const statusColors = {
    submitted: '#3B82F6',
    under_review: '#F59E0B',
    approved: '#10B981',
    rejected: '#DC2626',
  };

  return (
    <View style={styles.renewalCard}>
      <Text style={styles.renewalTitle}>{renewal.document_type} Renewal Status</Text>

      <View style={styles.timelineContainer}>
        <TimelineStep
          label="Submitted"
          date={renewal.renewal_uploaded_at}
          completed={true}
          active={true}
          color={statusColors.submitted}
        />
        <TimelineStep
          label="Under Review"
          date={renewal.verified_at}
          completed={renewal.renewal_status === 'approved' || renewal.renewal_status === 'rejected'}
          active={renewal.renewal_status === 'under_review'}
          color={statusColors.under_review}
        />
        <TimelineStep
          label={renewal.renewal_status === 'approved' ? 'Approved' : 'Rejected'}
          date={renewal.verified_at}
          completed={renewal.renewal_status === 'approved' || renewal.renewal_status === 'rejected'}
          active={false}
          color={renewal.renewal_status === 'approved' ? statusColors.approved : statusColors.rejected}
        />
      </View>

      {renewal.renewal_status === 'rejected' && (
        <View style={styles.rejectionBox}>
          <Text style={styles.rejectionLabel}>Rejection Reason</Text>
          <Text style={styles.rejectionReason}>{renewal.rejection_reason || 'No reason provided'}</Text>
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryButtonText}>Renew Again</Text>
          </Pressable>
        </View>
      )}

      {renewal.renewal_status === 'approved' && (
        <View style={styles.approvalBox}>
          <MaterialIcons name="check-circle" size={32} color="#10B981" />
          <Text style={styles.approvalText}>✓ Renewal Approved!</Text>
          <Text style={styles.approvalSubtext}>Your document has been successfully renewed.</Text>
        </View>
      )}
    </View>
  );
};

// ==================== HELPER COMPONENTS ====================

const StatCard: React.FC<{
  label: string;
  value: number;
  color: string;
}> = ({ label, value, color }) => (
  <View style={styles.statCard}>
    <View style={[styles.statIcon, { backgroundColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
    </View>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const TimelineStep: React.FC<{
  label: string;
  date?: string;
  completed: boolean;
  active: boolean;
  color: string;
}> = ({ label, date, completed, active, color }) => (
  <View style={styles.timelineStep}>
    <View
      style={[
        styles.timelineCircle,
        {
          backgroundColor: active ? color : completed ? color : '#E5E7EB',
          borderColor: color,
        },
      ]}
    >
      {completed && <MaterialIcons name="check" size={16} color="#FFF" />}
    </View>
    <View style={styles.timelineLabel}>
      <Text style={styles.timelineLabelText}>{label}</Text>
      {date && <Text style={styles.timelineDate}>{new Date(date).toLocaleDateString()}</Text>}
    </View>
  </View>
);

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBanner: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
  },
  criticalBanner: {
    backgroundColor: '#DC2626',
  },
  warningBanner: {
    backgroundColor: '#FEF08A',
  },
  alertContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  alertActions: {
    flexDirection: 'row',
    gap: 8,
  },
  renewButton: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  renewButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },
  viewAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  viewAllButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF',
    borderRadius: 8,
    elevation: 1,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FFF',
    alignItems: 'center',
    elevation: 1,
  },
  activeTab: {
    backgroundColor: '#FF6B35',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#FFF',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
  },
  alertCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
  },
  alertCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryBadgeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  alertCardInfo: {
    flex: 1,
  },
  documentType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  documentCategory: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  daysToExpiry: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  alertCardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 8,
  },
  expiryDate: {
    fontSize: 11,
    color: '#666',
    marginBottom: 8,
  },
  alertCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  dismissButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
  },
  renewCardButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
  },
  renewCardButtonText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    padding: 16,
  },
  statusBox: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusDays: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  critical: {
    color: '#DC2626',
  },
  warning: {
    color: '#EAB308',
  },
  uploadSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FF6B35',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FFF8F5',
  },
  uploadBoxText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  notesSection: {
    marginBottom: 16,
  },
  notesInput: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 12,
    fontSize: 13,
    color: '#333',
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
  renewalCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    elevation: 1,
  },
  renewalTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  timelineContainer: {
    marginBottom: 16,
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  timelineCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  timelineLabel: {
    flex: 1,
  },
  timelineLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  timelineDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  rejectionBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 4,
  },
  rejectionReason: {
    fontSize: 11,
    color: '#991B1B',
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  approvalBox: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  approvalText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10B981',
    marginTop: 8,
  },
  approvalSubtext: {
    fontSize: 12,
    color: '#059669',
    marginTop: 4,
  },
});
