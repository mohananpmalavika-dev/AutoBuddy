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

/**
 * VehicleManagementPanel - Driver vehicle details management
 * Add, edit, and manage vehicle information
 */
export default function VehicleManagementPanel({ token, loading: parentLoading = false }) {
  const [vehicles, setVehicles] = useState([]);
  const [activeVehicle, setActiveVehicle] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Add/Edit form
  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    color: '',
    licensePlate: '',
    registrationNumber: '',
    seatingCapacity: '4',
    vehicleType: 'sedan',
  });

  const vehicleTypes = ['sedan', 'suv', 'hatchback', 'auto', 'van'];

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      setError('');
      try {
        const data = await apiRequest('/drivers/vehicles', { token });
        if (data && data.vehicles) {
          setVehicles(data.vehicles);
          const active = data.vehicles.find((v) => v.is_active);
          setActiveVehicle(active || data.vehicles[0] || null);
        }
      } catch (err) {
        console.log('Vehicles endpoint not yet implemented, using mock data');
        const mockVehicles = [
          {
            id: 1,
            make: 'Hyundai',
            model: 'i20',
            year: 2022,
            color: 'Silver',
            licensePlate: 'TN01AB1234',
            registrationNumber: 'TN01AB1234',
            seatingCapacity: 5,
            vehicleType: 'hatchback',
            is_active: true,
          },
        ];
        setVehicles(mockVehicles);
        setActiveVehicle(mockVehicles[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  const handleAddVehicle = async () => {
    if (!formData.make || !formData.model || !formData.licensePlate) {
      setError('Please fill in required fields: Make, Model, License Plate');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await apiRequest('/drivers/vehicles', {
        method: 'POST',
        token,
        body: {
          ...formData,
          year: Number(formData.year),
          seating_capacity: Number(formData.seatingCapacity),
          vehicle_type: formData.vehicleType,
        },
      });
      setMessage('Vehicle added successfully!');
      setFormData({
        make: '',
        model: '',
        year: new Date().getFullYear().toString(),
        color: '',
        licensePlate: '',
        registrationNumber: '',
        seatingCapacity: '4',
        vehicleType: 'sedan',
      });
      setShowAddForm(false);
      await fetchVehicles();
    } catch (err) {
      setError(err.message || 'Failed to add vehicle');
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
      <Text style={styles.title}>🚗 Vehicle Information</Text>
      <Text style={styles.subtitle}>Manage your vehicle details</Text>

      {error && <Text style={[styles.message, styles.error]}>{error}</Text>}
      {message && <Text style={[styles.message, styles.success]}>{message}</Text>}

      {/* Active Vehicle Display */}
      {activeVehicle && (
        <View style={styles.activeVehicleCard}>
          <Text style={styles.activeLabel}>🟢 ACTIVE VEHICLE</Text>
          <View style={styles.vehicleDetails}>
            <Text style={styles.vehicleTitle}>
              {activeVehicle.make} {activeVehicle.model} ({activeVehicle.year})
            </Text>
            <Text style={styles.vehicleInfo}>
              📋 License: <Text style={styles.bold}>{activeVehicle.license_plate}</Text>
            </Text>
            <Text style={styles.vehicleInfo}>
              🎨 Color: <Text style={styles.bold}>{activeVehicle.color}</Text>
            </Text>
            <Text style={styles.vehicleInfo}>
              👥 Capacity: <Text style={styles.bold}>{activeVehicle.seating_capacity} seats</Text>
            </Text>
            <Text style={styles.vehicleInfo}>
              🚗 Type: <Text style={styles.bold}>{activeVehicle.vehicle_type}</Text>
            </Text>
            {activeVehicle.registration_number && (
              <Text style={styles.vehicleInfo}>
                📄 Registration: <Text style={styles.bold}>{activeVehicle.registration_number}</Text>
              </Text>
            )}
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
                    style={styles.activateButton}
                    onPress={() => setActiveVehicleRequest(vehicle.id)}
                    disabled={parentLoading}
                  >
                    <Text style={styles.activateButtonText}>✓ Activate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => deleteVehicle(vehicle.id)}
                    disabled={parentLoading}
                  >
                    <Text style={styles.deleteButtonText}>🗑️ Remove</Text>
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
          <Text style={styles.formTitle}>Add New Vehicle</Text>

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
            value={formData.licensePlate}
            onChangeText={(value) => updateFormData('licensePlate', value)}
            placeholder="MH01AB1234"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Registration Number</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.registrationNumber}
            onChangeText={(value) => updateFormData('registrationNumber', value)}
            placeholder="Vehicle registration number"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Seating Capacity</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.seatingCapacity}
            onChangeText={(value) => updateFormData('seatingCapacity', value)}
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
                  formData.vehicleType === type && styles.typeButtonActive,
                ]}
                onPress={() => updateFormData('vehicleType', type)}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    formData.vehicleType === type && styles.typeButtonTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.formButtons}>
            <TouchableOpacity
              style={[styles.submitButton, parentLoading && styles.submitButtonDisabled]}
              onPress={handleAddVehicle}
              disabled={parentLoading}
            >
              <Text style={styles.submitButtonText}>✓ Add Vehicle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowAddForm(false)}
              disabled={parentLoading}
            >
              <Text style={styles.cancelButtonText}>✕ Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
          disabled={parentLoading}
        >
          <Text style={styles.addButtonText}>+ Add Another Vehicle</Text>
        </TouchableOpacity>
      )}

      <View style={styles.info}>
        <Text style={styles.infoTitle}>💡 Vehicle Information</Text>
        <Text style={styles.infoText}>
          • You can have multiple vehicles registered{'\n'}
          • Only one vehicle can be active at a time{'\n'}
          • Passengers will see your active vehicle details{'\n'}
          • Keep vehicle info updated for matching
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
