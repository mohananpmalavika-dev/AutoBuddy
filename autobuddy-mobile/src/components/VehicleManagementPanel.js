import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

function normalizeVehicle(vehicle = {}) {
  return {
    id: vehicle.id,
    make: vehicle.make || '',
    model: vehicle.model || '',
    year: Number(vehicle.year || new Date().getFullYear()),
    color: vehicle.color || '',
    license_plate: vehicle.license_plate || vehicle.licensePlate || '',
    registration_number: vehicle.registration_number || vehicle.registrationNumber || '',
    seating_capacity: Number(vehicle.seating_capacity || vehicle.seatingCapacity || 4),
    vehicle_type: vehicle.vehicle_type || vehicle.vehicleType || 'auto',
    is_active: Boolean(vehicle.is_active),
  };
}

/**
 * VehicleManagementPanel - Driver vehicle details management
 * Add, edit, and manage vehicle information
 */
export default function VehicleManagementPanel({ token, loading: parentLoading = false }) {
  const [vehicles, setVehicles] = useState([]);
  const [activeVehicle, setActiveVehicle] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Add/Edit form
  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    color: '',
    license_plate: '',
    registration_number: '',
    seating_capacity: '4',
    vehicle_type: 'sedan',
  });

  const vehicleTypes = ['sedan', 'suv', 'hatchback', 'auto', 'van'];

  const fetchVehicles = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/vehicles', { token });
      const nextVehicles = Array.isArray(data?.vehicles) ? data.vehicles.map(normalizeVehicle) : [];
      setVehicles(nextVehicles);
      const active = nextVehicles.find((v) => v.is_active);
      setActiveVehicle(active || nextVehicles[0] || null);
    } catch (err) {
      setError(err.message || 'Failed to load vehicles');
      setVehicles([]);
      setActiveVehicle(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    Promise.resolve().then(fetchVehicles);
  }, [fetchVehicles]);

  const getEmptyFormData = () => ({
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    color: '',
    license_plate: '',
    registration_number: '',
    seating_capacity: '4',
    vehicle_type: 'sedan',
  });

  const buildVehiclePayload = () => ({
    make: formData.make,
    model: formData.model,
    year: Number(formData.year),
    color: formData.color,
    license_plate: formData.license_plate,
    registration_number: formData.registration_number || null,
    seating_capacity: Number(formData.seating_capacity),
    vehicle_type: formData.vehicle_type,
  });

  const resetVehicleForm = () => {
    setFormData(getEmptyFormData());
    setEditingVehicleId(null);
    setShowAddForm(false);
  };

  const startAddVehicle = () => {
    setError('');
    setMessage('');
    setFormData(getEmptyFormData());
    setEditingVehicleId(null);
    setShowAddForm(true);
  };

  const startEditVehicle = (vehicle) => {
    setError('');
    setMessage('');
    setFormData({
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: String(vehicle.year || new Date().getFullYear()),
      color: vehicle.color || '',
      license_plate: vehicle.license_plate || vehicle.licensePlate || '',
      registration_number: vehicle.registration_number || vehicle.registrationNumber || '',
      seating_capacity: String(vehicle.seating_capacity || vehicle.seatingCapacity || '4'),
      vehicle_type: vehicle.vehicle_type || vehicle.vehicleType || 'sedan',
    });
    setEditingVehicleId(vehicle.id);
    setShowAddForm(true);
  };

  const handleSubmitVehicle = async () => {
    if (!formData.make || !formData.model || !formData.license_plate) {
      setError('Please fill in required fields: Make, Model, License Plate');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await apiRequest(editingVehicleId ? `/drivers/vehicles/${editingVehicleId}` : '/drivers/vehicles', {
        method: editingVehicleId ? 'PUT' : 'POST',
        token,
        body: buildVehiclePayload(),
      });
      setMessage(editingVehicleId ? 'Vehicle updated successfully!' : 'Vehicle added successfully!');
      resetVehicleForm();
      await fetchVehicles();
    } catch (err) {
      setError(err.message || (editingVehicleId ? 'Failed to update vehicle' : 'Failed to add vehicle'));
    } finally {
      setLoading(false);
    }
  };

  const setActiveVehicleRequest = async (vehicleId) => {
    try {
      setLoading(true);
      setError('');
      await apiRequest(`/drivers/vehicles/${vehicleId}/activate`, {
        method: 'PUT',
        token,
      });
      setMessage('Vehicle activated!');
      await fetchVehicles();
    } catch (err) {
      setError(err.message || 'Failed to activate vehicle');
    } finally {
      setLoading(false);
    }
  };

  const deleteVehicle = async (vehicleId) => {
    try {
      setLoading(true);
      setError('');
      await apiRequest(`/drivers/vehicles/${vehicleId}`, {
        method: 'DELETE',
        token,
      });
      setMessage('Vehicle removed');
      await fetchVehicles();
    } catch (err) {
      setError(err.message || 'Failed to delete vehicle');
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (loading && vehicles.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Vehicle Information</Text>
      <Text style={styles.subtitle}>Manage your vehicle details</Text>

      {error && <Text style={[styles.message, styles.error]}>{error}</Text>}
      {message && <Text style={[styles.message, styles.success]}>{message}</Text>}

      {/* Active Vehicle Display */}
      {activeVehicle && (
        <View style={styles.activeVehicleCard}>
          <Text style={styles.activeLabel}>ACTIVE VEHICLE</Text>
          <View style={styles.vehicleDetails}>
            <Text style={styles.vehicleTitle}>
              {activeVehicle.make} {activeVehicle.model} ({activeVehicle.year})
            </Text>
            <Text style={styles.vehicleInfo}>
              License: <Text style={styles.bold}>{activeVehicle.license_plate}</Text>
            </Text>
            <Text style={styles.vehicleInfo}>
              Color: <Text style={styles.bold}>{activeVehicle.color}</Text>
            </Text>
            <Text style={styles.vehicleInfo}>
              Capacity: <Text style={styles.bold}>{activeVehicle.seating_capacity} seats</Text>
            </Text>
            <Text style={styles.vehicleInfo}>
              Type: <Text style={styles.bold}>{activeVehicle.vehicle_type}</Text>
            </Text>
            {activeVehicle.registration_number && (
              <Text style={styles.vehicleInfo}>
                Registration: <Text style={styles.bold}>{activeVehicle.registration_number}</Text>
              </Text>
            )}
          </View>
          <View style={styles.activeVehicleActions}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => startEditVehicle(activeVehicle)}
              disabled={parentLoading || loading}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Other Vehicles List */}
      {vehicles.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Other Vehicles</Text>
          {vehicles.map((vehicle) => {
            if (vehicle.id === activeVehicle?.id) return null;
            return (
              <View key={vehicle.id} style={styles.vehicleCard}>
                <View style={styles.vehicleCardHeader}>
                  <Text style={styles.vehicleCardTitle}>
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                  </Text>
                  <Text style={styles.licensePlate}>{vehicle.license_plate}</Text>
                </View>
                <View style={styles.vehicleCardButtons}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => startEditVehicle(vehicle)}
                    disabled={parentLoading || loading}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.activateButton}
                    onPress={() => setActiveVehicleRequest(vehicle.id)}
                    disabled={parentLoading || loading}
                  >
                    <Text style={styles.activateButtonText}>Activate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => deleteVehicle(vehicle.id)}
                    disabled={parentLoading || loading}
                  >
                    <Text style={styles.deleteButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Add Vehicle Form */}
      {showAddForm ? (
        <View style={styles.addVehicleForm}>
          <Text style={styles.formTitle}>{editingVehicleId ? 'Edit Vehicle' : 'Add New Vehicle'}</Text>

          <Text style={styles.fieldLabel}>Make (e.g., Toyota, Hyundai)*</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.make}
            onChangeText={(value) => updateFormData('make', value)}
            placeholder="Vehicle make"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Model (e.g., Swift, Creta)*</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.model}
            onChangeText={(value) => updateFormData('model', value)}
            placeholder="Vehicle model"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Year</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.year}
            onChangeText={(value) => updateFormData('year', value)}
            keyboardType="number-pad"
            placeholder="2024"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Color</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.color}
            onChangeText={(value) => updateFormData('color', value)}
            placeholder="White, Black, Silver, etc."
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>License Plate*</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.license_plate}
            onChangeText={(value) => updateFormData('license_plate', value)}
            placeholder="MH01AB1234"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Registration Number</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.registration_number}
            onChangeText={(value) => updateFormData('registration_number', value)}
            placeholder="Vehicle registration number"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Seating Capacity</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.seating_capacity}
            onChangeText={(value) => updateFormData('seating_capacity', value)}
            keyboardType="number-pad"
            placeholder="4"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Vehicle Type</Text>
          <View style={styles.typeSelection}>
            {vehicleTypes.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeButton,
                  formData.vehicle_type === type && styles.typeButtonActive,
                ]}
                onPress={() => updateFormData('vehicle_type', type)}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    formData.vehicle_type === type && styles.typeButtonTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.formButtons}>
            <TouchableOpacity
              style={[styles.submitButton, (parentLoading || loading) && styles.submitButtonDisabled]}
              onPress={handleSubmitVehicle}
              disabled={parentLoading || loading}
            >
              <Text style={styles.submitButtonText}>
                {editingVehicleId ? 'Save Changes' : 'Add Vehicle'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={resetVehicleForm}
              disabled={parentLoading || loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addButton}
          onPress={startAddVehicle}
          disabled={parentLoading || loading}
        >
          <Text style={styles.addButtonText}>+ Add Another Vehicle</Text>
        </TouchableOpacity>
      )}

      <View style={styles.info}>
        <Text style={styles.infoTitle}>Vehicle Information</Text>
        <Text style={styles.infoText}>
          - You can have multiple vehicles registered{'\n'}
          - Only one vehicle can be active at a time{'\n'}
          - Passengers will see your active vehicle details{'\n'}
          - Keep vehicle info updated for matching
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  message: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  error: {
    backgroundColor: '#FFEBEE',
    color: COLORS.error,
  },
  success: {
    backgroundColor: '#E8F5E9',
    color: COLORS.success,
  },
  activeVehicleCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
    ...SHADOWS.soft,
  },
  activeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.success,
    marginBottom: 8,
  },
  vehicleDetails: {
    gap: 8,
  },
  vehicleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  vehicleInfo: {
    fontSize: 13,
    color: COLORS.textMain,
    lineHeight: 18,
  },
  activeVehicleActions: {
    flexDirection: 'row',
    marginTop: 12,
  },
  bold: {
    fontWeight: '700',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 10,
  },
  vehicleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  vehicleCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    flex: 1,
  },
  licensePlate: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  vehicleCardButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  activateButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  activateButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: COLORS.error,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 20,
    ...SHADOWS.soft,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  addVehicleForm: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    ...SHADOWS.soft,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textMain,
    backgroundColor: COLORS.background,
  },
  typeSelection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 14,
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  typeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  info: {
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.textMain,
    lineHeight: 18,
  },
});
