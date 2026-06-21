import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useReceiptGeneration } from '../hooks/useReceiptGeneration';
import { ReceiptCard } from '../components/ReceiptCard';

interface ReceiptDetailScreenProps {
  token: string | null;
  userId: string;
  userType: 'passenger' | 'driver';
}

export const ReceiptDetailScreen: React.FC<ReceiptDetailScreenProps> = ({
  token,
  userId,
  userType,
}) => {
  const {
    receipts,
    loading,
    error,
    getReceiptHistory,
    downloadReceipt,
    emailReceipt,
    getReceiptStats,
    exportAllReceipts,
  } = useReceiptGeneration(token, userId);

  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [filterMonth, setFilterMonth] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const calculatedStats = getReceiptStats();
    setStats(calculatedStats);
  }, [receipts, getReceiptStats]);

  const handleDownloadReceipt = async () => {
    if (!selectedReceipt) return;

    try {
      const fileName = await downloadReceipt(selectedReceipt, {
        includeTaxInfo: true,
        format: 'receipt',
      });

      Alert.alert('Success', `Receipt downloaded as: ${fileName}`);
      setSelectedReceipt(null);
    } catch (err) {
      Alert.alert('Error', `Download failed: ${err}`);
    }
  };

  const handleEmailReceipt = async () => {
    if (!selectedReceipt) return;

    setEmailError('');

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailAddress.trim() || !emailRegex.test(emailAddress)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    try {
      setIsSending(true);
      await emailReceipt(selectedReceipt, emailAddress, {
        includeTaxInfo: true,
        format: 'receipt',
      });

      Alert.alert('Success', `Receipt sent to ${emailAddress}`);
      setShowEmailModal(false);
      setEmailAddress('');
      setSelectedReceipt(null);
    } catch (err) {
      Alert.alert('Error', `Email sending failed: ${err}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleExportReceipts = async () => {
    try {
      const fileName = await exportAllReceipts('csv');
      Alert.alert('Success', `All receipts exported as: ${fileName}`);
    } catch (err) {
      Alert.alert('Error', `Export failed: ${err}`);
    }
  };

  const handleDownloadTaxInvoice = async () => {
    if (!selectedReceipt) return;

    try {
      const fileName = await downloadReceipt(selectedReceipt, {
        includeTaxInfo: true,
        format: 'taxInvoice',
      });

      Alert.alert('Success', `Tax invoice downloaded as: ${fileName}`);
      setSelectedReceipt(null);
    } catch (err) {
      Alert.alert('Error', `Download failed: ${err}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (selectedReceipt) {
    return (
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Receipt Header */}
          <View style={styles.header}>
            <Pressable onPress={() => setSelectedReceipt(null)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </Pressable>
            <Text style={styles.headerTitle}>Receipt Details</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Receipt Content */}
          <View style={styles.receiptContainer}>
            <View style={styles.receiptHeader}>
              <Text style={styles.receiptId}>Receipt #{selectedReceipt.id}</Text>
              <View
                style={[
                  styles.receiptStatus,
                  {
                    backgroundColor:
                      selectedReceipt.status === 'completed'
                        ? '#E8F5E9'
                        : selectedReceipt.status === 'pending'
                          ? '#FFF3E0'
                          : '#FFEBEE',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.receiptStatusText,
                    {
                      color:
                        selectedReceipt.status === 'completed'
                          ? '#2E7D32'
                          : selectedReceipt.status === 'pending'
                            ? '#E65100'
                            : '#C62828',
                    },
                  ]}
                >
                  {selectedReceipt.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Ride Details */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ride Details</Text>
              <View style={styles.detailRow}>
                <Text style={styles.label}>Date & Time</Text>
                <Text style={styles.value}>
                  {new Date(selectedReceipt.date).toLocaleString()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.label}>Ride Type</Text>
                <Text style={styles.value}>
                  {selectedReceipt.rideType.charAt(0).toUpperCase() +
                    selectedReceipt.rideType.slice(1)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.label}>Distance</Text>
                <Text style={styles.value}>{selectedReceipt.distance} km</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.label}>Duration</Text>
                <Text style={styles.value}>{selectedReceipt.duration} mins</Text>
              </View>
            </View>

            {/* Locations */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Locations</Text>
              <View style={styles.locationBox}>
                <MaterialIcons name="location_on" size={20} color="#2196F3" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.locationLabel}>Pickup</Text>
                  <Text style={styles.locationValue}>
                    {selectedReceipt.pickupLocation}
                  </Text>
                </View>
              </View>
              <View style={styles.locationBox}>
                <MaterialIcons name="location_on" size={20} color="#FF6F00" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.locationLabel}>Dropoff</Text>
                  <Text style={styles.locationValue}>
                    {selectedReceipt.dropoffLocation}
                  </Text>
                </View>
              </View>
            </View>

            {/* Driver Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Driver Information</Text>
              <View style={styles.detailRow}>
                <Text style={styles.label}>Driver Name</Text>
                <Text style={styles.value}>{selectedReceipt.driverName}</Text>
              </View>
              {selectedReceipt.vehicleInfo && (
                <>
                  <View style={styles.detailRow}>
                    <Text style={styles.label}>Vehicle</Text>
                    <Text style={styles.value}>
                      {selectedReceipt.vehicleInfo.make}{' '}
                      {selectedReceipt.vehicleInfo.model}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.label}>License Plate</Text>
                    <Text style={styles.value}>
                      {selectedReceipt.vehicleInfo.licensePlate}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Fare Breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Fare Breakdown</Text>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Base Fare</Text>
                <Text style={styles.fareValue}>
                  ₹{selectedReceipt.baseFare.toFixed(2)}
                </Text>
              </View>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Taxes (5%)</Text>
                <Text style={styles.fareValue}>
                  ₹{selectedReceipt.taxes.toFixed(2)}
                </Text>
              </View>
              {selectedReceipt.discount > 0 && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Discount</Text>
                  <Text style={[styles.fareValue, { color: '#4CAF50' }]}>
                    -₹{selectedReceipt.discount.toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL FARE</Text>
                <Text style={styles.totalValue}>
                  ₹{selectedReceipt.totalFare.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Payment Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Information</Text>
              <View style={styles.detailRow}>
                <Text style={styles.label}>Payment Method</Text>
                <Text style={styles.value}>{selectedReceipt.paymentMethod}</Text>
              </View>
            </View>

            {/* Tax Info */}
            {selectedReceipt.taxNumber && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tax Information</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.label}>Tax Number</Text>
                  <Text style={styles.value}>{selectedReceipt.taxNumber}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.label}>GST Number</Text>
                  <Text style={styles.value}>{selectedReceipt.gstNumber}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionSection}>
            <Pressable
              style={styles.downloadButton}
              onPress={handleDownloadReceipt}
            >
              <MaterialIcons name="download" size={20} color="white" />
              <Text style={styles.downloadButtonText}>Download Receipt</Text>
            </Pressable>

            <Pressable
              style={[styles.downloadButton, { backgroundColor: '#FF9800' }]}
              onPress={handleDownloadTaxInvoice}
            >
              <MaterialIcons name="receipt" size={20} color="white" />
              <Text style={styles.downloadButtonText}>Tax Invoice</Text>
            </Pressable>

            <Pressable
              style={[styles.downloadButton, { backgroundColor: '#4CAF50' }]}
              onPress={() => setShowEmailModal(true)}
            >
              <MaterialIcons name="email" size={20} color="white" />
              <Text style={styles.downloadButtonText}>Email Receipt</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Email Modal */}
        <Modal
          visible={showEmailModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowEmailModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Email Receipt</Text>
                <Pressable onPress={() => setShowEmailModal(false)}>
                  <MaterialIcons name="close" size={24} color="#333" />
                </Pressable>
              </View>

              <TextInput
                style={styles.emailInput}
                placeholder="Enter email address"
                placeholderTextColor="#999"
                value={emailAddress}
                onChangeText={setEmailAddress}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {emailError && <Text style={styles.errorText}>{emailError}</Text>}

              <Pressable
                style={[styles.sendButton, isSending && { opacity: 0.6 }]}
                onPress={handleEmailReceipt}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <MaterialIcons name="send" size={20} color="white" />
                    <Text style={styles.sendButtonText}>Send Receipt</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.cancelButton}
                onPress={() => {
                  setShowEmailModal(false);
                  setEmailAddress('');
                  setEmailError('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Statistics */}
        {stats && (
          <View style={styles.statsSection}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalReceipts}</Text>
              <Text style={styles.statLabel}>Total Receipts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                ₹{stats.totalAmount.toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>Total Amount</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                ₹{stats.averageAmount.toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>Average Fare</Text>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.topActions}>
          <Pressable
            style={styles.exportButton}
            onPress={handleExportReceipts}
          >
            <MaterialIcons name="file_download" size={20} color="white" />
            <Text style={styles.exportButtonText}>Export All (CSV)</Text>
          </Pressable>
        </View>

        {/* Receipts List */}
        {receipts.length > 0 ? (
          <View style={styles.receiptsSection}>
            <Text style={styles.sectionTitle}>Recent Receipts</Text>
            <FlatList
              data={receipts}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <ReceiptCard
                  receipt={item}
                  onPress={() => setSelectedReceipt(item)}
                  onDownload={() => {
                    setSelectedReceipt(item);
                    // Trigger download via the modal
                    setTimeout(() => handleDownloadReceipt(), 100);
                  }}
                  onEmail={() => {
                    setSelectedReceipt(item);
                    setShowEmailModal(true);
                  }}
                />
              )}
            />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="receipt" size={48} color="#CCC" />
            <Text style={styles.emptyText}>No receipts yet</Text>
            <Text style={styles.emptySubtext}>
              Completed rides will appear here
            </Text>
          </View>
        )}
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statsSection: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  topActions: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  exportButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exportButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  receiptsSection: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  receiptContainer: {
    backgroundColor: 'white',
    marginHorizontal: 12,
    marginVertical: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  receiptId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  receiptStatus: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  receiptStatusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: '#999',
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  locationBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  locationLabel: {
    fontSize: 11,
    color: '#999',
  },
  locationValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fareLabel: {
    fontSize: 12,
    color: '#666',
  },
  fareValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  actionSection: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 8,
  },
  downloadButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  downloadButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  emailInput: {
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginBottom: 12,
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sendButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
