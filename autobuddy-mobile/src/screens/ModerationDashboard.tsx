import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useModerationDashboard, ReportedContent } from '../hooks/useModerationDashboard';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

interface ModerationDashboardProps {
  token: string | null;
  adminId: string;
}

export const ModerationDashboard: React.FC<ModerationDashboardProps> = ({
  token,
  adminId,
}) => {
  // Guard against missing credentials
  if (!token || !adminId) {
    return (
      <View style={styles.centered}>
        <MaterialIcons name="error-outline" size={48} color="#F44336" />
        <Text style={styles.errorText}>Authentication required</Text>
      </View>
    );
  }

  const {
    reports,
    stats,
    loading,
    fetchReports,
    fetchStats,
    updateReportStatus,
    takeAction,
    dismissReport,
  } = useModerationDashboard(token, adminId);

  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reviewing' | 'resolved'>('pending');
  const [selectedReport, setSelectedReport] = useState<ReportedContent | null>(null);
  const [showReportDetail, setShowReportDetail] = useState(false);
  const [actionType, setActionType] = useState<'none' | 'warning' | 'suspension' | 'ban'>('warning');
  const [actionReason, setActionReason] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchReports();
    await fetchStats();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleTakeAction = async () => {
    if (!selectedReport || !actionReason?.trim?.()) {
      Alert.alert('Error', 'Please provide a reason for the action');
      return;
    }

    // Validate action type
    if (!['warning', 'suspension', 'ban'].includes(actionType)) {
      Alert.alert('Error', 'Invalid action type');
      return;
    }

    try {
      const success = await takeAction(selectedReport.id, actionType, actionReason);
      if (success) {
        Alert.alert('Success', `User ${actionType}ed successfully`);
        setActionReason('');
        setShowReportDetail(false);
        await loadData();
      } else {
        Alert.alert('Error', 'Failed to take action');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to take action';
      Alert.alert('Error', errorMsg);
    }
  };

  const handleDismissReport = async () => {
    if (!selectedReport) return;

    Alert.alert('Dismiss Report', 'Are you sure you want to dismiss this report?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        style: 'destructive',
        onPress: async () => {
          const success = await dismissReport(selectedReport.id, 'Dismissed by moderator');
          if (success) {
            Alert.alert('Success', 'Report dismissed');
            setShowReportDetail(false);
            await loadData();
          }
        },
      },
    ]);
  };

  const filteredReports = reports.filter((r) => {
    if (filterStatus === 'all') return true;
    return r.status === filterStatus;
  });

  const pendingCount = reports.filter((r) => r.status === 'pending').length;
  const reviewingCount = reports.filter((r) => r.status === 'reviewing').length;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Stats Cards */}
      {stats && (
        <View style={styles.statsGrid}>
          <StatCard
            icon="warning"
            label="Total Reports"
            value={stats.totalReports.toString()}
            color="#FF9800"
          />
          <StatCard
            icon="schedule"
            label="Pending"
            value={stats.pendingReports.toString()}
            color="#2196F3"
          />
          <StatCard
            icon="check-circle"
            label="Resolved"
            value={stats.resolvedReports.toString()}
            color="#4CAF50"
          />
          <StatCard
            icon="timer"
            label="Avg Resolution"
            value={`${stats.avgResolutionTime}h`}
            color="#9C27B0"
          />
        </View>
      )}

      {/* Actions Taken */}
      {stats && (
        <View style={styles.actionStats}>
          <ActionBadge
            icon="mail"
            label="Warned"
            value={stats.usersWarned}
            color="#FF9800"
          />
          <ActionBadge
            icon="block"
            label="Suspended"
            value={stats.usersSuspended}
            color="#2196F3"
          />
          <ActionBadge
            icon="lock"
            label="Banned"
            value={stats.usersBanned}
            color="#F44336"
          />
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <FilterTab
          label={`All (${reports.length})`}
          active={filterStatus === 'all'}
          onPress={() => setFilterStatus('all')}
        />
        <FilterTab
          label={`Pending (${pendingCount})`}
          active={filterStatus === 'pending'}
          onPress={() => setFilterStatus('pending')}
        />
        <FilterTab
          label={`Reviewing (${reviewingCount})`}
          active={filterStatus === 'reviewing'}
          onPress={() => setFilterStatus('reviewing')}
        />
        <FilterTab
          label="Resolved"
          active={filterStatus === 'resolved'}
          onPress={() => setFilterStatus('resolved')}
        />
      </View>

      {/* Reports List */}
      <View style={styles.section}>
        {loading && reports.length === 0 ? (
          <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
        ) : filteredReports.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="check-circle" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No reports in this category</Text>
          </View>
        ) : (
          filteredReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onPress={() => {
                setSelectedReport(report);
                setShowReportDetail(true);
              }}
            />
          ))
        )}
      </View>

      {/* Report Detail Modal */}
      <Modal visible={showReportDetail} transparent animationType="slide">
        {selectedReport && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowReportDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Report Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="person" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Reported User</Text>
                      <Text style={styles.detailValue}>
                        {selectedReport.reportedUser}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="type" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Type</Text>
                      <Text style={styles.detailValue}>
                        {((selectedReport?.type ?? 'unknown')
                          .charAt(0)
                          .toUpperCase() + (selectedReport?.type ?? 'unknown').slice(1))}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name={
                        selectedReport?.severity === 'critical'
                          ? 'error'
                          : selectedReport?.severity === 'high'
                          ? 'warning'
                          : 'info'
                      }
                      size={20}
                      color={
                        selectedReport?.severity === 'critical'
                          ? '#F44336'
                          : selectedReport?.severity === 'high'
                          ? '#FF9800'
                          : '#2196F3'
                      }
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Severity</Text>
                      <Text style={styles.detailValue}>
                        {((selectedReport?.severity ?? 'unknown')
                          .charAt(0)
                          .toUpperCase() + (selectedReport?.severity ?? 'unknown').slice(1))}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="reason" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Reason</Text>
                      <Text style={styles.detailValue}>
                        {selectedReport?.reason ?? 'No reason provided'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="description" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Description</Text>
                      <Text style={styles.detailValue}>
                        {selectedReport?.description ?? 'No description'}
                      </Text>
                    </View>
                  </View>
                </View>

                {selectedReport?.status !== 'resolved' && selectedReport?.status !== 'dismissed' && (
                  <View style={styles.actionSection}>
                    <Text style={styles.actionTitle}>Take Action</Text>

                    <Text style={styles.actionLabel}>Action Type</Text>
                    <View style={styles.actionButtons}>
                      {(['warning', 'suspension', 'ban'] as const).map((action) => (
                        <Pressable
                          key={action}
                          style={[
                            styles.actionButton,
                            actionType === action && styles.actionButtonActive,
                          ]}
                          onPress={() => setActionType(action)}
                        >
                          <Text
                            style={[
                              styles.actionButtonText,
                              actionType === action &&
                                styles.actionButtonTextActive,
                            ]}
                          >
                            {action.charAt(0).toUpperCase() + action.slice(1)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.actionLabel}>Reason for Action</Text>
                    <View style={styles.reasonInput}>
                      {/* Note: Would be TextInput in real implementation */}
                      <Text style={styles.reasonInputPlaceholder}>
                        Provide reason for moderation action...
                      </Text>
                    </View>

                    <Pressable
                      style={styles.confirmButton}
                      onPress={handleTakeAction}
                    >
                      <MaterialIcons name="check" size={18} color="#fff" />
                      <Text style={styles.confirmButtonText}>Confirm Action</Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>

              <View style={styles.modalFooter}>
                {selectedReport.status === 'pending' || selectedReport.status === 'reviewing' ? (
                  <Pressable
                    style={[styles.footerButton, styles.dismissButton]}
                    onPress={handleDismissReport}
                  >
                    <Text style={styles.dismissButtonText}>Dismiss Report</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
};

const StatCard: React.FC<{
  icon: string;
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => {
  return (
    <View style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
};

const ActionBadge: React.FC<{
  icon: string;
  label: string;
  value: number;
  color: string;
}> = ({ icon, label, value, color }) => {
  return (
    <View style={[styles.actionBadge, { backgroundColor: color + '20' }]}>
      <MaterialIcons name={icon as any} size={18} color={color} />
      <Text style={[styles.actionBadgeLabel, { color }]}>{label}</Text>
      <Text style={[styles.actionBadgeValue, { color }]}>{value}</Text>
    </View>
  );
};

const FilterTab: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => {
  return (
    <Pressable
      style={[styles.filterTab, active && styles.filterTabActive]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterTabText,
          active && styles.filterTabTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const ReportCard: React.FC<{
  report: ReportedContent;
  onPress: () => void;
}> = ({ report, onPress }) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#F44336';
      case 'high':
        return '#FF9800';
      case 'medium':
        return '#FFC107';
      default:
        return '#2196F3';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#FF9800';
      case 'reviewing':
        return '#2196F3';
      case 'resolved':
        return '#4CAF50';
      default:
        return '#999';
    }
  };

  return (
    <Pressable style={styles.reportCard} onPress={onPress}>
      <View style={styles.reportHeader}>
        <View style={styles.reportInfo}>
          <Text style={styles.reportType}>
            {((report?.type ?? 'unknown').replace(/_/g, ' ').toUpperCase())}
          </Text>
          <Text style={styles.reportUser}>{report?.reportedUser ?? 'Unknown'}</Text>
        </View>
        <View
          style={[
            styles.severityBadge,
            { backgroundColor: getSeverityColor(report?.severity ?? 'medium') + '20' },
          ]}
        >
          <Text
            style={[
              styles.severityBadgeText,
              { color: getSeverityColor(report?.severity ?? 'medium') },
            ]}
          >
            {((report?.severity ?? 'unknown').toUpperCase())}
          </Text>
        </View>
      </View>

      <Text style={styles.reportReason} numberOfLines={2}>
        {report?.reason ?? 'No reason provided'}
      </Text>

      <View style={styles.reportFooter}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusBadgeColor(report?.status ?? 'pending') + '20' },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              { color: getStatusBadgeColor(report?.status ?? 'pending') },
            ]}
          >
            {((report?.status ?? 'unknown').toUpperCase())}
          </Text>
        </View>
        <Text style={styles.reportDate}>
          {formatDateSafely(report?.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  actionStats: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  actionBadge: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 6,
  },
  actionBadgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  actionBadgeValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#2196F3',
  },
  filterTabText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  section: {
    marginHorizontal: 16,
    marginVertical: 12,
  },
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reportInfo: {
    flex: 1,
  },
  reportType: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  reportUser: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  severityBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  reportReason: {
    fontSize: 11,
    color: '#666',
    lineHeight: 15,
    marginBottom: 8,
  },
  reportFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  reportDate: {
    fontSize: 9,
    color: '#999',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  detailCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  actionSection: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  actionButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  actionButtonTextActive: {
    color: '#fff',
  },
  reasonInput: {
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
    marginBottom: 12,
    justifyContent: 'flex-start',
  },
  reasonInputPlaceholder: {
    fontSize: 12,
    color: '#999',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: '#F44336',
    borderRadius: 6,
  },
  confirmButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  footerButton: {
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  dismissButton: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#F44336',
  },
  dismissButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F44336',
  },
});

export default ModerationDashboard;
