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
import { useRideReceipts } from '../hooks/useRideReceipts';

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

interface RideReceiptsScreenProps {
  token: string | null;
  userId: string;
}

export const RideReceiptsScreen: React.FC<RideReceiptsScreenProps> = ({
  token,
  userId,
}) => {
  const {
    rides,
    receipts,
    taxSummary,
    loading,
    error,
    fetchRides,
    generateReceipt,
    generateTaxInvoice,
    downloadReceipt,
    emailReceipt,
    getTaxSummary,
    generateTaxReport,
    getReceiptsByRide,
    bulkGenerateReceipts,
  } = useRideReceipts(token, userId);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'rides' | 'receipts' | 'tax'>('rides');
  const [rideDetailsModal, setRideDetailsModal] = useState(false);
  const [selectedRide, setSelectedRide] = useState<any>(null);
  const [emailModal, setEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    await fetchRides(userId, startDate, new Date());

    const taxStart = new Date();
    taxStart.setMonth(0);
    await getTaxSummary(taxStart, new Date());
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleGenerateReceipt = async (rideId: string, format: 'pdf' | 'html' | 'email') => {
    const success = await generateReceipt(rideId, format);
    if (success) {
      Alert.alert('Success', `Receipt generated as ${format.toUpperCase()}`);
      await loadData();
    }
  };

  const handleDownloadReceipt = async (receiptId: string) => {
    const blob = await downloadReceipt(receiptId);
    if (blob) {
      Alert.alert('Success', 'Receipt downloaded');
    }
  };

  const handleEmailReceipt = async (receiptId: string) => {
    if (!emailAddress) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }
    const success = await emailReceipt(receiptId, emailAddress);
    if (success) {
      Alert.alert('Success', 'Receipt sent to email');
      setEmailModal(false);
      setEmailAddress('');
    }
  };

  const handleGenerateTaxReport = async () => {
    const success = await generateTaxReport(new Date().getFullYear());
    if (success) {
      Alert.alert('Success', 'Tax report generated');
    }
  };

  const handleBulkGenerate = async () => {
    if (rides.length === 0) {
      Alert.alert('Error', 'No rides available');
      return;
    }
    const rideIds = rides.map((r) => r.id);
    const success = await bulkGenerateReceipts(rideIds);
    if (success) {
      Alert.alert('Success', 'All receipts generated');
      await loadData();
    }
  };

  if (loading && !rides.length) {
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
          label="Rides"
          active={activeTab === 'rides'}
          onPress={() => setActiveTab('rides')}
        />
        <TabButton
          label="Receipts"
          active={activeTab === 'receipts'}
          onPress={() => setActiveTab('receipts')}
        />
        <TabButton
          label="Tax"
          active={activeTab === 'tax'}
          onPress={() => setActiveTab('tax')}
        />
      </View>

      {/* Rides Tab */}
      {activeTab === 'rides' && (
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>Recent Rides</Text>
            <Pressable style={styles.actionButton} onPress={handleBulkGenerate}>
              <MaterialIcons name="file-present" size={20} color="#2196F3" />
            </Pressable>
          </View>

          {rides.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="directions-car" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No rides found</Text>
            </View>
          ) : (
            rides.map((ride) => (
              <Pressable
                key={ride.id}
                style={styles.rideCard}
                onPress={() => {
                  setSelectedRide(ride);
                  setRideDetailsModal(true);
                }}
              >
                <View style={styles.rideHeader}>
                  <View style={styles.routeInfo}>
                    <Text style={styles.location}>{ride.pickupLocation}</Text>
                    <View style={styles.divider}>
                      <View style={styles.dot} />
                      <View style={styles.line} />
                      <View style={styles.dot} />
                    </View>
                    <Text style={styles.location}>{ride.dropoffLocation}</Text>
                  </View>
                  <View style={styles.priceTag}>
                    <Text style={styles.price}>${ride.totalAmount.toFixed(2)}</Text>
                  </View>
                </View>
                <View style={styles.rideDetails}>
                  <DetailItem
                    icon="schedule"
                    label="Date"
                    value={new Date(ride.date).toLocaleDateString()}
                  />
                  <DetailItem
                    icon="timeline"
                    label="Duration"
                    value={`${ride.duration} min`}
                  />
                  <DetailItem
                    icon="straighten"
                    label="Distance"
                    value={`${ride.distance} km`}
                  />
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* Receipts Tab */}
      {activeTab === 'receipts' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Generated Receipts</Text>

          {receipts.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="receipt" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No receipts generated yet</Text>
            </View>
          ) : (
            receipts.map((receipt) => (
              <View key={receipt.id} style={styles.receiptCard}>
                <View style={styles.receiptHeader}>
                  <View>
                    <Text style={styles.receiptType}>{receipt.type}</Text>
                    <Text style={styles.receiptId}>ID: {receipt.id.substring(0, 8)}</Text>
                  </View>
                  <View style={styles.receiptFormat}>
                    <Text style={styles.formatBadge}>{receipt.format.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={styles.receiptActions}>
                  <Pressable
                    style={styles.receiptActionBtn}
                    onPress={() => handleDownloadReceipt(receipt.id)}
                  >
                    <MaterialIcons name="download" size={16} color="#4CAF50" />
                    <Text style={styles.receiptActionText}>Download</Text>
                  </Pressable>
                  <Pressable
                    style={styles.receiptActionBtn}
                    onPress={() => {
                      setSelectedRide(receipt);
                      setEmailModal(true);
                    }}
                  >
                    <MaterialIcons name="email" size={16} color="#2196F3" />
                    <Text style={styles.receiptActionText}>Email</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Tax Tab */}
      {activeTab === 'tax' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tax Summary</Text>

          {taxSummary && (
            <>
              <View style={styles.taxCard}>
                <View style={styles.taxStat}>
                  <Text style={styles.taxLabel}>Total Income</Text>
                  <Text style={styles.taxValue}>${taxSummary.totalIncome.toFixed(2)}</Text>
                </View>
                <View style={styles.taxStatDivider} />
                <View style={styles.taxStat}>
                  <Text style={styles.taxLabel}>Total Tax</Text>
                  <Text style={styles.taxValue}>${taxSummary.totalTax.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.taxDetailsGrid}>
                <TaxDetailCard
                  label="Deductible Expenses"
                  value={`$${taxSummary.deductibleExpenses.toFixed(2)}`}
                  icon="receipt-long"
                />
                <TaxDetailCard
                  label="Net Income"
                  value={`$${taxSummary.netIncome.toFixed(2)}`}
                  icon="trending-up"
                />
                <TaxDetailCard
                  label="Tax Rate"
                  value={`${(taxSummary.taxRate * 100).toFixed(1)}%`}
                  icon="percent"
                />
                <TaxDetailCard
                  label="Receipts Count"
                  value={`${taxSummary.receiptsCount}`}
                  icon="document-scanner"
                />
              </View>

              <Pressable
                style={styles.generateTaxButton}
                onPress={handleGenerateTaxReport}
              >
                <MaterialIcons name="download" size={20} color="#fff" />
                <Text style={styles.generateTaxButtonText}>Generate Tax Report</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <View style={{ height: 20 }} />

      {/* Ride Details Modal */}
      <Modal
        visible={rideDetailsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setRideDetailsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ride Details</Text>
              <Pressable onPress={() => setRideDetailsModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            {selectedRide && (
              <ScrollView style={styles.modalBody}>
                <DetailRow label="From" value={selectedRide.pickupLocation} />
                <DetailRow label="To" value={selectedRide.dropoffLocation} />
                <DetailRow
                  label="Date"
                  value={new Date(selectedRide.date).toLocaleString()}
                />
                <DetailRow label="Distance" value={`${selectedRide.distance} km`} />
                <DetailRow label="Duration" value={`${selectedRide.duration} min`} />

                <View style={styles.fareBreakdown}>
                  <Text style={styles.breakdownTitle}>Fare Breakdown</Text>
                  <DetailRow label="Base Fare" value={`$${selectedRide.baseFare.toFixed(2)}`} />
                  <DetailRow label="Discount" value={`-$${selectedRide.discount.toFixed(2)}`} />
                  <DetailRow label="Tax" value={`$${selectedRide.tax.toFixed(2)}`} />
                  <DetailRow
                    label="Total"
                    value={`$${selectedRide.totalAmount.toFixed(2)}`}
                    highlight
                  />
                </View>

                <View style={styles.actionButtons}>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => handleGenerateReceipt(selectedRide.id, 'pdf')}
                  >
                    <MaterialIcons name="picture-as-pdf" size={18} color="#F44336" />
                    <Text style={styles.actionBtnText}>PDF</Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => handleGenerateReceipt(selectedRide.id, 'html')}
                  >
                    <MaterialIcons name="language" size={18} color="#2196F3" />
                    <Text style={styles.actionBtnText}>HTML</Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => handleGenerateReceipt(selectedRide.id, 'email')}
                  >
                    <MaterialIcons name="email" size={18} color="#4CAF50" />
                    <Text style={styles.actionBtnText}>Email</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Email Modal */}
      <Modal
        visible={emailModal}
        animationType="slide"
        transparent
        onRequestClose={() => setEmailModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Email Receipt</Text>
              <Pressable onPress={() => setEmailModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.formLabel}>Email Address</Text>
              <View style={styles.emailInput}>
                <MaterialIcons name="email" size={20} color="#999" />
                <Text style={styles.emailPlaceholder}>{emailAddress || 'Enter email'}</Text>
              </View>

              <Pressable
                style={styles.primaryButton}
                onPress={() =>
                  handleEmailReceipt(selectedRide?.id)
                }
              >
                <Text style={styles.primaryButtonText}>Send Receipt</Text>
              </Pressable>
            </View>
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

const DetailItem: React.FC<{
  icon: string;
  label: string;
  value: string;
}> = ({ icon, label, value }) => {
  return (
    <View style={styles.detailItem}>
      <MaterialIcons name={icon as any} size={16} color="#2196F3" />
      <View style={styles.detailItemText}>
        <Text style={styles.detailItemLabel}>{label}</Text>
        <Text style={styles.detailItemValue}>{value}</Text>
      </View>
    </View>
  );
};

const TaxDetailCard: React.FC<{
  label: string;
  value: string;
  icon: string;
}> = ({ label, value, icon }) => {
  return (
    <View style={styles.taxDetailCard}>
      <MaterialIcons name={icon as any} size={24} color="#2196F3" />
      <Text style={styles.taxDetailLabel}>{label}</Text>
      <Text style={styles.taxDetailValue}>{value}</Text>
    </View>
  );
};

const DetailRow: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
}> = ({ label, value, highlight }) => {
  return (
    <View
      style={[
        styles.detailRowContainer,
        highlight && styles.detailRowHighlight,
      ]}
    >
      <Text style={highlight ? styles.detailRowLabelBold : styles.detailRowLabel}>
        {label}
      </Text>
      <Text style={highlight ? styles.detailRowValueBold : styles.detailRowValue}>
        {value}
      </Text>
    </View>
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
    marginBottom: 12,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  routeInfo: {
    flex: 1,
  },
  location: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  divider: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2196F3',
  },
  line: {
    width: 2,
    height: 12,
    backgroundColor: '#2196F3',
    marginVertical: 2,
  },
  priceTag: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
  },
  rideDetails: {
    flexDirection: 'row',
    gap: 8,
  },
  detailItem: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  detailItemText: {
    flex: 1,
  },
  detailItemLabel: {
    fontSize: 10,
    color: '#999',
  },
  detailItemValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
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
  receiptCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  receiptType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  receiptId: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  receiptFormat: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  formatBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2196F3',
  },
  receiptActions: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    gap: 4,
  },
  receiptActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  taxCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taxStat: {
    flex: 1,
    alignItems: 'center',
  },
  taxLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  taxValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2196F3',
  },
  taxStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 12,
  },
  taxDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  taxDetailCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  taxDetailLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
  },
  taxDetailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  generateTaxButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 6,
  },
  generateTaxButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
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
  fareBreakdown: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  detailRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailRowHighlight: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderBottomWidth: 0,
  },
  detailRowLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailRowLabelBold: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  detailRowValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  detailRowValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  emailInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 12,
    gap: 8,
  },
  emailPlaceholder: {
    flex: 1,
    fontSize: 13,
    color: '#666',
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
});

export default RideReceiptsScreen;
