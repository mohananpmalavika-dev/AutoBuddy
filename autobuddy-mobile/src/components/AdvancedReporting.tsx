import React, { useState, useMemo } from 'react';
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
import {
  useOperatorReports,
  OperatorReport,
} from '../hooks/useOperatorDashboard';

interface AdvancedReportingProps {
  token: string | null;
  role: 'operator' | 'admin';
}

type ReportType = 'summary' | 'detailed' | 'driver_performance' | 'financial';
type ExportFormat = 'pdf' | 'csv' | 'xlsx';

export const AdvancedReporting: React.FC<AdvancedReportingProps> = ({
  token,
  role,
}) => {
  const { reports, loading, generateReport, downloadReport } = useOperatorReports(token);

  const [selectedPeriod, setSelectedPeriod] = useState<string>('this_week');
  const [selectedType, setSelectedType] = useState<ReportType>('summary');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<OperatorReport | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    minRating: '0',
    minRides: '0',
  });

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      await generateReport(selectedPeriod);
      Alert.alert('Success', 'Report generated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleExport = async (report: OperatorReport) => {
    try {
      await downloadReport(report.id);
      Alert.alert('Success', `Report exported as ${exportFormat.toUpperCase()}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to export report');
    }
  };

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (filters.minRating && report.avgRating < parseFloat(filters.minRating)) {
        return false;
      }
      if (filters.minRides && report.totalRides < parseFloat(filters.minRides)) {
        return false;
      }
      return true;
    });
  }, [reports, filters]);

  const reportStats = useMemo(() => {
    if (filteredReports.length === 0) return null;
    return {
      totalReports: filteredReports.length,
      avgProfit: filteredReports.reduce((sum, r) => sum + r.profit, 0) / filteredReports.length,
      totalEarnings: filteredReports.reduce((sum, r) => sum + r.totalEarnings, 0),
      avgRating: filteredReports.reduce((sum, r) => sum + r.avgRating, 0) / filteredReports.length,
    };
  }, [filteredReports]);

  return (
    <View style={styles.container}>
      {/* Report Generator */}
      <View style={styles.generatorCard}>
        <Text style={styles.cardTitle}>Generate Report</Text>

        {/* Period Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Period</Text>
          <View style={styles.periodOptions}>
            {[
              { label: 'Today', value: 'today' },
              { label: 'This Week', value: 'this_week' },
              { label: 'This Month', value: 'this_month' },
              { label: 'Custom', value: 'custom' },
            ].map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.periodOption,
                  selectedPeriod === option.value && styles.periodOptionActive,
                ]}
                onPress={() => setSelectedPeriod(option.value)}
              >
                <Text
                  style={[
                    styles.periodOptionText,
                    selectedPeriod === option.value && styles.periodOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Report Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Report Type</Text>
          <View style={styles.typeGrid}>
            {[
              { label: 'Summary', value: 'summary' as ReportType },
              { label: 'Detailed', value: 'detailed' as ReportType },
              { label: 'Performance', value: 'driver_performance' as ReportType },
              { label: 'Financial', value: 'financial' as ReportType },
            ].map((type) => (
              <Pressable
                key={type.value}
                style={[
                  styles.typeCard,
                  selectedType === type.value && styles.typeCardActive,
                ]}
                onPress={() => setSelectedType(type.value)}
              >
                <MaterialIcons
                  name={getReportTypeIcon(type.value)}
                  size={20}
                  color={selectedType === type.value ? '#fff' : '#2196F3'}
                />
                <Text
                  style={[
                    styles.typeLabel,
                    selectedType === type.value && styles.typeLabelActive,
                  ]}
                >
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Export Format */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Export Format</Text>
          <View style={styles.formatOptions}>
            {(['pdf', 'csv', 'xlsx'] as const).map((format) => (
              <Pressable
                key={format}
                style={[
                  styles.formatOption,
                  exportFormat === format && styles.formatOptionActive,
                ]}
                onPress={() => setExportFormat(format)}
              >
                <MaterialIcons
                  name={getFormatIcon(format)}
                  size={18}
                  color={exportFormat === format ? '#2196F3' : '#666'}
                />
                <Text
                  style={[
                    styles.formatOptionText,
                    exportFormat === format && styles.formatOptionTextActive,
                  ]}
                >
                  {format.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Filter Button */}
        <Pressable
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
        >
          <MaterialIcons name="tune" size={18} color="#2196F3" />
          <Text style={styles.filterButtonText}>Advanced Filters</Text>
        </Pressable>

        {/* Generate Button */}
        <Pressable
          style={styles.generateButton}
          onPress={handleGenerateReport}
          disabled={generatingReport}
        >
          {generatingReport ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="cloud-download" size={18} color="#fff" />
              <Text style={styles.generateButtonText}>Generate Report</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Reports Summary */}
      {reportStats && (
        <View style={styles.summaryCard}>
          <Text style={styles.cardTitle}>Report Summary</Text>
          <View style={styles.summaryGrid}>
            <SummaryItem
              label="Total Reports"
              value={reportStats.totalReports}
              color="#2196F3"
            />
            <SummaryItem
              label="Avg Profit"
              value={`₹${reportStats.avgProfit.toFixed(0)}`}
              color="#4CAF50"
            />
            <SummaryItem
              label="Total Earnings"
              value={`₹${reportStats.totalEarnings}`}
              color="#FFB800"
            />
            <SummaryItem
              label="Avg Rating"
              value={reportStats.avgRating.toFixed(1)}
              color="#FF9800"
            />
          </View>
        </View>
      )}

      {/* Reports List */}
      <View style={styles.reportsSection}>
        <View style={styles.reportsHeader}>
          <Text style={styles.cardTitle}>Recent Reports</Text>
          <Pressable onPress={() => setShowFilterModal(true)}>
            <MaterialIcons name="filter-list" size={20} color="#2196F3" />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#2196F3" />
        ) : filteredReports.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="assessment" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No reports available</Text>
          </View>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={filteredReports}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ReportCard
                report={item}
                onExport={handleExport}
                onSelect={() => setSelectedReport(item)}
              />
            )}
          />
        )}
      </View>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.filterModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Advanced Filters</Text>
              <Pressable onPress={() => setShowFilterModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <ScrollView style={styles.filterContent}>
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Minimum Rating</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="0.0"
                  value={filters.minRating}
                  onChangeText={(text) =>
                    setFilters({ ...filters, minRating: text })
                  }
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Minimum Rides</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="0"
                  value={filters.minRides}
                  onChangeText={(text) =>
                    setFilters({ ...filters, minRides: text })
                  }
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.filterActions}>
                <Pressable
                  style={styles.filterResetButton}
                  onPress={() =>
                    setFilters({ minRating: '0', minRides: '0' })
                  }
                >
                  <Text style={styles.filterResetButtonText}>Reset</Text>
                </Pressable>

                <Pressable
                  style={styles.filterApplyButton}
                  onPress={() => setShowFilterModal(false)}
                >
                  <Text style={styles.filterApplyButtonText}>Apply</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Report Detail Modal */}
      {selectedReport && (
        <Modal
          visible={!!selectedReport}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setSelectedReport(null)}
        >
          <ReportDetailView
            report={selectedReport}
            onClose={() => setSelectedReport(null)}
            onExport={() => handleExport(selectedReport)}
          />
        </Modal>
      )}
    </View>
  );
};

interface ReportCardProps {
  report: OperatorReport;
  onExport: (report: OperatorReport) => Promise<void>;
  onSelect: () => void;
}

const ReportCard: React.FC<ReportCardProps> = ({ report, onExport, onSelect }) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(report);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Pressable style={styles.reportCard} onPress={onSelect}>
      <View style={styles.reportCardContent}>
        <View style={styles.reportCardHeader}>
          <View>
            <Text style={styles.reportCardTitle}>{report.period}</Text>
            <Text style={styles.reportCardDate}>
              {new Date(report.generatedAt).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.reportCardMeta}>
            <MetaItem label="Rides" value={report.totalRides} />
            <MetaItem label="Rating" value={report.avgRating.toFixed(1)} />
          </View>
        </View>

        <View style={styles.reportCardStats}>
          <StatRow
            label="Revenue"
            value={`₹${report.totalEarnings}`}
            color="#4CAF50"
          />
          <StatRow
            label="Costs"
            value={`₹${report.totalCosts}`}
            color="#F44336"
          />
          <StatRow
            label="Profit"
            value={`₹${report.profit}`}
            color="#2196F3"
          />
        </View>
      </View>

      <Pressable
        style={styles.exportIconButton}
        onPress={handleExport}
        disabled={exporting}
      >
        <MaterialIcons
          name="download"
          size={20}
          color={exporting ? '#ccc' : '#2196F3'}
        />
      </Pressable>
    </Pressable>
  );
};

interface ReportDetailViewProps {
  report: OperatorReport;
  onClose: () => void;
  onExport: () => Promise<void>;
}

const ReportDetailView: React.FC<ReportDetailViewProps> = ({
  report,
  onClose,
  onExport,
}) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView style={styles.detailView}>
      <View style={styles.detailHeader}>
        <Pressable onPress={onClose}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </Pressable>
        <Text style={styles.detailTitle}>{report.period}</Text>
        <Pressable onPress={handleExport} disabled={exporting}>
          <MaterialIcons
            name="download"
            size={24}
            color={exporting ? '#ccc' : '#2196F3'}
          />
        </Pressable>
      </View>

      <View style={styles.detailContent}>
        <DetailSection title="Period Information">
          <DetailRow label="Generated" value={new Date(report.generatedAt).toLocaleString()} />
          <DetailRow label="Period" value={report.period} />
        </DetailSection>

        <DetailSection title="Key Metrics">
          <DetailRow label="Total Rides" value={report.totalRides.toString()} />
          <DetailRow label="Avg Rating" value={report.avgRating.toFixed(1)} />
          <DetailRow label="Total Earnings" value={`₹${report.totalEarnings}`} />
        </DetailSection>

        <DetailSection title="Financial Summary">
          <DetailRow label="Revenue" value={`₹${report.totalEarnings}`} color="#4CAF50" />
          <DetailRow label="Costs" value={`₹${report.totalCosts}`} color="#F44336" />
          <DetailRow label="Profit" value={`₹${report.profit}`} color="#2196F3" />
        </DetailSection>

        {report.topDriver && (
          <DetailSection title="Performance">
            <DetailRow label="Top Driver" value={report.topDriver} />
            {report.bottomDriver && (
              <DetailRow label="Needs Attention" value={report.bottomDriver} />
            )}
          </DetailSection>
        )}
      </View>
    </ScrollView>
  );
};

const DetailSection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <View style={styles.detailSection}>
    <Text style={styles.detailSectionTitle}>{title}</Text>
    {children}
  </View>
);

interface DetailRowProps {
  label: string;
  value: string;
  color?: string;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, color }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailRowLabel}>{label}</Text>
    <Text style={[styles.detailRowValue, color && { color }]}>{value}</Text>
  </View>
);

interface SummaryItemProps {
  label: string;
  value: string | number;
  color: string;
}

const SummaryItem: React.FC<SummaryItemProps> = ({ label, value, color }) => (
  <View style={styles.summaryItem}>
    <View style={[styles.summaryIcon, { backgroundColor: `${color}20` }]}>
      <MaterialIcons name="info" size={18} color={color} />
    </View>
    <Text style={styles.summaryItemLabel}>{label}</Text>
    <Text style={styles.summaryItemValue}>{value}</Text>
  </View>
);

interface MetaItemProps {
  label: string;
  value: string | number;
}

const MetaItem: React.FC<MetaItemProps> = ({ label, value }) => (
  <View style={styles.metaItem}>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue}>{value}</Text>
  </View>
);

interface StatRowProps {
  label: string;
  value: string;
  color: string;
}

const StatRow: React.FC<StatRowProps> = ({ label, value, color }) => (
  <View style={styles.statRow}>
    <View style={[styles.statDot, { backgroundColor: color }]} />
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const getReportTypeIcon = (type: ReportType): any => {
  switch (type) {
    case 'summary':
      return 'dashboard';
    case 'detailed':
      return 'assessment';
    case 'driver_performance':
      return 'trending-up';
    case 'financial':
      return 'attach-money';
    default:
      return 'assessment';
  }
};

const getFormatIcon = (format: ExportFormat): any => {
  switch (format) {
    case 'pdf':
      return 'picture-as-pdf';
    case 'csv':
      return 'table-chart';
    case 'xlsx':
      return 'grid-on';
    default:
      return 'file-download';
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  generatorCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  periodOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  periodOptionActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  periodOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  periodOptionTextActive: {
    color: '#fff',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeCard: {
    width: '48%',
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    gap: 6,
  },
  typeCardActive: {
    backgroundColor: '#2196F3',
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2196F3',
  },
  typeLabelActive: {
    color: '#fff',
  },
  formatOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  formatOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  formatOptionActive: {
    backgroundColor: '#2196F320',
    borderColor: '#2196F3',
  },
  formatOptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  formatOptionTextActive: {
    color: '#2196F3',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginBottom: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
  },
  generateButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  summaryCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryItem: {
    width: '48%',
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItemLabel: {
    fontSize: 11,
    color: '#666',
  },
  summaryItemValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  reportsSection: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  reportsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  reportCardContent: {
    flex: 1,
  },
  reportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reportCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  reportCardDate: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  reportCardMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 10,
    color: '#666',
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  reportCardStats: {
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    flex: 1,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
  },
  exportIconButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  filterModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  filterContent: {
    paddingHorizontal: 16,
  },
  filterGroup: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#000',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 16,
  },
  filterResetButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  filterResetButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterApplyButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#2196F3',
    alignItems: 'center',
  },
  filterApplyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  detailView: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  detailContent: {
    padding: 16,
  },
  detailSection: {
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  detailRowLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailRowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
});

export default AdvancedReporting;
