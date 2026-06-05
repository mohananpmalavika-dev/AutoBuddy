import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Alert, Linking } from 'react-native';
import { useTaxReporting } from '../hooks/useTaxReporting';
import { theme } from '../theme';

export function TaxReportWidget({ isVisible, onClose, token, driverId }) {
  const { taxReports, isLoading, generateTaxReport, loadTaxReportHistory, downloadTaxReport, calculateTaxSummary } = useTaxReporting({ token, driverId });
  const [reportType, setReportType] = useState('monthly');

  useEffect(() => {
    if (isVisible) {
      loadTaxReportHistory();
    }
  }, [isVisible, loadTaxReportHistory]);

  const handleGenerateReport = () => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    generateTaxReport(startDate.toISOString(), endDate.toISOString(), reportType);
    Alert.alert('Report Generated', 'Tax report has been created successfully');
  };

  const handleDownloadReport = async (reportId) => {
    const url = await downloadTaxReport(reportId);
    if (url) {
      await Linking.openURL(url);
    }
  };

  const taxSummary = calculateTaxSummary();

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Tax Reports</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.content}>
          {/* Tax Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>Tax Summary</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Earnings</Text>
                <Text style={styles.summaryValue}>Rs. {taxSummary.totalEarnings.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Tax Liability</Text>
                <Text style={[styles.summaryValue, { color: '#D32F2F' }]}>Rs. {taxSummary.totalTaxLiability.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Avg Tax Rate</Text>
                <Text style={styles.summaryValue}>{taxSummary.averageTaxRate}%</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Deductible</Text>
                <Text style={[styles.summaryValue, { color: '#4CAF50' }]}>Rs. {taxSummary.deductibleExpenses.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Generate Report */}
          <View style={styles.generateSection}>
            <Text style={styles.sectionTitle}>Generate Report</Text>
            <View style={styles.typeSelector}>
              {['monthly', 'quarterly', 'annual'].map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeButton, reportType === type && styles.typeButtonActive]}
                  onPress={() => setReportType(type)}
                >
                  <Text style={[styles.typeButtonText, reportType === type && styles.typeButtonTextActive]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.generateButton} onPress={handleGenerateReport} disabled={isLoading}>
              <Text style={styles.generateButtonText}>{isLoading ? 'Generating...' : 'Generate Report'}</Text>
            </TouchableOpacity>
          </View>

          {/* Report History */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Report History</Text>
            {taxReports.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No tax reports generated yet</Text>
              </View>
            ) : (
              taxReports.map((report, index) => (
                <View
                  key={index}
                  style={styles.reportCard}
                >
                  <View style={styles.reportHeader}>
                    <Text style={styles.reportPeriod}>{report.report_period}</Text>
                    <Text style={[styles.reportType, { color: report.is_verified ? '#4CAF50' : '#FF9800' }]}>
                      {report.is_verified ? '✓ Verified' : '⏳ Pending'}
                    </Text>
                  </View>
                  <View style={styles.reportDetails}>
                    <View style={styles.reportRow}>
                      <Text style={styles.reportLabel}>Gross Earnings:</Text>
                      <Text style={styles.reportValue}>Rs. {report.gross_earnings.toFixed(2)}</Text>
                    </View>
                    <View style={styles.reportRow}>
                      <Text style={styles.reportLabel}>Tax Liability:</Text>
                      <Text style={styles.reportValue}>Rs. {report.tax_liability.toFixed(2)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={() => handleDownloadReport(report.report_id)}
                  >
                    <Text style={styles.downloadButtonText}>Download JSON</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          {/* Tips */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>Tips</Text>
            <Text style={styles.tipsText}>Keep records of vehicle maintenance for deductions.</Text>
            <Text style={styles.tipsText}>Download JSON reports for tax filing records.</Text>
            <Text style={styles.tipsText}>Monthly reports help track earnings trends.</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.LIGHT_GRAY,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 14,
    color: theme.COLORS.PRIMARY,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    ...theme.SHADOWS.small,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: theme.COLORS.TEXT,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryItem: {
    width: '48%',
    backgroundColor: theme.COLORS.BACKGROUND,
    padding: 12,
    borderRadius: 6,
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.COLORS.PRIMARY,
  },
  generateSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: theme.COLORS.TEXT,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.COLORS.LIGHT_GRAY,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: theme.COLORS.PRIMARY,
    borderColor: theme.COLORS.PRIMARY,
  },
  typeButtonText: {
    fontSize: 12,
    color: theme.COLORS.TEXT,
    fontWeight: '500',
  },
  typeButtonTextActive: {
    color: 'white',
  },
  generateButton: {
    backgroundColor: theme.COLORS.PRIMARY,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  generateButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  historySection: {
    marginBottom: 20,
  },
  reportCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    ...theme.SHADOWS.small,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reportPeriod: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  reportType: {
    fontSize: 12,
    fontWeight: '500',
  },
  reportDetails: {
    marginBottom: 10,
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reportLabel: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  reportValue: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  downloadButton: {
    backgroundColor: theme.COLORS.BACKGROUND,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  downloadButtonText: {
    fontSize: 12,
    color: theme.COLORS.PRIMARY,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyText: {
    fontSize: 14,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  tipsCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFB800',
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
});
