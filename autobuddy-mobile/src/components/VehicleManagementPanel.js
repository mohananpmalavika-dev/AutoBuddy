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
import { useVehicleTypes } from '../hooks/useVehicleTypes';

const DEFAULT_VEHICLE_TYPE_ID = 'auto';
const DEFAULT_SEATING_CAPACITY = 4;
const DEFAULT_ACCEPTED_RIDE_TYPES = ['normal'];
const ACCEPTED_RIDE_TYPE_OPTIONS = [
  { key: 'normal', label: 'Normal' },
  { key: 'pool', label: 'Pool' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'corporate', label: 'Corporate' },
  { key: 'airport', label: 'Airport' },
  { key: 'intercity', label: 'Intercity' },
  { key: 'ev_auto', label: 'EV Auto' },
  { key: 'tourism', label: 'Tourism' },
  { key: 'women_only', label: 'Women Only' },
  { key: 'rental_hourly', label: 'Rental Hourly' },
  { key: 'school_elderly_safe', label: 'School/Elderly Safe' },
];
const ACCEPTED_RIDE_TYPE_KEYS = new Set(ACCEPTED_RIDE_TYPE_OPTIONS.map((item) => item.key));

function getVehicleTypeId(vehicleType) {
  return String(vehicleType?.vehicle_type_id || vehicleType?.id || '').trim();
}

function getDefaultVehicleTypeId(vehicleTypes = []) {
  return getVehicleTypeId(vehicleTypes[0]) || DEFAULT_VEHICLE_TYPE_ID;
}

function parseIntegerField(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAcceptedRideTypes(value, fallback = DEFAULT_ACCEPTED_RIDE_TYPES) {
  const raw = Array.isArray(value) ? value : [];
  const normalized = raw
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item, index, list) => ACCEPTED_RIDE_TYPE_KEYS.has(item) && list.indexOf(item) === index);
  return normalized.length > 0 ? normalized : [...fallback];
}

function formatAcceptedRideTypes(value) {
  const labels = normalizeAcceptedRideTypes(value).map(
    (key) => ACCEPTED_RIDE_TYPE_OPTIONS.find((item) => item.key === key)?.label || key,
  );
  return labels.join(', ');
}

function normalizeVehicle(vehicle = {}) {
  return {
    id: vehicle.id,
    make: vehicle.make || '',
    model: vehicle.model || '',
    year: Number(vehicle.year || new Date().getFullYear()),
    color: vehicle.color || '',
    license_plate: vehicle.license_plate || vehicle.licensePlate || '',
    registration_number: vehicle.registration_number || vehicle.registrationNumber || '',
    seating_capacity: Number(vehicle.seating_capacity || vehicle.seatingCapacity || DEFAULT_SEATING_CAPACITY),
    vehicle_type_id: vehicle.vehicle_type_id || vehicle.vehicle_type || vehicle.vehicleType || DEFAULT_VEHICLE_TYPE_ID,
    vehicle_subtype_id: vehicle.vehicle_subtype_id || vehicle.vehicleSubtypeId || null,
    accepted_ride_types: normalizeAcceptedRideTypes(vehicle.accepted_ride_types),
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

  // Use vehicle types from backend
  const { vehicleTypes, loading: vehicleTypesLoading } = useVehicleTypes();

  // Add/Edit form
  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    color: '',
    license_plate: '',
    registration_number: '',
    seating_capacity: String(DEFAULT_SEATING_CAPACITY),
    vehicle_type_id: '', // Will be vehicle_type_id from canonical backend
    vehicle_subtype_id: '',
    accepted_ride_types: [...DEFAULT_ACCEPTED_RIDE_TYPES],
  });

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

  const getSelectedVehicleTypeId = useCallback(
    () => String(formData.vehicle_type_id || '').trim() || getDefaultVehicleTypeId(vehicleTypes),
    [formData.vehicle_type_id, vehicleTypes],
  );

  const getEmptyFormData = () => ({
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    color: '',
    license_plate: '',
    registration_number: '',
    seating_capacity: String(DEFAULT_SEATING_CAPACITY),
    vehicle_type_id: getDefaultVehicleTypeId(vehicleTypes),
    vehicle_subtype_id: '',
    accepted_ride_types: [...DEFAULT_ACCEPTED_RIDE_TYPES],
  });

  const buildVehiclePayload = () => {
    const vehicleTypeId = getSelectedVehicleTypeId();
    return {
      make: formData.make.trim(),
      model: formData.model.trim(),
      year: parseIntegerField(formData.year, new Date().getFullYear()),
      color: formData.color.trim(),
      license_plate: formData.license_plate.trim(),
      registration_number: formData.registration_number.trim() || null,
      seating_capacity: parseIntegerField(formData.seating_capacity, DEFAULT_SEATING_CAPACITY),
      vehicle_type: vehicleTypeId,
      vehicle_type_id: vehicleTypeId,
      vehicle_subtype_id: String(formData.vehicle_subtype_id || '').trim() || null,
      accepted_ride_types: normalizeAcceptedRideTypes(formData.accepted_ride_types),
    };
  };

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
      seating_capacity: String(vehicle.seating_capacity || vehicle.seatingCapacity || DEFAULT_SEATING_CAPACITY),
      vehicle_type_id: vehicle.vehicle_type_id || vehicle.vehicleType || DEFAULT_VEHICLE_TYPE_ID,
      vehicle_subtype_id: vehicle.vehicle_subtype_id || '',
      accepted_ride_types: normalizeAcceptedRideTypes(vehicle.accepted_ride_types),
    });
    setEditingVehicleId(vehicle.id);
    setShowAddForm(true);
  };

  const handleSubmitVehicle = async () => {
    if (!formData.make.trim() || !formData.model.trim() || !formData.license_plate.trim()) {
      setError('Please fill in required fields: Make, Model, License Plate');
      return;
    }

    const nextYear = parseIntegerField(formData.year, 0);
    if (nextYear < 1900 || nextYear > 2100) {
      setError('Please enter a valid vehicle year.');
      return;
    }

    const nextCapacity = parseIntegerField(formData.seating_capacity, 0);
    if (nextCapacity < 1 || nextCapacity > 12) {
      setError('Please enter seating capacity between 1 and 12.');
      return;
    }

    if (normalizeAcceptedRideTypes(formData.accepted_ride_types, []).length === 0) {
      setError('Please select at least one accepted ride type.');
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

  const selectVehicleType = (typeId) => {
    setFormData((prev) => ({
      ...prev,
      vehicle_type_id: typeId,
      vehicle_subtype_id: '',
    }));
  };

  const toggleAcceptedRideType = (rideTypeKey) => {
    setFormData((prev) => {
      const current = new Set(normalizeAcceptedRideTypes(prev.accepted_ride_types, []));
      if (current.has(rideTypeKey)) {
        current.delete(rideTypeKey);
      } else {
        current.add(rideTypeKey);
      }
      return {
        ...prev,
        accepted_ride_types: ACCEPTED_RIDE_TYPE_OPTIONS
          .map((item) => item.key)
          .filter((key) => current.has(key)),
      };
    });
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
          <Text style={styles.activeLabel}>🚗 ACTIVE VEHICLE</Text>
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
              Type: <Text style={styles.bold}>{activeVehicle.vehicle_type_id.toUpperCase()}</Text>
            </Text>
            {activeVehicle.vehicle_subtype_id && (
              <Text style={styles.vehicleInfo}>
                Subtype: <Text style={styles.bold}>{activeVehicle.vehicle_subtype_id}</Text>
              </Text>
            )}
            {activeVehicle.registration_number && (
              <Text style={styles.vehicleInfo}>
                Registration: <Text style={styles.bold}>{activeVehicle.registration_number}</Text>
              </Text>
            )}
            <Text style={styles.vehicleInfo}>
              Ride types: <Text style={styles.bold}>{formatAcceptedRideTypes(activeVehicle.accepted_ride_types)}</Text>
            </Text>
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
                <Text style={styles.vehicleInfo}>
                  Ride types: <Text style={styles.bold}>{formatAcceptedRideTypes(vehicle.accepted_ride_types)}</Text>
                </Text>
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
          {vehicleTypesLoading ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <>
              <View style={styles.typeSelection}>
                {vehicleTypes && vehicleTypes.length > 0 ? (
                  vehicleTypes.map((type) => {
                    const typeId = getVehicleTypeId(type);
                    return (
                      <TouchableOpacity
                        key={typeId}
                        style={[
                          styles.typeButton,
                          formData.vehicle_type_id === typeId && styles.typeButtonActive,
                        ]}
                        onPress={() => selectVehicleType(typeId)}
                      >
                        <Text style={styles.typeButtonIcon}>{type.icon || '🚗'}</Text>
                        <View style={styles.typeButtonContent}>
                          <Text
                            style={[
                              styles.typeButtonText,
                              formData.vehicle_type_id === typeId && styles.typeButtonTextActive,
                            ]}
                          >
                            {type.name}
                          </Text>
                          {type.capacity && (
                            <Text style={styles.typeButtonSubtext}>
                              {type.capacity} {type.capacity_unit || 'seats'}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={styles.noTypesText}>No vehicle types available</Text>
                )}
              </View>

              {/* Subtype Selection (if available) */}
              {formData.vehicle_type_id && vehicleTypes && (
                (() => {
                  const selectedType = vehicleTypes.find((t) => getVehicleTypeId(t) === formData.vehicle_type_id);
                  return selectedType?.subtypes && selectedType.subtypes.length > 0 ? (
                    <View style={styles.subtypeSection}>
                      <Text style={styles.fieldLabel}>Vehicle Subtype (Optional)</Text>
                      <View style={styles.subtypeSelection}>
                        {selectedType.subtypes.map((subtype) => (
                          <TouchableOpacity
                            key={subtype.id}
                            style={[
                              styles.subtypeButton,
                              formData.vehicle_subtype_id === subtype.id && styles.subtypeButtonActive,
                            ]}
                            onPress={() => updateFormData('vehicle_subtype_id', subtype.id)}
                          >
                            <Text
                              style={[
                                styles.subtypeButtonText,
                                formData.vehicle_subtype_id === subtype.id && styles.subtypeButtonTextActive,
                              ]}
                            >
                              {subtype.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : null;
                })()
              )}
            </>
          )}

          <Text style={styles.fieldLabel}>Accepted Ride Types*</Text>
          <View style={styles.rideTypeSelection}>
            {ACCEPTED_RIDE_TYPE_OPTIONS.map((option) => {
              const active = normalizeAcceptedRideTypes(formData.accepted_ride_types, []).includes(option.key);
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.rideTypeButton, active && styles.rideTypeButtonActive]}
                  onPress={() => toggleAcceptedRideType(option.key)}
                  disabled={parentLoading || loading}
                >
                  <Text style={[styles.rideTypeButtonText, active && styles.rideTypeButtonTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
  typeButtonIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  typeButtonContent: {
    alignItems: 'center',
  },
  typeButtonSubtext: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  subtypeSection: {
    marginTop: 16,
  },
  subtypeSelection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subtypeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  subtypeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  subtypeButtonText: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '600',
  },
  subtypeButtonTextActive: {
    color: '#fff',
  },
  rideTypeSelection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 14,
  },
  rideTypeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  rideTypeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  rideTypeButtonText: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '600',
  },
  rideTypeButtonTextActive: {
    color: '#fff',
  },
  noTypesText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
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
