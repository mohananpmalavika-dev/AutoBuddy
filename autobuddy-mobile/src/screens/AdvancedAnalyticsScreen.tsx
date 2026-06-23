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
import { useAdvancedAnalytics } from '../hooks/useAdvancedAnalytics';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

const formatDateTimeSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : 'Unknown';
};

interface AdvancedAnalyticsScreenProps {
  token: string | null;
  userId: string;
}

export const AdvancedAnalyticsScreen: React.FC<
  AdvancedAnalyticsScreenProps
> = ({ token, userId }) => {
  const {
    reports,
    metrics,
    loading,
    error,
    fetchReports,
    generateReport,
    deleteReport,
    exportReport,
    getMetricsForPeriod,
    scheduleReportGeneration,
  } = useAdvancedAnalytics(token);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'reports' | 'metrics'>('reports');
  const [reportDetailsModal, setReportDetailsModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [generateModal, setGenerateModal] = useState(false);
  const [reportType, setReportType] = useState('ride');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchReports(userId);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    await getMetricsForPeriod(startDate, new Date());
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleGenerateReport = async () => {
    if (!dateRange.start || !dateRange.end) {
      Alert.alert('Error', 'Please select both start and end dates');
      return;
    }
    const success = await generateReport(
      reportType,
      new Date(dateRange.start),
      new Date(dateRange.end),
      'detailed'
    );
    if (success) {
      Alert.alert('Success', 'Report generated successfully');
      setGenerateModal(false);
      setDateRange({ start: '', end: '' });
      await loadData();
    }
  };

  const handleDeleteReport = (reportId: string) => {
    Alert.alert('Delete Report', 'Are you sure you want to delete this report?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const success = await deleteReport(reportId);
          if (success) {
            Alert.alert('Success', 'Report deleted');
            await loadData();
          }
        },
      },
    ]);
  };

  const handleExportReport = async (reportId: string, format: 'pdf' | 'csv' | 'xlsx') => {
    const blob = await exportReport(reportId, format);
    if (blob) {
      Alert.alert('Success', `Report exported as ${format.toUpperCase()}`);
    }
  };

  const handleScheduleReport = async () => {
    const success = await scheduleReportGeneration(reportType, 'weekly');
    if (success) {
      Alert.alert('Success', 'Report scheduled for weekly generation');
    }
  };

  if (loading && !reports.length) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TabButton
          label="Reports"
          active={activeTab === 'reports'}
          onPress={() => setActiveTab('reports')}
        />
        <TabButton
          label="Metrics"
          active={activeTab === 'metrics'}
          onPress={() => setActiveTab('metrics')}
        />
      </View>

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>Analytics Reports</Text>
            <Pressable
              style={styles.actionButton}
              onPress={() => setGenerateModal(true)}
            >
              <MaterialIcons name="add" size={20} color="#2196F3" />
            </Pressable>
          </View>

          {reports.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="assessment" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No reports generated yet</Text>
            </View>
          ) : (
            reports.map((report) => (
              <Pressable
                key={report.id}
                style={styles.reportCard}
                onPress={() => {
                  setSelectedReport(report);
                  setReportDetailsModal(true);
                }}
              >
                <View style={styles.reportHeader}>
                  <View>
                    <Text style={styles.reportTitle}>{report.title}</Text>
                    <Text style={styles.reportType}>{report.type}</Text>
                  </View>
                  <Text style={styles.reportDate}>
                    {formatDateSafely(report.generatedAt)}
                  </Text>
                </View>
                <Text style={styles.reportDescription}>{report.description}</Text>
                <View style={styles.reportActions}>
                  <Pressable
                    style={styles.reportActionBtn}
                    onPress={() => {
                      setSelectedReport(report);
                      setReportDetailsModal(true);
                    }}
                  >
                    <MaterialIcons name="visibility" size={16} color="#2196F3" />
                    <Text style={styles.reportActionText}>View</Text>
                  </Pressable>
                  <Pressable
                    style={styles.reportActionBtn}
                    onPress={() => handleExportReport(report.id, 'pdf')}
                  >
                    <MaterialIcons name="download" size={16} color="#4CAF50" />
                    <Text style={styles.reportActionText}>Export</Text>
                  </Pressable>
                  <Pressable
                    style={styles.reportActionBtn}
                    onPress={() => handleDeleteReport(report.id)}
                  >
                    <MaterialIcons name="delete" size={16} color="#F44336" />
                    <Text style={styles.reportActionText}>Delete</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance Metrics</Text>
          {metrics.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="show-chart" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No metrics available</Text>
            </View>
          ) : (
            metrics.map((metric, idx) => (
              <View key={idx} style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricName}>{metric.name}</Text>
                  <Text
                    style={[
                      styles.metricTrend,
                      metric.trend >= 0
                        ? styles.trendUp
                        : styles.trendDown,
                    ]}
                  >
                    {metric.trend >= 0 ? '↑' : '↓'} {Math.abs(metric.trend)}%
                  </Text>
                </View>
                <View style={styles.metricValue}>
                  <Text style={styles.value}>{metric.value}</Text>
                  <Text style={styles.comparison}>{metric.comparison}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      <View style={{ height: 20 }} />

      {/* Generate Report Modal */}
      <Modal
        visible={generateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setGenerateModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Generate New Report</Text>
              <Pressable onPress={() => setGenerateModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Report Type</Text>
              <View style={styles.typeOptions}>
                {(['ride', 'revenue', 'performance', 'custom'] as const).map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.typeOption,
                      reportType === type && styles.typeOptionActive,
                    ]}
                    onPress={() => setReportType(type)}
                  >
                    <Text
                      style={[
                        styles.typeOptionText,
                        reportType === type && styles.typeOptionTextActive,
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.formLabel}>Start Date</Text>
              <Pressable style={styles.dateInput}>
                <Text style={styles.dateInputText}>{dateRange.start || 'Select start date'}</Text>
                <MaterialIcons name="calendar-today" size={20} color="#2196F3" />
              </Pressable>

              <Text style={styles.formLabel}>End Date</Text>
              <Pressable style={styles.dateInput}>
                <Text style={styles.dateInputText}>{dateRange.end || 'Select end date'}</Text>
                <MaterialIcons name="calendar-today" size={20} color="#2196F3" />
              </Pressable>

              <View style={styles.buttonGroup}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={handleGenerateReport}
                >
                  <Text style={styles.primaryButtonText}>Generate Report</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleScheduleReport}
                >
                  <Text style={styles.secondaryButtonText}>Schedule Weekly</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Report Details Modal */}
      <Modal
        visible={reportDetailsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setReportDetailsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Details</Text>
              <Pressable onPress={() => setReportDetailsModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            {selectedReport && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Title</Text>
                  <Text style={styles.detailValue}>{selectedReport.title}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type</Text>
                  <Text style={styles.detailValue}>{selectedReport.type}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Generated</Text>
                  <Text style={styles.detailValue}>
                    {formatDateTimeSafely(selectedReport.generatedAt)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Description</Text>
                  <Text style={styles.detailValue}>{selectedReport.description}</Text>
                </View>

                <Text style={styles.metricsTitle}>Metrics</Text>
                {Object.entries(selectedReport.metrics).map(([key, value], idx) => (
                  <View key={idx} style={styles.metricEntry}>
                    <Text style={styles.metricLabel}>{key}</Text>
                    <Text style={styles.metricVal}>{String(value)}</Text>
                  </View>
                ))}

                <View style={styles.exportGroup}>
                  {(['pdf', 'csv', 'xlsx'] as const).map((format) => (
                    <Pressable
                      key={format}
                      style={styles.exportButton}
                      onPress={() => handleExportReport(selectedReport.id, format)}
                    >
                      <MaterialIcons name="download" size={16} color="#fff" />
                      <Text style={styles.exportButtonText}>{format.toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const TabButton: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => {
  return (
    <Pressable
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.tabButtonText,
          active && styles.tabButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomColor: '#2196F3',
  },
  tabButtonText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#2196F3',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  reportType: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  reportDate: {
    fontSize: 11,
    color: '#999',
  },
  reportDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  reportActions: {
    flexDirection: 'row',
    gap: 8,
  },
  reportActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    gap: 4,
  },
  reportActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  metricCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  metricTrend: {
    fontSize: 12,
    fontWeight: '600',
  },
  trendUp: {
    color: '#4CAF50',
  },
  trendDown: {
    color: '#F44336',
  },
  metricValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  comparison: {
    fontSize: 11,
    color: '#999',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    paddingVertical: 12,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    marginTop: 12,
  },
  typeOptions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  typeOption: {
    flex: 1,
    minWidth: '48%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  typeOptionActive: {
    backgroundColor: '#2196F3',
  },
  typeOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  typeOptionTextActive: {
    color: '#fff',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 12,
  },
  dateInputText: {
    fontSize: 13,
    color: '#666',
  },
  buttonGroup: {
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2196F3',
  },
  detailRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  metricsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 12,
    marginBottom: 8,
  },
  metricEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
  },
  metricVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  exportGroup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});

export default AdvancedAnalyticsScreen;
