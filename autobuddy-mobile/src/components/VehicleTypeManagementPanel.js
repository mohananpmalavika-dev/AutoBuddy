import React, { useState } from 'react';
import { View, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Text, StyleSheet } from 'react-native';
import { COLORS, SHADOWS, SPACING } from '../theme';
import { useVehicleTypes } from '../hooks/useVehicleTypes';

/**
 * VehicleTypeManagementPanel - Admin interface for managing vehicle types
 * Create, edit, and manage vehicle type definitions (2-wheeler, auto, bus, truck, etc.)
 */
export default function VehicleTypeManagementPanel({ token, loading: parentLoading = false }) {
  const { vehicleTypes, loading, error, createVehicleType, updateVehicleType, deleteVehicleType, activateVehicleType } = useVehicleTypes();
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVehicleTypeId, setEditingVehicleTypeId] = useState(null);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const [formData, setFormData] = useState({
    vehicle_type_id: '',
    name: '',
    name_ml: '',
    capacity: '1',
    icon: '🚗',
    base_multiplier: '1.0',
    description: ''
  });

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({
      vehicle_type_id: '',
      name: '',
      name_ml: '',
      capacity: '1',
      icon: '🚗',
      base_multiplier: '1.0',
      description: ''
    });
    setEditingVehicleTypeId(null);
    setShowAddForm(false);
    setFormError('');
    setFormMessage('');
  };

  const validateForm = () => {
    if (!formData.vehicle_type_id.trim()) {
      setFormError('Vehicle type ID is required');
      return false;
    }
    if (!formData.name.trim()) {
      setFormError('Name (English) is required');
      return false;
    }
    if (!formData.name_ml.trim()) {
      setFormError('Name (Malayalam) is required');
      return false;
    }
    if (parseInt(formData.capacity) < 1 || parseInt(formData.capacity) > 100) {
      setFormError('Capacity must be between 1 and 100');
      return false;
    }
    if (parseFloat(formData.base_multiplier) < 0.1 || parseFloat(formData.base_multiplier) > 5.0) {
      setFormError('Base multiplier must be between 0.1 and 5.0');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setFormLoading(true);
    setFormError('');
    setFormMessage('');

    try {
      const vehicleTypeData = {
        vehicle_type_id: formData.vehicle_type_id.trim(),
        name: formData.name.trim(),
        name_ml: formData.name_ml.trim(),
        capacity: parseInt(formData.capacity),
        icon: formData.icon.trim(),
        base_multiplier: parseFloat(formData.base_multiplier),
        description: formData.description.trim()
      };

      if (editingVehicleTypeId) {
        // Update mode
        const result = await updateVehicleType(token, editingVehicleTypeId, {
          name: vehicleTypeData.name,
          name_ml: vehicleTypeData.name_ml,
          capacity: vehicleTypeData.capacity,
          icon: vehicleTypeData.icon,
          base_multiplier: vehicleTypeData.base_multiplier,
          description: vehicleTypeData.description
        });

        if (result.success) {
          setFormMessage('Vehicle type updated successfully');
          resetForm();
        } else {
          setFormError(result.error);
        }
      } else {
        // Create mode
        const result = await createVehicleType(token, vehicleTypeData);

        if (result.success) {
          setFormMessage('Vehicle type created successfully');
          resetForm();
        } else {
          setFormError(result.error);
        }
      }
    } catch (err) {
      setFormError(err?.message || 'An error occurred');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (vehicleType) => {
    setFormData({
      vehicle_type_id: vehicleType.vehicle_type_id || vehicleType.id || '',
      name: vehicleType.name || '',
      name_ml: vehicleType.name_ml || '',
      capacity: String(vehicleType.capacity || 1),
      icon: vehicleType.icon || '🚗',
      base_multiplier: String(vehicleType.base_multiplier || 1.0),
      description: vehicleType.description || ''
    });
    setEditingVehicleTypeId(vehicleType.id);
    setShowAddForm(true);
  };

  const handleDelete = (vehicleType) => {
    Alert.alert(
      'Delete Vehicle Type',
      `Are you sure you want to delete "${vehicleType.name}"?`,
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: async () => {
            setFormLoading(true);
            const result = await deleteVehicleType(token, vehicleType.id);
            setFormLoading(false);

            if (result.success) {
              setFormMessage('Vehicle type deleted successfully');
            } else {
              Alert.alert('Error', result.error || 'Failed to delete vehicle type');
            }
          }
        }
      ]
    );
  };

  const handleActivate = async (vehicleType) => {
    setFormLoading(true);
    const result = await activateVehicleType(token, vehicleType.id);
    setFormLoading(false);

    if (result.success) {
      setFormMessage('Vehicle type activated successfully');
    } else {
      Alert.alert('Error', result.error || 'Failed to activate vehicle type');
    }
  };

  const isLoading = loading || formLoading || parentLoading;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Vehicle Type Management</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {formError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      )}

      {formMessage && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{formMessage}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => {
          resetForm();
          setShowAddForm(true);
        }}
        disabled={isLoading}
      >
        <Text style={styles.addButtonText}>+ Add Vehicle Type</Text>
      </TouchableOpacity>

      {showAddForm && (
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>{editingVehicleTypeId ? 'Edit' : 'Add'} Vehicle Type</Text>

          <Text style={styles.fieldLabel}>Vehicle Type ID</Text>
          <TextInput
            style={[styles.input, editingVehicleTypeId && styles.inputDisabled]}
            value={formData.vehicle_type_id}
            onChangeText={(value) => updateFormData('vehicle_type_id', value)}
            placeholder="e.g., 2_wheeler, 3_wheeler, auto, truck"
            placeholderTextColor={COLORS.textMuted}
            editable={!editingVehicleTypeId && !isLoading}
          />

          <Text style={styles.fieldLabel}>Name (English)</Text>
          <TextInput
            style={styles.input}
            value={formData.name}
            onChangeText={(value) => updateFormData('name', value)}
            placeholder="e.g., 2-Wheeler, 4-Wheeler"
            placeholderTextColor={COLORS.textMuted}
            editable={!isLoading}
          />

          <Text style={styles.fieldLabel}>Name (Malayalam)</Text>
          <TextInput
            style={styles.input}
            value={formData.name_ml}
            onChangeText={(value) => updateFormData('name_ml', value)}
            placeholder="Malayalam name"
            placeholderTextColor={COLORS.textMuted}
            editable={!isLoading}
          />

          <Text style={styles.fieldLabel}>Capacity (Passengers)</Text>
          <TextInput
            style={styles.input}
            value={formData.capacity}
            onChangeText={(value) => updateFormData('capacity', value)}
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor={COLORS.textMuted}
            editable={!isLoading}
          />

          <Text style={styles.fieldLabel}>Icon (Emoji)</Text>
          <TextInput
            style={styles.input}
            value={formData.icon}
            onChangeText={(value) => updateFormData('icon', value)}
            placeholder="🚗"
            placeholderTextColor={COLORS.textMuted}
            editable={!isLoading}
          />

          <Text style={styles.fieldLabel}>Base Multiplier (Fare)</Text>
          <TextInput
            style={styles.input}
            value={formData.base_multiplier}
            onChangeText={(value) => updateFormData('base_multiplier', value)}
            keyboardType="decimal-pad"
            placeholder="1.0"
            placeholderTextColor={COLORS.textMuted}
            editable={!isLoading}
          />

          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={styles.input}
            value={formData.description}
            onChangeText={(value) => updateFormData('description', value)}
            placeholder="Brief description"
            placeholderTextColor={COLORS.textMuted}
            editable={!isLoading}
            multiline
            numberOfLines={3}
          />

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.saveButton]}
              onPress={handleSave}
              disabled={isLoading}
            >
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Save</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={resetForm}
              disabled={isLoading}
            >
              <Text style={[styles.actionText, styles.cancelButtonText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isLoading && !showAddForm && (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      )}

      {vehicleTypes && vehicleTypes.length > 0 ? (
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>Vehicle Types ({vehicleTypes.length})</Text>
          {vehicleTypes.map((vehicleType) => (
            <View key={vehicleType.id} style={styles.vehicleTypeCard}>
              <View style={styles.vehicleTypeHeader}>
                <Text style={styles.vehicleTypeIcon}>{vehicleType.icon}</Text>
                <View style={styles.vehicleTypeInfo}>
                  <Text style={styles.vehicleTypeName}>
                    {vehicleType.name} ({vehicleType.name_ml})
                  </Text>
                  <Text style={styles.vehicleTypeId}>{vehicleType.vehicle_type_id}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  vehicleType.active ? styles.activeBadge : styles.inactiveBadge
                ]}>
                  <Text style={styles.statusText}>{vehicleType.active ? 'Active' : 'Inactive'}</Text>
                </View>
              </View>

              <View style={styles.vehicleTypeDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Capacity:</Text>
                  <Text style={styles.detailValue}>{vehicleType.capacity} passengers</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Base Multiplier:</Text>
                  <Text style={styles.detailValue}>{vehicleType.base_multiplier}x</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Description:</Text>
                  <Text style={styles.detailValue}>{vehicleType.description}</Text>
                </View>
              </View>

              <View style={styles.vehicleTypeActions}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleEdit(vehicleType)}
                  disabled={isLoading}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>

                {!vehicleType.active && (
                  <TouchableOpacity
                    style={styles.activateButton}
                    onPress={() => handleActivate(vehicleType)}
                    disabled={isLoading}
                  >
                    <Text style={styles.activateButtonText}>Activate</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(vehicleType)}
                  disabled={isLoading}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : (
        !isLoading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No vehicle types found</Text>
          </View>
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.large,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.large,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    padding: SPACING.medium,
    borderRadius: 8,
    marginBottom: SPACING.medium,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 14,
  },
  successBox: {
    backgroundColor: '#dcfce7',
    padding: SPACING.medium,
    borderRadius: 8,
    marginBottom: SPACING.medium,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
  },
  successText: {
    color: '#166534',
    fontSize: 14,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.medium,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: SPACING.large,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  formContainer: {
    backgroundColor: COLORS.surface,
    padding: SPACING.large,
    borderRadius: 12,
    marginBottom: SPACING.large,
    ...SHADOWS.soft,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.small,
    marginTop: SPACING.medium,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: SPACING.medium,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: COLORS.textMuted,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.medium,
    marginTop: SPACING.large,
  },
  actionButton: {
    flex: 1,
    paddingVertical: SPACING.medium,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButton: {
    backgroundColor: COLORS.border,
  },
  actionText: {
    fontWeight: '600',
    fontSize: 16,
    color: '#fff',
  },
  cancelButtonText: {
    color: COLORS.text,
  },
  loader: {
    marginVertical: SPACING.large,
  },
  listContainer: {
    marginBottom: SPACING.large,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  vehicleTypeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.medium,
    marginBottom: SPACING.medium,
    ...SHADOWS.soft,
  },
  vehicleTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.medium,
  },
  vehicleTypeIcon: {
    fontSize: 32,
    marginRight: SPACING.medium,
  },
  vehicleTypeInfo: {
    flex: 1,
  },
  vehicleTypeName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  vehicleTypeId: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: SPACING.small,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadge: {
    backgroundColor: '#dcfce7',
  },
  inactiveBadge: {
    backgroundColor: '#fee2e2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  vehicleTypeDetails: {
    backgroundColor: COLORS.background,
    padding: SPACING.medium,
    borderRadius: 8,
    marginBottom: SPACING.medium,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.small,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  detailValue: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
  },
  vehicleTypeActions: {
    flexDirection: 'row',
    gap: SPACING.small,
  },
  editButton: {
    flex: 1,
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.medium,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  activateButton: {
    flex: 1,
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.medium,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    alignItems: 'center',
  },
  activateButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.medium,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.large,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
});
