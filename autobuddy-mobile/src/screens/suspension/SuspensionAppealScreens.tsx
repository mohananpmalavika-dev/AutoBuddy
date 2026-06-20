import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSuspensionAppeal, Appeal } from '../hooks/useSuspensionAppeal';

interface SuspensionAppealScreensProps {
  userId: string;
  authToken: string;
}

export function SuspensionAppealScreens({ userId, authToken }: SuspensionAppealScreensProps) {
  const {
    activeSuspension,
    appealHistory,
    pendingAppeal,
    isLoading,
    submitAppeal,
    calculateDaysSinceSuspension,
    calculateDaysUntilDeadline,
  } = useSuspensionAppeal(userId, authToken);

  const [showAppealModal, setShowAppealModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'notice' | 'tracking' | 'history'>('notice');

  if (!activeSuspension) {
    return (
      <View style={styles.container}>
        <View style={styles.noSuspensionCard}>
          <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
          <Text style={styles.noSuspensionTitle}>Account Active</Text>
          <Text style={styles.noSuspensionText}>
            Your account is in good standing. No action needed.
          </Text>
        </View>

        {appealHistory.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Appeal History</Text>
            <AppealHistoryTab appeals={appealHistory} />
          </>
        )}
      </View>
    );
  }

  const daysSinceSuspension = calculateDaysSinceSuspension(activeSuspension.date_suspended);
  const daysUntilDeadline = calculateDaysUntilDeadline(activeSuspension.date_suspended);

  return (
    <ScrollView style={styles.container}>
      {activeTab === 'notice' && (
        <>
          {/* Suspension Alert Banner */}
          <View style={styles.suspensionAlert}>
            <View style={styles.suspensionAlertIcon}>
              <MaterialIcons name="warning" size={32} color="#fff" />
            </View>
            <View style={styles.suspensionAlertContent}>
              <Text style={styles.suspensionAlertTitle}>Account Suspended</Text>
              <Text style={styles.suspensionAlertReason}>{activeSuspension.reason}</Text>
            </View>
          </View>

          {/* Suspension Details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Suspension Details</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Suspended on</Text>
              <Text style={styles.detailValue}>
                {new Date(activeSuspension.date_suspended).toLocaleDateString('en-IN')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Days suspended</Text>
              <Text style={styles.detailValue}>{daysSinceSuspension} days</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Appeal deadline</Text>
              <Text style={[styles.detailValue, daysUntilDeadline <= 7 && styles.deadlineWarning]}>
                {daysUntilDeadline} days left
              </Text>
            </View>
          </View>

          {/* Appeal Option */}
          {activeSuspension.can_appeal && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Appeal This Suspension</Text>
              <Text style={styles.appealDescription}>
                You have the right to appeal this decision. Submit a written explanation and supporting
                documents to help us reconsider.
              </Text>

              <Pressable
                style={styles.appealButton}
                onPress={() => setShowAppealModal(true)}
              >
                <MaterialIcons name="edit" size={20} color="#fff" />
                <Text style={styles.appealButtonText}>Submit an Appeal</Text>
              </Pressable>

              {pendingAppeal && (
                <Pressable
                  style={styles.trackButton}
                  onPress={() => setActiveTab('tracking')}
                >
                  <Text style={styles.trackButtonText}>View Appeal Status</Text>
                  <MaterialIcons name="chevron-right" size={18} color="#2196F3" />
                </Pressable>
              )}
            </View>
          )}

          {/* Previous Appeals */}
          {appealHistory.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Previous Appeals</Text>
              {appealHistory.slice(0, 3).map((appeal) => (
                <View key={appeal.appeal_id} style={styles.appealPreview}>
                  <MaterialIcons
                    name={
                      appeal.status === 'approved'
                        ? 'check-circle'
                        : appeal.status === 'rejected'
                        ? 'cancel'
                        : 'hourglass-empty'
                    }
                    size={20}
                    color={
                      appeal.status === 'approved'
                        ? '#4CAF50'
                        : appeal.status === 'rejected'
                        ? '#F44336'
                        : '#FFA500'
                    }
                  />
                  <View style={styles.appealPreviewContent}>
                    <Text style={styles.appealPreviewStatus}>
                      {appeal.status === 'approved'
                        ? 'Approved'
                        : appeal.status === 'rejected'
                        ? 'Rejected'
                        : 'Pending'}
                    </Text>
                    <Text style={styles.appealPreviewDate}>
                      {new Date(appeal.created_at).toLocaleDateString('en-IN')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {activeTab === 'tracking' && pendingAppeal && (
        <AppealTrackingTab appeal={pendingAppeal} />
      )}

      {activeTab === 'history' && <AppealHistoryTab appeals={appealHistory} />}

      {/* Tab Navigation */}
      <View style={styles.tabNav}>
        <Pressable
          style={[styles.tab, activeTab === 'notice' && styles.tabActive]}
          onPress={() => setActiveTab('notice')}
        >
          <Text style={[styles.tabLabel, activeTab === 'notice' && styles.tabLabelActive]}>
            Suspension
          </Text>
        </Pressable>

        {pendingAppeal && (
          <Pressable
            style={[styles.tab, activeTab === 'tracking' && styles.tabActive]}
            onPress={() => setActiveTab('tracking')}
          >
            <Text style={[styles.tabLabel, activeTab === 'tracking' && styles.tabLabelActive]}>
              Tracking
            </Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]}>
            History
          </Text>
        </Pressable>
      </View>

      {/* Appeal Modal */}
      <SubmitAppealModal
        visible={showAppealModal}
        onClose={() => setShowAppealModal(false)}
        onSubmit={async (reason, documents) => {
          const result = await submitAppeal(reason, documents);
          if (result) {
            setShowAppealModal(false);
            Alert.alert('Appeal Submitted', 'Your appeal has been submitted. We will review it within 24-48 hours.');
            setActiveTab('tracking');
          }
        }}
      />
    </ScrollView>
  );
}

interface SubmitAppealModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string, documents?: File[]) => Promise<void>;
}

function SubmitAppealModal({ visible, onClose, onSubmit }: SubmitAppealModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      Alert.alert('Error', 'Please enter a reason for your appeal');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(reason);
      setReason('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <MaterialIcons name="close" size={24} color="#000" />
            </Pressable>
            <Text style={styles.modalTitle}>Submit an Appeal</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.modalDescription}>
              Explain why you believe this suspension is unfair. Be clear and concise.
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="Your reason for appeal (required)"
              multiline
              numberOfLines={6}
              maxLength={1000}
              value={reason}
              onChangeText={setReason}
              placeholderTextColor="#ccc"
            />

            <View style={styles.charCounter}>
              <Text style={styles.charCounterText}>
                {reason.length} / 1000 characters
              </Text>
            </View>

            <Text style={styles.docsLabel}>Supporting Documents (Optional)</Text>
            <Text style={styles.docsInfo}>
              You can upload up to 5 documents (PDF, JPG, PNG) to support your appeal. Each file must be
              less than 5MB.
            </Text>

            <Pressable style={styles.uploadButton}>
              <MaterialIcons name="upload-file" size={20} color="#2196F3" />
              <Text style={styles.uploadButtonText}>Choose Files</Text>
            </Pressable>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable
              style={styles.cancelButton}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.submitButton, !reason.trim() && styles.submitButtonDisabled, isSubmitting && styles.submitButtonLoading]}
              onPress={handleSubmit}
              disabled={!reason.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>Submit Appeal</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface AppealTrackingTabProps {
  appeal: Appeal;
}

function AppealTrackingTab({ appeal }: AppealTrackingTabProps) {
  return (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Appeal Status</Text>

      {/* Timeline */}
      <View style={styles.timeline}>
        <TimelineStep
          label="Appeal Submitted"
          date={new Date(appeal.created_at).toLocaleDateString('en-IN')}
          completed
        />

        <TimelineStep
          label="Under Review"
          date={appeal.decided_at ? new Date(appeal.decided_at).toLocaleDateString('en-IN') : 'Pending'}
          completed={appeal.status !== 'pending'}
          active={appeal.status === 'pending'}
        />

        <TimelineStep
          label={appeal.status === 'approved' ? 'Approved' : 'Decision'}
          date={appeal.decided_at ? new Date(appeal.decided_at).toLocaleDateString('en-IN') : '-'}
          completed={appeal.status !== 'pending'}
        />
      </View>

      {/* Appeal Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Appeal Details</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Appeal ID</Text>
          <Text style={styles.detailValue}>{appeal.appeal_id}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Status</Text>
          <Text
            style={[
              styles.detailValue,
              appeal.status === 'approved' && styles.statusApproved,
              appeal.status === 'rejected' && styles.statusRejected,
              appeal.status === 'pending' && styles.statusPending,
            ]}
          >
            {appeal.status.toUpperCase()}
          </Text>
        </View>

        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>Your Appeal Reason</Text>
          <Text style={styles.reasonText}>{appeal.appeal_reason}</Text>
        </View>
      </View>

      {/* Decision */}
      {appeal.status !== 'pending' && (
        <View style={[styles.card, appeal.status === 'approved' ? styles.cardSuccess : styles.cardError]}>
          <View style={styles.decisionHeader}>
            <MaterialIcons
              name={appeal.status === 'approved' ? 'check-circle' : 'cancel'}
              size={32}
              color={appeal.status === 'approved' ? '#4CAF50' : '#F44336'}
            />
            <Text style={styles.decisionTitle}>
              {appeal.status === 'approved' ? 'Appeal Approved' : 'Appeal Rejected'}
            </Text>
          </View>

          {appeal.decision_message && (
            <View style={styles.decisionMessage}>
              <Text style={styles.decisionMessageLabel}>Decision Message</Text>
              <Text style={styles.decisionMessageText}>{appeal.decision_message}</Text>
            </View>
          )}

          {appeal.status === 'approved' && (
            <Text style={styles.decisionAction}>
              Your suspension has been lifted. You can now go online.
            </Text>
          )}

          {appeal.status === 'rejected' && (
            <Text style={styles.decisionAction}>
              You can submit another appeal if you have additional information to provide.
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

interface AppealHistoryTabProps {
  appeals: Appeal[];
}

function AppealHistoryTab({ appeals }: AppealHistoryTabProps) {
  return (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Appeal History</Text>

      {appeals.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="history" size={48} color="#ccc" />
          <Text style={styles.emptyTitle}>No Appeals</Text>
          <Text style={styles.emptyText}>You haven't submitted any appeals yet</Text>
        </View>
      ) : (
        appeals.map((appeal) => (
          <View key={appeal.appeal_id} style={styles.historyCard}>
            <View style={styles.historyCardHeader}>
              <View style={styles.historyCardIconBox}>
                <MaterialIcons
                  name={
                    appeal.status === 'approved'
                      ? 'check-circle'
                      : appeal.status === 'rejected'
                      ? 'cancel'
                      : 'hourglass-empty'
                  }
                  size={24}
                  color={
                    appeal.status === 'approved'
                      ? '#4CAF50'
                      : appeal.status === 'rejected'
                      ? '#F44336'
                      : '#FFA500'
                  }
                />
              </View>
              <View style={styles.historyCardContent}>
                <Text style={styles.historyCardTitle}>
                  Appeal {appeal.status === 'approved' ? 'Approved' : appeal.status === 'rejected' ? 'Rejected' : 'Pending'}
                </Text>
                <Text style={styles.historyCardDate}>
                  {new Date(appeal.created_at).toLocaleDateString('en-IN')}
                </Text>
              </View>
            </View>

            <View style={styles.historyCardReason}>
              <Text style={styles.historyCardReasonTitle}>Your Reason</Text>
              <Text style={styles.historyCardReasonText}>{appeal.appeal_reason}</Text>
            </View>

            {appeal.decision_message && (
              <View style={styles.historyCardDecision}>
                <Text style={styles.historyCardDecisionTitle}>Decision</Text>
                <Text style={styles.historyCardDecisionText}>{appeal.decision_message}</Text>
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

interface TimelineStepProps {
  label: string;
  date: string;
  completed?: boolean;
  active?: boolean;
}

function TimelineStep({ label, date, completed = false, active = false }: TimelineStepProps) {
  return (
    <View style={styles.timelineStep}>
      <View style={styles.timelineStepDot}>
        {completed ? (
          <MaterialIcons name="check" size={16} color="#fff" />
        ) : active ? (
          <View style={styles.activeRing} />
        ) : null}
      </View>

      <View style={styles.timelineStepContent}>
        <Text style={[styles.timelineStepLabel, active && styles.timelineStepLabelActive]}>
          {label}
        </Text>
        <Text style={styles.timelineStepDate}>{date}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  noSuspensionCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 16,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  noSuspensionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 12,
  },
  noSuspensionText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  suspensionAlert: {
    backgroundColor: '#F44336',
    marginHorizontal: 12,
    marginVertical: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  suspensionAlertIcon: {
    marginRight: 12,
  },
  suspensionAlertContent: {
    flex: 1,
  },
  suspensionAlertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  suspensionAlertReason: {
    fontSize: 13,
    color: '#fff',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  deadlineWarning: {
    color: '#F44336',
  },
  appealDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  appealButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  appealButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  trackButtonText: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '600',
  },
  appealPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  appealPreviewContent: {
    marginLeft: 12,
    flex: 1,
  },
  appealPreviewStatus: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  appealPreviewDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  tabNav: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#2196F3',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  tabLabelActive: {
    color: '#2196F3',
  },
  tabContent: {
    paddingVertical: 12,
    paddingBottom: 80,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  modalBody: {
    padding: 16,
  },
  modalDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  reasonInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 8,
    textAlignVertical: 'top',
  },
  charCounter: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  charCounterText: {
    fontSize: 12,
    color: '#999',
  },
  docsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  docsInfo: {
    fontSize: 12,
    color: '#999',
    lineHeight: 18,
    marginBottom: 12,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
  },
  uploadButtonText: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '600',
    marginLeft: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonLoading: {
    opacity: 0.8,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
  timeline: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  timelineStep: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineStepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  activeRing: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2196F3',
  },
  timelineStepContent: {
    flex: 1,
    justifyContent: 'center',
  },
  timelineStepLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  timelineStepLabelActive: {
    color: '#2196F3',
  },
  timelineStepDate: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 2,
  },
  reasonBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  reasonLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginBottom: 6,
  },
  reasonText: {
    fontSize: 13,
    color: '#000',
    lineHeight: 20,
  },
  cardSuccess: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  cardError: {
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  decisionHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  decisionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginTop: 8,
  },
  decisionMessage: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  decisionMessageLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 6,
  },
  decisionMessageText: {
    fontSize: 13,
    color: '#000',
    lineHeight: 20,
  },
  decisionAction: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 12,
  },
  emptyCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 16,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    marginTop: 6,
  },
  historyCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    padding: 12,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  historyCardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyCardContent: {
    flex: 1,
  },
  historyCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  historyCardDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  historyCardReason: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  historyCardReasonTitle: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginBottom: 6,
  },
  historyCardReasonText: {
    fontSize: 13,
    color: '#000',
    lineHeight: 18,
  },
  historyCardDecision: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  historyCardDecisionTitle: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginBottom: 6,
  },
  historyCardDecisionText: {
    fontSize: 13,
    color: '#000',
    lineHeight: 18,
  },
  statusApproved: {
    color: '#4CAF50',
  },
  statusRejected: {
    color: '#F44336',
  },
  statusPending: {
    color: '#FFA500',
  },
});

export default SuspensionAppealScreens;
