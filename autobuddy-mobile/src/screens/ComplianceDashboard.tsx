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
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useComplianceTracking, ComplianceItem, ComplianceAlert } from '../hooks/useComplianceTracking';

interface ComplianceDashboardProps {
  token: string | null;
  userId: string;
}

export const ComplianceDashboard: React.FC<ComplianceDashboardProps> = ({
  token,
  userId,
}) => {
  // Guard against missing credentials
  if (!token || !userId) {
    return (
      <View style={styles.centered}>
        <MaterialIcons name="error-outline" size={48} color="#F44336" />
        <Text style={styles.errorText}>Authentication required</Text>
      </View>
    );
  }

  const {
    complianceItems,
    alerts,
    currentReport,
    loading,
    fetchComplianceStatus,
    fetchAlerts,
    generateComplianceReport,
    acknowledgeAlert,
    getComplianceScore,
    getExpiringItems,
    getExpiredItems,
    getComplianceTimeline,
  } = useComplianceTracking(token, userId);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ComplianceItem | null>(null);
  const [showItemDetail, setShowItemDetail] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<ComplianceAlert | null>(null);
  const [showAlertDetail, setShowAlertDetail] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      await fetchComplianceStatus?.();
      await fetchAlerts?.();
      await generateComplianceReport?.();
    } catch (err) {
      console.error('Failed to load compliance data:', err);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const success = await acknowledgeAlert(alertId);
      if (success) {
        Alert.alert('Success', 'Alert acknowledged');
        setShowAlertDetail(false);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to acknowledge alert';
      Alert.alert('Error', errorMsg);
    }
  };

  const score = Math.min(Math.max(getComplianceScore?.() ?? 0, 0), 100);
  const expiringItems = getExpiringItems?.(30) ?? [];
  const expiredItems = getExpiredItems?.() ?? [];
  const timeline = getComplianceTimeline?.() ?? [];

  const getScoreColor = (scoreValue: number): string => {
    if (scoreValue >= 80) return '#4CAF50';
    if (scoreValue >= 60) return '#FF9800';
    return '#F44336';
  };

  const getScoreStatus = (score: number) => {
    if (score >= 80) return 'Compliant';
    if (score >= 60) return 'Warning';
    return 'Non-Compliant';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Compliance Score Card */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreCircle}>
          <Text style={[styles.scoreText, { color: getScoreColor(score) }]}>
            {score}%
          </Text>
        </View>
        <View style={styles.scoreInfo}>
          <Text style={styles.scoreLabel}>Compliance Score</Text>
          <Text
            style={[
              styles.scoreStatus,
              { color: getScoreColor(score) },
            ]}
          >
            {getScoreStatus(score)}
          </Text>
          <View
            style={[
              styles.scoreIndicator,
              { backgroundColor: getScoreColor(score) },
            ]}
          />
        </View>
      </View>

      {/* Alert Badges */}
      {(expiredItems.length > 0 || expiringItems.length > 0) && (
        <View style={styles.alertBadgesContainer}>
          {expiredItems.length > 0 && (
            <View style={[styles.alertBadge, { backgroundColor: '#FFEBEE' }]}>
              <MaterialIcons name="error" size={20} color="#F44336" />
              <View style={styles.badgeText}>
                <Text style={[styles.badgeLabel, { color: '#F44336' }]}>Expired</Text>
                <Text style={styles.badgeCount}>{expiredItems.length} items</Text>
              </View>
            </View>
          )}

          {expiringItems.length > 0 && (
            <View style={[styles.alertBadge, { backgroundColor: '#FFF3E0' }]}>
              <MaterialIcons name="warning" size={20} color="#FF9800" />
              <View style={styles.badgeText}>
                <Text style={[styles.badgeLabel, { color: '#FF9800' }]}>Expiring Soon</Text>
                <Text style={styles.badgeCount}>{expiringItems.length} items</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Compliance Summary Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
          <Text style={styles.statValue}>
            {(complianceItems || []).filter((i) => i?.status === 'compliant').length}
          </Text>
          <Text style={styles.statLabel}>Compliant</Text>
        </View>

        <View style={styles.statItem}>
          <MaterialIcons name="warning" size={24} color="#FF9800" />
          <Text style={styles.statValue}>
            {(complianceItems || []).filter((i) => i?.status === 'warning').length}
          </Text>
          <Text style={styles.statLabel}>Warning</Text>
        </View>

        <View style={styles.statItem}>
          <MaterialIcons name="error" size={24} color="#F44336" />
          <Text style={styles.statValue}>
            {(complianceItems || []).filter((i) => i?.status === 'non_compliant').length}
          </Text>
          <Text style={styles.statLabel}>Non-Compliant</Text>
        </View>

        <View style={styles.statItem}>
          <MaterialIcons name="schedule" size={24} color="#9C27B0" />
          <Text style={styles.statValue}>
            {(complianceItems || []).filter((i) => i?.status === 'pending').length}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      {/* Active Alerts */}
      {(alerts || []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Alerts</Text>
          {(alerts || [])
            .filter((a) => !a?.resolvedAt)
            .slice(0, 5)
            .map((alert) => (
              <AlertCard
                key={alert?.id || Math.random()}
                alert={alert}
                onPress={() => {
                  setSelectedAlert(alert);
                  setShowAlertDetail(true);
                }}
              />
            ))}
        </View>
      )}

      {/* Compliance Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Compliance Items</Text>
        {loading && (complianceItems || []).length === 0 ? (
          <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
        ) : (complianceItems || []).length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="check-circle" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No compliance items</Text>
          </View>
        ) : (
          (complianceItems || []).map((item) => (
            <ComplianceItemCard
              key={item?.id || Math.random()}
              item={item}
              onPress={() => {
                setSelectedItem(item);
                setShowItemDetail(true);
              }}
            />
          ))
        )}
      </View>

      {/* Timeline */}
      {timeline.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification Timeline</Text>
          <View style={styles.timelineContainer}>
            {timeline.map((item, index) => (
              <View key={item.id} style={styles.timelineItem}>
                <View style={styles.timelineMarker} />
                {index < timeline.length - 1 && (
                  <View style={styles.timelineLine} />
                )}
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineType}>
                    {item.type.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                  <Text style={styles.timelineDate}>
                    {item.verifiedAt
                      ? new Date(item.verifiedAt).toLocaleDateString()
                      : 'Not verified'}
                  </Text>
                  {item.verifiedBy && (
                    <Text style={styles.timelineVerifier}>By: {item.verifiedBy}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Compliance Item Detail Modal */}
      <Modal visible={showItemDetail} transparent animationType="slide">
        {selectedItem && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowItemDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Item Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="description" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Type</Text>
                      <Text style={styles.detailValue}>
                        {((selectedItem?.type ?? 'unknown').replace(/_/g, ' ').toUpperCase())}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name={
                        (selectedItem?.status ?? 'pending') === 'compliant'
                          ? 'check-circle'
                          : (selectedItem?.status ?? 'pending') === 'warning'
                          ? 'warning'
                          : 'error'
                      }
                      size={20}
                      color={
                        (selectedItem?.status ?? 'pending') === 'compliant'
                          ? '#4CAF50'
                          : (selectedItem?.status ?? 'pending') === 'warning'
                          ? '#FF9800'
                          : '#F44336'
                      }
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Status</Text>
                      <Text style={styles.detailValue}>
                        {((selectedItem?.status ?? 'pending').charAt(0).toUpperCase() +
                          (selectedItem?.status ?? 'pending').slice(1).replace('_', ' '))}
                      </Text>
                    </View>
                  </View>

                  {selectedItem?.expiryDate && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.detailRow}>
                        <MaterialIcons name="calendar-today" size={20} color="#2196F3" />
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Expiry Date</Text>
                          <Text style={styles.detailValue}>
                            {selectedItem?.expiryDate ? new Date(selectedItem.expiryDate).toLocaleDateString() : 'Unknown'}
                          </Text>
                        </View>
                      </View>
                    </>
                  )}

                  {selectedItem?.daysUntilExpiry !== undefined && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.detailRow}>
                        <MaterialIcons name="schedule" size={20} color="#FF9800" />
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Days Until Expiry</Text>
                          <Text style={styles.detailValue}>
                            {(selectedItem?.daysUntilExpiry ?? 0) > 0
                              ? `${selectedItem?.daysUntilExpiry} days`
                              : 'Expired'}
                          </Text>
                        </View>
                      </View>
                    </>
                  )}

                  {selectedItem?.verifiedAt && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.detailRow}>
                        <MaterialIcons name="check" size={20} color="#4CAF50" />
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Verified At</Text>
                          <Text style={styles.detailValue}>
                            {selectedItem?.verifiedAt ? new Date(selectedItem.verifiedAt).toLocaleDateString() : 'Not verified'}
                          </Text>
                        </View>
                      </View>
                    </>
                  )}

                  {selectedItem?.verifiedBy && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.detailRow}>
                        <MaterialIcons name="person" size={20} color="#2196F3" />
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Verified By</Text>
                          <Text style={styles.detailValue}>{selectedItem?.verifiedBy ?? 'Unknown'}</Text>
                        </View>
                      </View>
                    </>
                  )}

                  {selectedItem?.notes && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.detailRow}>
                        <MaterialIcons name="note" size={20} color="#2196F3" />
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Notes</Text>
                          <Text style={styles.detailValue}>{selectedItem?.notes ?? 'No notes'}</Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>

      {/* Alert Detail Modal */}
      <Modal visible={showAlertDetail} transparent animationType="slide">
        {selectedAlert && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowAlertDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Alert Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="info" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Type</Text>
                      <Text style={styles.detailValue}>
                        {((selectedAlert?.type ?? 'unknown').replace(/_/g, ' ').toUpperCase())}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name={
                        (selectedAlert?.severity ?? 'medium') === 'critical'
                          ? 'error'
                          : (selectedAlert?.severity ?? 'medium') === 'high'
                          ? 'warning'
                          : 'info'
                      }
                      size={20}
                      color={
                        (selectedAlert?.severity ?? 'medium') === 'critical'
                          ? '#F44336'
                          : (selectedAlert?.severity ?? 'medium') === 'high'
                          ? '#FF9800'
                          : '#2196F3'
                      }
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Severity</Text>
                      <Text style={styles.detailValue}>
                        {((selectedAlert?.severity ?? 'medium').charAt(0).toUpperCase() +
                          (selectedAlert?.severity ?? 'medium').slice(1))}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="message" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Message</Text>
                      <Text style={styles.detailValue}>{selectedAlert?.message ?? 'No message'}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="calendar-today" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Created At</Text>
                      <Text style={styles.detailValue}>
                        {selectedAlert?.createdAt ? new Date(selectedAlert.createdAt).toLocaleDateString() : 'Unknown'}
                      </Text>
                    </View>
                  </View>

                  {selectedAlert.action && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.detailRow}>
                        <MaterialIcons name="check" size={20} color="#4CAF50" />
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Required Action</Text>
                          <Text style={styles.detailValue}>{selectedAlert.action}</Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>

                {!selectedAlert.resolvedAt && (
                  <Pressable
                    style={styles.acknowledgeButton}
                    onPress={() => handleAcknowledgeAlert(selectedAlert.id)}
                  >
                    <MaterialIcons name="check-circle" size={20} color="#fff" />
                    <Text style={styles.acknowledgeButtonText}>Acknowledge Alert</Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
};

const AlertCard: React.FC<{
  alert: ComplianceAlert;
  onPress: () => void;
}> = ({ alert, onPress }) => {
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

  return (
    <Pressable style={styles.alertCard} onPress={onPress}>
      <View
        style={[
          styles.alertIcon,
          { backgroundColor: getSeverityColor((alert?.severity ?? 'medium') as string) + '20' },
        ]}
      >
        <MaterialIcons
          name={(alert?.severity ?? 'medium') === 'critical' ? 'error' : 'warning'}
          size={20}
          color={getSeverityColor((alert?.severity ?? 'medium') as string)}
        />
      </View>

      <View style={styles.alertInfo}>
        <Text style={styles.alertType}>
          {((alert?.type ?? 'unknown').replace(/_/g, ' ').toUpperCase())}
        </Text>
        <Text style={styles.alertMessage} numberOfLines={2}>
          {alert?.message ?? 'No message provided'}
        </Text>
        <Text style={styles.alertDate}>
          {alert?.createdAt ? new Date(alert.createdAt).toLocaleDateString() : 'Unknown date'}
        </Text>
      </View>

      <View
        style={[
          styles.alertSeverityBadge,
          { backgroundColor: getSeverityColor((alert?.severity ?? 'medium') as string) + '20' },
        ]}
      >
        <Text
          style={[
            styles.alertSeverityText,
            { color: getSeverityColor((alert?.severity ?? 'medium') as string) },
          ]}
        >
          {(alert?.severity ?? 'medium').toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
};

const ComplianceItemCard: React.FC<{
  item: ComplianceItem;
  onPress: () => void;
}> = ({ item, onPress }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
        return '#4CAF50';
      case 'warning':
        return '#FF9800';
      case 'non_compliant':
        return '#F44336';
      case 'expired':
        return '#F44336';
      default:
        return '#9C27B0';
    }
  };

  return (
    <Pressable style={styles.itemCard} onPress={onPress}>
      <View style={styles.itemHeader}>
        <View
          style={[
            styles.itemIcon,
            { backgroundColor: getStatusColor((item?.status ?? 'pending') as string) + '20' },
          ]}
        >
          <MaterialIcons
            name={
              (item?.status ?? 'pending') === 'compliant'
                ? 'check-circle'
                : (item?.status ?? 'pending') === 'expired'
                ? 'error'
                : 'warning'
            }
            size={18}
            color={getStatusColor((item?.status ?? 'pending') as string)}
          />
        </View>

        <View style={styles.itemInfo}>
          <Text style={styles.itemType}>
            {((item?.type ?? 'unknown').replace(/_/g, ' ').toUpperCase())}
          </Text>
          <Text style={styles.itemStatus}>
            {((item?.status ?? 'pending').replace(/_/g, ' '))}
          </Text>
        </View>

        <View
          style={[
            styles.itemStatusBadge,
            { backgroundColor: getStatusColor((item?.status ?? 'pending') as string) + '20' },
          ]}
        >
          <Text
            style={[
              styles.itemStatusText,
              { color: getStatusColor((item?.status ?? 'pending') as string) },
            ]}
          >
            {(item?.status ?? 'pending') === 'compliant' ? '✓' : (item?.status ?? 'pending') === 'expired' ? '✕' : '!'}
          </Text>
        </View>
      </View>

      {item?.daysUntilExpiry !== undefined && item.daysUntilExpiry <= 30 && (
        <Text style={styles.itemExpiry}>
          Expires in {item.daysUntilExpiry} days
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  scoreText: {
    fontSize: 24,
    fontWeight: '700',
  },
  scoreInfo: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: 12,
    color: '#666',
  },
  scoreStatus: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  scoreIndicator: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  alertBadgesContainer: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  alertBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  badgeText: {
    flex: 1,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeCount: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 16,
    gap: 8,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertInfo: {
    flex: 1,
  },
  alertType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  alertMessage: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    lineHeight: 15,
  },
  alertDate: {
    fontSize: 9,
    color: '#999',
    marginTop: 4,
  },
  alertSeverityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  alertSeverityText: {
    fontSize: 9,
    fontWeight: '700',
  },
  itemCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  itemStatus: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  itemStatusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemStatusText: {
    fontSize: 16,
    fontWeight: '700',
  },
  itemExpiry: {
    fontSize: 10,
    color: '#FF9800',
    marginTop: 8,
    marginLeft: 52,
    fontWeight: '600',
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
  timelineContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
    marginRight: 16,
    marginTop: 2,
  },
  timelineLine: {
    position: 'absolute',
    left: 5,
    top: 12,
    width: 2,
    height: 40,
    backgroundColor: '#e0e0e0',
  },
  timelineContent: {
    flex: 1,
  },
  timelineType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  timelineDate: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  timelineVerifier: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
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
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  acknowledgeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
  },
  acknowledgeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

export default ComplianceDashboard;
