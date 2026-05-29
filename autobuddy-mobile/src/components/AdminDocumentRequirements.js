import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import ConfirmationDialog from './ConfirmationDialog';

const AdminDocumentRequirements = ({ isActive = true, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [requirements, setRequirements] = useState([]);
  const [activeTab, setActiveTab] = useState('requirements');
  const [editingReq, setEditingReq] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [formData, setFormData] = useState({
    document_type: '',
    display_name: '',
    is_mandatory: true,
    grace_period_days: 7,
    applicable_to: 'driver',
    description: '',
    enabled: true,
  });

  const DOCUMENT_TYPES = [
    // KYC Documents
    { value: 'passport', label: 'Passport', category: 'KYC' },
    { value: 'national_id', label: 'National ID / Identity Card', category: 'KYC' },
    { value: 'driving_license', label: 'Driving License', category: 'KYC' },
    { value: 'driving_history', label: 'Driving History Report', category: 'KYC' },
    { value: 'fitness_certificate', label: 'Medical/Fitness Certificate', category: 'KYC' },
    { value: 'police_clearance', label: 'Police Clearance Certificate', category: 'KYC' },
    { value: 'pan_id', label: 'PAN / Tax ID', category: 'KYC' },
    { value: 'bank_details', label: 'Bank Account Proof', category: 'KYC' },
    { value: 'address_proof', label: 'Address Proof', category: 'KYC' },
    
    // Vehicle Documents
    { value: 'registration', label: 'Vehicle Registration Certificate', category: 'Vehicle' },
    { value: 'insurance', label: 'Insurance Certificate', category: 'Vehicle' },
    { value: 'pollution_certificate', label: 'Pollution Certificate / PUC', category: 'Vehicle' },
    { value: 'vehicle_inspection', label: 'Vehicle Inspection Report', category: 'Vehicle' },
    { value: 'ownership_proof', label: 'Ownership Proof / Title Deed', category: 'Vehicle' },
    { value: 'vehicle_photo_front', label: 'Vehicle Photo - Front', category: 'Vehicle' },
    { value: 'vehicle_photo_back', label: 'Vehicle Photo - Back', category: 'Vehicle' },
    { value: 'vehicle_photo_interior', label: 'Vehicle Photo - Interior', category: 'Vehicle' },
    { value: 'vehicle_inspection_sticker', label: 'Inspection Sticker / Permit', category: 'Vehicle' },
    { value: 'loan_details', label: 'Loan/Mortgage Documentation', category: 'Vehicle' },
    { value: 'emission_test', label: 'Emission Test Report', category: 'Vehicle' },
  ];

  const fetchRequirements = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', '/api/admin/documents/requirements');
      setRequirements(response.requirements || []);
    } catch (_error) {
      console.error('Error fetching requirements:', _error);
      Alert.alert('Error', 'Failed to fetch document requirements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    let mounted = true;
    (async () => {
      if (mounted) {
        await fetchRequirements();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fetchRequirements, isActive]);

  const handleAddNew = () => {
    setEditingReq(null);
    setFormData({
      document_type: '',
      display_name: '',
      is_mandatory: true,
      grace_period_days: 7,
      applicable_to: 'driver',
      description: '',
      enabled: true,
    });
  };

  const handleEditReq = (req) => {
    setEditingReq(req);
    setFormData({
      document_type: req.document_type,
      display_name: req.display_name,
      is_mandatory: req.is_mandatory,
      grace_period_days: req.grace_period_days,
      applicable_to: req.applicable_to,
      description: req.description,
      enabled: req.enabled,
    });
  };

  const handleSaveReq = async () => {
    try {
      if (!formData.document_type || !formData.display_name) {
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }

      setLoading(true);

      if (editingReq) {
        // Update existing
        await apiRequest('PUT', `/api/admin/documents/requirements/${editingReq.id}`, {
          display_name: formData.display_name,
          is_mandatory: formData.is_mandatory,
          grace_period_days: formData.grace_period_days,
          description: formData.description,
          enabled: formData.enabled,
        });
        Alert.alert('Success', 'Document requirement updated');
      } else {
        // Create new
        await apiRequest('POST', '/api/admin/documents/requirements', formData);
        Alert.alert('Success', 'Document requirement created');
      }

      fetchRequirements();
      setEditingReq(null);
    } catch (error) {
      console.error('Error saving requirement:', error);
      Alert.alert('Error', error.message || 'Failed to save document requirement');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReq = (req) => {
    setConfirmDialog({
      title: 'Delete Document Requirement?',
      message: `Are you sure you want to delete "${req.display_name}"?`,
      onConfirm: async () => {
        try {
          setLoading(true);
          await apiRequest('DELETE', `/api/admin/documents/requirements/${req.id}`);
          Alert.alert('Success', 'Document requirement deleted');
          fetchRequirements();
          setConfirmDialog(null);
        } catch (_error) {
          Alert.alert('Error', 'Failed to delete document requirement');
        } finally {
          setLoading(false);
        }
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  const documentTypeLabel = DOCUMENT_TYPES.find(d => d.value === formData.document_type)?.label || 'Select document type';

  return (
    <SafeAreaView style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Document Requirements</Text>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Close</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requirements' && styles.tabActive]}
          onPress={() => setActiveTab('requirements')}
        >
          <Text style={[styles.tabText, activeTab === 'requirements' && styles.tabTextActive]}>
            Requirements
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'user-status' && styles.tabActive]}
          onPress={() => setActiveTab('user-status')}
        >
          <Text style={[styles.tabText, activeTab === 'user-status' && styles.tabTextActive]}>
            User Status
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'requirements' && (
          <View>
            {/* Requirements List */}
            {!editingReq && (
              <View>
                <TouchableOpacity style={styles.addBtn} onPress={handleAddNew}>
                  <Text style={styles.addBtnText}>+ Add Document Requirement</Text>
                </TouchableOpacity>

                {requirements.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No document requirements configured</Text>
                  </View>
                ) : (
                  <View style={styles.list}>
                    {requirements.map((req) => (
                      <View key={req.id} style={styles.listItem}>
                        <View style={styles.itemHeader}>
                          <Text style={styles.itemTitle}>{req.display_name}</Text>
                          <View style={styles.badges}>
                            <View style={[styles.badge, req.is_mandatory ? styles.badgeMandatory : styles.badgeOptional]}>
                              <Text style={styles.badgeText}>
                                {req.is_mandatory ? 'Mandatory' : 'Optional'}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Text style={styles.itemType}>{req.document_type}</Text>
                        {req.description && <Text style={styles.itemDesc}>{req.description}</Text>}
                        <View style={styles.itemMeta}>
                          <Text style={styles.metaText}>Grace period: {req.grace_period_days} days</Text>
                          <Text style={styles.metaText}>For: {req.applicable_to}</Text>
                        </View>
                        <View style={styles.itemActions}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.editBtn]}
                            onPress={() => handleEditReq(req)}
                          >
                            <Text style={styles.actionBtnText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.deleteBtn]}
                            onPress={() => handleDeleteReq(req)}
                          >
                            <Text style={styles.actionBtnText}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Form */}
            {editingReq || (editingReq === null && requirements.length > 0) ? (
              <View style={styles.form}>
                <Text style={styles.formTitle}>{editingReq ? 'Edit' : 'New'} Document Requirement</Text>

                {/* Document Type Picker */}
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Document Type *</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => {
                      const kycDocs = DOCUMENT_TYPES.filter(d => d.category === 'KYC');
                      const vehicleDocs = DOCUMENT_TYPES.filter(d => d.category === 'Vehicle');
                      
                      Alert.alert(
                        'Select Document Type',
                        '',
                        [
                          { text: 'KYC DOCUMENTS', onPress: () => {} },
                          ...kycDocs.map(doc => ({
                            text: `  ${doc.label}`,
                            onPress: () => setFormData({ ...formData, document_type: doc.value }),
                          })),
                          { text: 'VEHICLE DOCUMENTS', onPress: () => {} },
                          ...vehicleDocs.map(doc => ({
                            text: `  ${doc.label}`,
                            onPress: () => setFormData({ ...formData, document_type: doc.value }),
                          })),
                          { text: 'Cancel', onPress: () => {} },
                        ]
                      );
                    }}
                    disabled={!!editingReq}
                  >
                    <Text style={styles.pickerButtonText}>{documentTypeLabel}</Text>
                  </TouchableOpacity>
                </View>

                {/* Display Name */}
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Display Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Driver License"
                    value={formData.display_name}
                    onChangeText={(text) => setFormData({ ...formData, display_name: text })}
                  />
                </View>

                {/* Grace Period */}
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Grace Period (days)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="7"
                    keyboardType="number-pad"
                    value={String(formData.grace_period_days)}
                    onChangeText={(text) => setFormData({
                      ...formData,
                      grace_period_days: parseInt(text) || 0
                    })}
                  />
                </View>

                {/* Applicable To */}
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Applicable To</Text>
                  <View style={styles.pickContainer}>
                    {['driver', 'passenger', 'both'].map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.pickOption,
                          formData.applicable_to === option && styles.pickOptionActive,
                        ]}
                        onPress={() => setFormData({ ...formData, applicable_to: option })}
                      >
                        <Text
                          style={[
                            styles.pickOptionText,
                            formData.applicable_to === option && styles.pickOptionTextActive,
                          ]}
                        >
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Mandatory Toggle */}
                <View style={styles.formGroup}>
                  <View style={styles.toggleRow}>
                    <Text style={styles.inputLabel}>Mandatory Document</Text>
                    <Switch
                      value={formData.is_mandatory}
                      onValueChange={(value) => setFormData({ ...formData, is_mandatory: value })}
                      trackColor={{ false: COLORS.border, true: COLORS.primary }}
                      thumbColor={formData.is_mandatory ? COLORS.primary : COLORS.text}
                    />
                  </View>
                </View>

                {/* Enabled Toggle */}
                <View style={styles.formGroup}>
                  <View style={styles.toggleRow}>
                    <Text style={styles.inputLabel}>Enabled</Text>
                    <Switch
                      value={formData.enabled}
                      onValueChange={(value) => setFormData({ ...formData, enabled: value })}
                      trackColor={{ false: COLORS.border, true: COLORS.primary }}
                      thumbColor={formData.enabled ? COLORS.primary : COLORS.text}
                    />
                  </View>
                </View>

                {/* Description */}
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.multilineInput]}
                    placeholder="Additional instructions for users"
                    multiline
                    numberOfLines={3}
                    value={formData.description}
                    onChangeText={(text) => setFormData({ ...formData, description: text })}
                  />
                </View>

                {/* Form Actions */}
                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.saveBtn]}
                    onPress={handleSaveReq}
                    disabled={loading}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.cancelBtn]}
                    onPress={() => setEditingReq(null)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {activeTab === 'user-status' && (
          <View>
            <Text style={styles.sectionTitle}>Check User Document Status</Text>
            <Text style={styles.sectionDesc}>Search for a user ID to view their document upload status</Text>
            {/* This would typically have a user search and status display */}
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>User status view coming soon</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {confirmDialog && <ConfirmationDialog {...confirmDialog} />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: COLORS.background,
  },
  headerBtnText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    marginBottom: 16,
  },
  listItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    ...SHADOWS.small,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeMandatory: {
    backgroundColor: '#FFE5E5',
  },
  badgeOptional: {
    backgroundColor: '#E5F5E5',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemType: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  itemDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  editBtn: {
    backgroundColor: COLORS.primary,
  },
  deleteBtn: {
    backgroundColor: COLORS.danger,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  form: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    ...SHADOWS.small,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  multilineInput: {
    textAlignVertical: 'top',
    paddingVertical: 12,
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  pickerButtonText: {
    fontSize: 14,
    color: COLORS.text,
  },
  pickContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  pickOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  pickOptionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pickOptionText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
    textAlign: 'center',
  },
  pickOptionTextActive: {
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  sectionDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
});

export default AdminDocumentRequirements;
