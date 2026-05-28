import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useVehicleMaintenance } from '../hooks/useVehicleMaintenance';
import { theme } from '../theme';

const MaintenanceAlertPanel = ({ token, vehicleId, isVisible, onClose }) => {
  const { 
    maintenanceRecords, 
    isLoading, 
    error,
    MAINTENANCE_TYPES,
    loadMaintenanceHistory,
    loadDocumentExpiries,
    logMaintenance,
    getExpiryAlerts
  } = useVehicleMaintenance({ token, vehicleId });

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    maintenanceType: 'oil_change',
    cost: '',
  });
  const expiryAlerts = useMemo(() => getExpiryAlerts(), [getExpiryAlerts]);
  const dueSoonCount = expiryAlerts.length;

  useEffect(() => {
    if (isVisible) {
      loadMaintenanceHistory();
      loadDocumentExpiries();
    }
  }, [isVisible, loadMaintenanceHistory, loadDocumentExpiries]);

  const handleAddMaintenance = async () => {
    if (!formData.maintenanceType) {
      Alert.alert('Error', 'Please select maintenance type');
      return;
    }

    const today = new Date();
    const nextDue = new Date(today);
    nextDue.setMonth(nextDue.getMonth() + 6);

    const success = await logMaintenance(
      formData.maintenanceType,
      today.toISOString(),
      nextDue.toISOString(),
      formData.cost ? parseFloat(formData.cost) : null
    );

    if (success) {
      Alert.alert('Success', 'Maintenance logged');
      setShowAddForm(false);
      setFormData({ maintenanceType: 'oil_change', cost: '' });
      loadMaintenanceHistory();
    } else {
      Alert.alert('Error', error || 'Failed to log maintenance');
    }
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.headerButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Maintenance & Documents</Text>
          <TouchableOpacity onPress={() => setShowAddForm(true)}>
            <Text style={[styles.headerButton, { color: theme.COLORS.primary }]}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Alert Banner */}
          {dueSoonCount > 0 && (
            <View style={styles.alertBanner}>
              <Text style={styles.alertText}>⚠ {dueSoonCount} item(s) due for renewal</Text>
            </View>
          )}

          {/* Document Expiry Alerts */}
          {expiryAlerts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Expiring Documents</Text>
              {expiryAlerts.map((doc, idx) => (
                <View key={idx} style={styles.alertItem}>
                  <View style={styles.alertLeft}>
                    <Text style={styles.alertLabel}>{doc.document_type}</Text>
                    <Text style={styles.alertDate}>
                      Expires: {new Date(doc.expiry_date).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.alertStatus}>⚠</Text>
                </View>
              ))}
            </View>
          )}

          {/* Maintenance History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Maintenance</Text>
            {maintenanceRecords && maintenanceRecords.length > 0 ? (
              maintenanceRecords.slice(0, 5).map((record, idx) => (
                <View key={idx} style={styles.maintenanceItem}>
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemType}>{MAINTENANCE_TYPES[record.maintenance_type] || record.maintenance_type}</Text>
                    <Text style={styles.itemDate}>
                      Serviced: {new Date(record.service_date).toLocaleDateString()}
                    </Text>
                    <Text style={styles.itemDue}>
                      Next due: {new Date(record.next_due_date).toLocaleDateString()}
                    </Text>
                  </View>
                  {record.cost && <Text style={styles.itemCost}>₹{record.cost}</Text>}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No maintenance records yet</Text>
            )}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        {/* Add Maintenance Form Modal */}
        <Modal visible={showAddForm} animationType="fade" transparent>
          <View style={styles.formOverlay}>
            <View style={styles.formModal}>
              <Text style={styles.formTitle}>Log Maintenance</Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Type</Text>
                <View style={styles.typeOptions}>
                  {Object.entries(MAINTENANCE_TYPES).slice(0, 4).map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.typeOption,
                        formData.maintenanceType === key && styles.typeOptionActive
                      ]}
                      onPress={() => setFormData(prev => ({ ...prev, maintenanceType: key }))}
                    >
                      <Text style={[
                        styles.typeOptionText,
                        formData.maintenanceType === key && styles.typeOptionTextActive
                      ]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cost (₹)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter cost"
                  value={formData.cost}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, cost: text }))}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.formButton, styles.cancelButton]}
                  onPress={() => setShowAddForm(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formButton, styles.submitButton]}
                  onPress={handleAddMaintenance}
                  disabled={isLoading}
                >
                  <Text style={styles.submitButtonText}>{isLoading ? 'Saving...' : 'Log Service'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.white,
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.grey2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.COLORS.black,
  },
  headerButton: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.grey5,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  alertBanner: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: theme.COLORS.warning,
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  alertText: {
    color: '#856404',
    fontWeight: '600',
    fontSize: 13,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 12,
  },
  alertItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.COLORS.grey1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  alertLeft: {
    flex: 1,
  },
  alertLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 4,
  },
  alertDate: {
    fontSize: 12,
    color: theme.COLORS.danger,
  },
  alertStatus: {
    fontSize: 18,
    marginLeft: 8,
  },
  maintenanceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.COLORS.grey1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  itemLeft: {
    flex: 1,
  },
  itemType: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 2,
  },
  itemDate: {
    fontSize: 11,
    color: theme.COLORS.grey5,
    marginBottom: 2,
  },
  itemDue: {
    fontSize: 11,
    color: theme.COLORS.grey5,
  },
  itemCost: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.COLORS.primary,
  },
  emptyText: {
    fontSize: 13,
    color: theme.COLORS.grey5,
    textAlign: 'center',
    paddingVertical: 20,
  },
  error: {
    color: theme.COLORS.danger,
    fontSize: 13,
    marginTop: 12,
  },
  formOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  formModal: {
    backgroundColor: theme.COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.COLORS.black,
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 8,
  },
  typeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  typeOption: {
    width: '48%',
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    borderRadius: 8,
    paddingVertical: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  typeOptionActive: {
    backgroundColor: theme.COLORS.primary,
    borderColor: theme.COLORS.primary,
  },
  typeOptionText: {
    fontSize: 12,
    color: theme.COLORS.grey5,
    fontWeight: '500',
  },
  typeOptionTextActive: {
    color: theme.COLORS.white,
  },
  formInput: {
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  formButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    marginRight: 8,
  },
  cancelButtonText: {
    color: theme.COLORS.grey5,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: theme.COLORS.primary,
    marginLeft: 8,
  },
  submitButtonText: {
    color: theme.COLORS.white,
    fontWeight: '600',
  },
});

export default MaintenanceAlertPanel;
