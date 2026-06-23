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
  Dimensions,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  useRideComplianceRules,
  ComplianceRule,
  SafetyGuideline,
  ComplianceAlert,
} from '../hooks/useRideComplianceRules';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

const formatDateTimeSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : 'Unknown';
};

interface RideComplianceRulesScreenProps {
  token: string | null;
  userId: string;
  userType?: 'passenger' | 'driver';
}

const { width } = Dimensions.get('window');

export const RideComplianceRulesScreen: React.FC<RideComplianceRulesScreenProps> = ({
  token,
  userId,
  userType = 'passenger',
}) => {
  const {
    complianceRules,
    safetyGuidelines,
    alerts,
    loading,
    unacknowledgedCount,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    getRulesByCategory,
    getCriticalRules,
    getUnacknowledgedAlerts,
  } = useRideComplianceRules(token, userType);

  const [activeTab, setActiveTab] = useState<'rules' | 'safety' | 'alerts'>('alerts');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ComplianceRule | null>(null);
  const [showRuleDetail, setShowRuleDetail] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<ComplianceAlert | null>(null);
  const [showAlertDetail, setShowAlertDetail] = useState(false);
  const [selectedGuideline, setSelectedGuideline] = useState<SafetyGuideline | null>(null);
  const [showGuidelineDetail, setShowGuidelineDetail] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh delay
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    acknowledgeAlert(alertId);
    Alert.alert('Success', 'Alert acknowledged');
  };

  const handleAcknowledgeAll = () => {
    Alert.alert(
      'Acknowledge All',
      'Mark all alerts as acknowledged?',
      [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Acknowledge All',
          onPress: () => {
            acknowledgeAllAlerts();
            Alert.alert('Success', 'All alerts acknowledged');
          },
          style: 'default',
        },
      ]
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#F44336';
      case 'warning':
        return '#FF9800';
      case 'info':
        return '#2196F3';
      default:
        return '#757575';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'check_circle';
    }
  };

  const getRuleIcon = (icon: string) => {
    const iconMap: { [key: string]: string } = {
      security: 'security',
      how_to_reg: 'how_to_reg',
      door_front: 'door_front',
      security_check: 'security',
      emergency: 'emergency',
      build: 'build',
      directions_car: 'directions_car',
      person_outline: 'person',
      map: 'map',
      payment: 'payment',
      star_rate: 'star',
      description: 'description',
    };
    return iconMap[icon] || 'check_circle';
  };

  const renderAlertCard = (alert: ComplianceAlert) => (
    <Pressable
      key={alert.id}
      onPress={() => {
        setSelectedAlert(alert);
        setShowAlertDetail(true);
      }}
      style={({ pressed }) => [
        styles.alertCard,
        {
          backgroundColor: alert.acknowledged ? '#F5F5F5' : '#FFF3E0',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.alertHeader}>
        <View
          style={[
            styles.severityBadge,
            { backgroundColor: getSeverityColor(alert.severity) },
          ]}
        >
          <MaterialIcons
            name={getSeverityIcon(alert.severity)}
            size={16}
            color="white"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.alertTitle}>{alert.title}</Text>
          <Text style={styles.alertTime}>
            {formatDateSafely(alert.timestamp)}
          </Text>
        </View>
        {!alert.acknowledged && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>New</Text>
          </View>
        )}
      </View>
      <Text style={styles.alertMessage}>{alert.message}</Text>
      {!alert.acknowledged && (
        <Pressable
          onPress={() => handleAcknowledgeAlert(alert.id)}
          style={({ pressed }) => [
            styles.acknowledgeButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.acknowledgeButtonText}>Acknowledge</Text>
        </Pressable>
      )}
    </Pressable>
  );

  const renderRuleCard = (rule: ComplianceRule) => (
    <Pressable
      key={rule.id}
      onPress={() => {
        setSelectedRule(rule);
        setShowRuleDetail(true);
      }}
      style={({ pressed }) => [
        styles.ruleCard,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.ruleHeader}>
        <View
          style={[
            styles.ruleIconContainer,
            { backgroundColor: getSeverityColor(rule.severity) + '20' },
          ]}
        >
          <MaterialIcons
            name={getRuleIcon(rule.icon)}
            size={24}
            color={getSeverityColor(rule.severity)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ruleTitle}>{rule.title}</Text>
          <Text style={styles.ruleCategory}>{rule.category.toUpperCase()}</Text>
        </View>
        <View
          style={[
            styles.severityBadge,
            { backgroundColor: getSeverityColor(rule.severity) },
          ]}
        >
          <Text style={styles.severityBadgeText}>
            {rule.severity.charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.ruleDescription} numberOfLines={2}>
        {rule.description}
      </Text>
      <View style={styles.tapIndicator}>
        <MaterialIcons name="arrow_forward" size={16} color="#2196F3" />
      </View>
    </Pressable>
  );

  const renderGuidelineCard = (guideline: SafetyGuideline) => (
    <Pressable
      key={guideline.id}
      onPress={() => {
        setSelectedGuideline(guideline);
        setShowGuidelineDetail(true);
      }}
      style={({ pressed }) => [
        styles.guidelineCard,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.guidelineHeader}>
        <MaterialIcons name="check_circle" size={32} color="#4CAF50" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.guidelineTitle}>{guideline.title}</Text>
          <Text style={styles.guidelineContent} numberOfLines={2}>
            {guideline.content}
          </Text>
        </View>
      </View>
      <View style={styles.tipPreview}>
        <Text style={styles.tipsCount}>{guideline.tips.length} tips</Text>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading compliance information...</Text>
      </View>
    );
  }

  const unacknowledgedAlerts = getUnacknowledgedAlerts();
  const criticalRules = getCriticalRules();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Compliance & Safety</Text>
        <Text style={styles.headerSubtitle}>
          {unacknowledgedCount > 0
            ? `${unacknowledgedCount} pending alert${unacknowledgedCount !== 1 ? 's' : ''}`
            : 'All caught up'}
        </Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <Pressable
          onPress={() => setActiveTab('alerts')}
          style={[
            styles.tab,
            activeTab === 'alerts' && styles.activeTab,
          ]}
        >
          <MaterialIcons
            name="notifications"
            size={20}
            color={activeTab === 'alerts' ? '#2196F3' : '#757575'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'alerts' && styles.activeTabText,
            ]}
          >
            Alerts {unacknowledgedCount > 0 && `(${unacknowledgedCount})`}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('rules')}
          style={[
            styles.tab,
            activeTab === 'rules' && styles.activeTab,
          ]}
        >
          <MaterialIcons
            name="gavel"
            size={20}
            color={activeTab === 'rules' ? '#2196F3' : '#757575'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'rules' && styles.activeTabText,
            ]}
          >
            Rules
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('safety')}
          style={[
            styles.tab,
            activeTab === 'safety' && styles.activeTab,
          ]}
        >
          <MaterialIcons
            name="security"
            size={20}
            color={activeTab === 'safety' ? '#2196F3' : '#757575'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'safety' && styles.activeTabText,
            ]}
          >
            Safety
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'alerts' && (
          <View>
            {unacknowledgedCount > 0 && (
              <Pressable
                onPress={handleAcknowledgeAll}
                style={styles.acknowledgeAllButton}
              >
                <MaterialIcons name="check_all" size={20} color="white" />
                <Text style={styles.acknowledgeAllText}>
                  Acknowledge All ({unacknowledgedCount})
                </Text>
              </Pressable>
            )}
            {alerts.length > 0 ? (
              alerts.map(renderAlertCard)
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="check_circle" size={64} color="#4CAF50" />
                <Text style={styles.emptyStateText}>No alerts</Text>
                <Text style={styles.emptyStateSubtext}>
                  You're all set with compliance
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'rules' && (
          <View>
            {criticalRules.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <MaterialIcons name="priority_high" size={20} color="#F44336" />
                  <Text style={styles.sectionTitle}>Critical Rules</Text>
                </View>
                {criticalRules.map(renderRuleCard)}
              </>
            )}

            <View style={styles.sectionHeader}>
              <MaterialIcons name="list" size={20} color="#2196F3" />
              <Text style={styles.sectionTitle}>All Rules & Regulations</Text>
            </View>
            {complianceRules.length > 0 ? (
              complianceRules.map(renderRuleCard)
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="info" size={64} color="#2196F3" />
                <Text style={styles.emptyStateText}>No rules available</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'safety' && (
          <View>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="health_and_safety" size={20} color="#4CAF50" />
              <Text style={styles.sectionTitle}>Safety Guidelines</Text>
            </View>
            {safetyGuidelines.length > 0 ? (
              safetyGuidelines.map(renderGuidelineCard)
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="help" size={64} color="#FF9800" />
                <Text style={styles.emptyStateText}>No guidelines available</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Rule Detail Modal */}
      <Modal
        visible={showRuleDetail && selectedRule !== null}
        animationType="slide"
        transparent={false}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowRuleDetail(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </Pressable>
            <Text style={styles.modalTitle}>Rule Details</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedRule && (
              <>
                <View
                  style={[
                    styles.detailSeverityBanner,
                    {
                      backgroundColor:
                        getSeverityColor(selectedRule.severity) + '20',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.detailSeverityBadge,
                      {
                        backgroundColor: getSeverityColor(selectedRule.severity),
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={getSeverityIcon(selectedRule.severity)}
                      size={24}
                      color="white"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailRuleTitle}>
                      {selectedRule.title}
                    </Text>
                    <Text style={styles.detailCategory}>
                      {selectedRule.category.toUpperCase()} ·{' '}
                      {selectedRule.severity.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Description</Text>
                  <Text style={styles.detailText}>
                    {selectedRule.description}
                  </Text>
                </View>

                {selectedRule.details && selectedRule.details.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Key Points</Text>
                    {selectedRule.details.map((detail, index) => (
                      <View key={index} style={styles.detailPoint}>
                        <View style={styles.detailPointBullet}>
                          <Text style={styles.bulletText}>•</Text>
                        </View>
                        <Text style={styles.detailPointText}>{detail}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Pressable
                  onPress={() => setShowRuleDetail(false)}
                  style={({ pressed }) => [
                    styles.closeButton,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={styles.closeButtonText}>Understood</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Guideline Detail Modal */}
      <Modal
        visible={showGuidelineDetail && selectedGuideline !== null}
        animationType="slide"
        transparent={false}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowGuidelineDetail(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </Pressable>
            <Text style={styles.modalTitle}>Safety Guideline</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedGuideline && (
              <>
                <View style={styles.guidelineBanner}>
                  <MaterialIcons name="check_circle" size={48} color="#4CAF50" />
                  <Text style={styles.detailRuleTitle}>
                    {selectedGuideline.title}
                  </Text>
                  <Text style={styles.detailText}>
                    {selectedGuideline.content}
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Tips & Advice</Text>
                  {selectedGuideline.tips.map((tip, index) => (
                    <View key={index} style={styles.detailPoint}>
                      <View style={styles.detailPointBullet}>
                        <MaterialIcons
                          name="check"
                          size={16}
                          color="#4CAF50"
                        />
                      </View>
                      <Text style={styles.detailPointText}>{tip}</Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  onPress={() => setShowGuidelineDetail(false)}
                  style={({ pressed }) => [
                    styles.closeButton,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={styles.closeButtonText}>Got It</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Alert Detail Modal */}
      <Modal
        visible={showAlertDetail && selectedAlert !== null}
        animationType="slide"
        transparent={false}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAlertDetail(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </Pressable>
            <Text style={styles.modalTitle}>Alert Details</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedAlert && (
              <>
                <View
                  style={[
                    styles.detailSeverityBanner,
                    {
                      backgroundColor:
                        getSeverityColor(selectedAlert.severity) + '20',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.detailSeverityBadge,
                      {
                        backgroundColor: getSeverityColor(
                          selectedAlert.severity
                        ),
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={getSeverityIcon(selectedAlert.severity)}
                      size={24}
                      color="white"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailRuleTitle}>
                      {selectedAlert.title}
                    </Text>
                    <Text style={styles.detailCategory}>
                      {selectedAlert.type.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailText}>{selectedAlert.message}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Alert Time</Text>
                  <Text style={styles.detailText}>
                    {formatDateTimeSafely(selectedAlert.timestamp)}
                  </Text>
                </View>

                {!selectedAlert.acknowledged && (
                  <Pressable
                    onPress={() => {
                      handleAcknowledgeAlert(selectedAlert.id);
                      setShowAlertDetail(false);
                    }}
                    style={({ pressed }) => [
                      styles.acknowledgeModalButton,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={styles.acknowledgeModalButtonText}>
                      Acknowledge Alert
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => setShowAlertDetail(false)}
                  style={({ pressed }) => [
                    styles.closeButton,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={styles.closeButtonText}>Close</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#757575',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#757575',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#2196F3',
  },
  tabText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#757575',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#2196F3',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  acknowledgeAllButton: {
    flexDirection: 'row',
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acknowledgeAllText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 14,
  },
  alertCard: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  severityBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  severityBadgeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  alertTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: '#FF5252',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  alertMessage: {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
    lineHeight: 18,
  },
  acknowledgeButton: {
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  acknowledgeButtonText: {
    color: '#FF9800',
    fontWeight: '600',
    fontSize: 12,
  },
  ruleCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ruleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  ruleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  ruleCategory: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  ruleDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 8,
  },
  tapIndicator: {
    alignItems: 'flex-end',
  },
  guidelineCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  guidelineHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  guidelineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  guidelineContent: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  tipPreview: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 8,
  },
  tipsCount: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalContent: {
    padding: 16,
  },
  detailSeverityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  detailSeverityBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailRuleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  detailCategory: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  detailPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailPointBullet: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  bulletText: {
    fontSize: 16,
    color: '#F44336',
  },
  detailPointText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  guidelineBanner: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  acknowledgeModalButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  acknowledgeModalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
});
