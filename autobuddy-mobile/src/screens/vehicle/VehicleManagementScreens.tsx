import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Switch,
  Dimensions
} from 'react-native';
import { useVehicleManagement } from '../hooks/useVehicleManagement';

const { width } = Dimensions.get('window');

// ==================== VEHICLE MANAGEMENT SCREEN ====================

export const VehicleManagementScreen: React.FC<{
  driverId: string;
  authToken: string;
}> = ({ driverId, authToken }) => {
  const {
    vehicles,
    expiringDocuments,
    expiringInsurance,
    isLoading,
    addVehicle,
    fetchVehicles,
    deleteVehicle
  } = useVehicleManagement(driverId, authToken);

  const [showAddModal, setShowAddModal] = useState(false);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('economy');

  const handleAddVehicle = async () => {
    if (!make.trim() || !model.trim() || !regNumber.trim()) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    const success = await addVehicle(vehicleType, regNumber, make, model, parseInt(year, 10), color, licensePlate);
    if (success) {
      Alert.alert('Success', 'Vehicle added successfully');
      setMake('');
      setModel('');
      setYear('');
      setColor('');
      setRegNumber('');
      setLicensePlate('');
      setShowAddModal(false);
    }
  };

  const handleDeleteVehicle = (vehicleId: string) => {
    Alert.alert(
      'Delete Vehicle?',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: async () => {
            await deleteVehicle(vehicleId);
          },
          style: 'destructive'
        }
      ]
    );
  };

  const renderVehicle = ({ item }: { item: any }) => (
    <View style={styles.vehicleCard}>
      <View style={styles.vehicleHeader}>
        <View>
          <Text style={styles.vehicleTitle}>{item.make} {item.model}</Text>
          <Text style={styles.vehicleSubtitle}>{item.registration_number}</Text>
        </View>
        <View style={[styles.vehicleBadge, item.is_verified ? styles.verifiedBadge : styles.unverifiedBadge]}>
          <Text style={styles.badgeText}>{item.is_verified ? '✓ Verified' : 'Pending'}</Text>
        </View>
      </View>

      <View style={styles.vehicleDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Year</Text>
          <Text style={styles.detailValue}>{item.year}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Color</Text>
          <Text style={styles.detailValue}>{item.color}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Type</Text>
          <Text style={styles.detailValue}>{item.vehicle_type.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.vehicleActions}>
        <TouchableOpacity style={[styles.actionBtn, styles.viewBtn]}>
          <Text style={styles.viewBtnText}>View Details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => handleDeleteVehicle(item.vehicle_id)}
        >
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {expiringDocuments.length > 0 || expiringInsurance.length > 0 ? (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>⚠️ Action Required</Text>
          {expiringDocuments.length > 0 && (
            <Text style={styles.alertText}>{expiringDocuments.length} document(s) expiring soon</Text>
          )}
          {expiringInsurance.length > 0 && (
            <Text style={styles.alertText}>{expiringInsurance.length} insurance policy(ies) expiring</Text>
          )}
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Vehicles</Text>
        <Text style={styles.headerCount}>{vehicles.length} vehicles</Text>
      </View>

      {isLoading && vehicles.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      ) : vehicles.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🚗</Text>
          <Text style={styles.emptyTitle}>No Vehicles Added</Text>
          <Text style={styles.emptyText}>Add a vehicle to start driving</Text>
        </View>
      ) : (
        <FlatList
          data={vehicles}
          renderItem={renderVehicle}
          keyExtractor={(item) => item.vehicle_id}
          scrollEnabled={false}
          contentContainerStyle={styles.vehicleList}
        />
      )}

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary]}
        onPress={() => setShowAddModal(true)}
      >
        <Text style={styles.buttonText}>+ Add Vehicle</Text>
      </TouchableOpacity>

      <Modal visible={showAddModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.addVehicleModal}>
            <Text style={styles.modalTitle}>Add New Vehicle</Text>

            <TextInput
              style={styles.input}
              placeholder="Make (e.g., Maruti)"
              value={make}
              onChangeText={setMake}
              placeholderTextColor="#999"
            />

            <TextInput
              style={styles.input}
              placeholder="Model (e.g., Swift)"
              value={model}
              onChangeText={setModel}
              placeholderTextColor="#999"
            />

            <TextInput
              style={styles.input}
              placeholder="Year (e.g., 2022)"
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              placeholderTextColor="#999"
            />

            <TextInput
              style={styles.input}
              placeholder="Color"
              value={color}
              onChangeText={setColor}
              placeholderTextColor="#999"
            />

            <TextInput
              style={styles.input}
              placeholder="Registration Number"
              value={regNumber}
              onChangeText={setRegNumber}
              placeholderTextColor="#999"
            />

            <TextInput
              style={styles.input}
              placeholder="License Plate"
              value={licensePlate}
              onChangeText={setLicensePlate}
              placeholderTextColor="#999"
            />

            <View style={styles.typeSelection}>
              <Text style={styles.label}>Vehicle Type</Text>
              {['economy', 'premium', 'xl'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeOption,
                    vehicleType === type && styles.typeOptionSelected
                  ]}
                  onPress={() => setVehicleType(type)}
                >
                  <Text style={vehicleType === type ? styles.typeOptionTextSelected : styles.typeOptionText}>
                    {type.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleAddVehicle}
            >
              <Text style={styles.buttonText}>Add Vehicle</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setShowAddModal(false)}
            >
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

// ==================== DOCUMENT TRACKING SCREEN ====================

export const DocumentTrackingScreen: React.FC<{
  driverId: string;
  authToken: string;
}> = ({ driverId, authToken }) => {
  const { expiringDocuments, getExpiringDocuments } = useVehicleManagement(driverId, authToken);

  useEffect(() => {
    getExpiringDocuments();
  }, [driverId, authToken]);

  const getStatusColor = (daysToExpiry: number) => {
    if (daysToExpiry < 0) {return '#E53E3E';}
    if (daysToExpiry < 7) {return '#F59E0B';}
    if (daysToExpiry < 30) {return '#10B981';}
    return '#3B82F6';
  };

  const renderDocument = ({ item }: { item: any }) => (
    <View style={styles.documentCard}>
      <View style={[styles.documentType, { borderLeftColor: getStatusColor(item.days_to_expiry) }]}>
        <Text style={styles.documentTypeText}>{item.type.toUpperCase()}</Text>
        <Text style={styles.documentNumber}>{item.number}</Text>
      </View>

      <View style={styles.documentStatus}>
        {item.days_to_expiry < 0 ? (
          <Text style={styles.statusExpired}>EXPIRED</Text>
        ) : item.days_to_expiry < 7 ? (
          <Text style={styles.statusUrgent}>URGENT: {item.days_to_expiry} days</Text>
        ) : item.days_to_expiry < 30 ? (
          <Text style={styles.statusWarning}>EXPIRING: {item.days_to_expiry} days</Text>
        ) : (
          <Text style={styles.statusOK}>VALID: {item.days_to_expiry} days</Text>
        )}
      </View>

      <Text style={styles.expiryDate}>Expires: {new Date(item.expiry_date).toLocaleDateString()}</Text>

      <TouchableOpacity style={[styles.button, styles.renewBtn]}>
        <Text style={styles.renewBtnText}>Renew</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Document Tracking</Text>
        <Text style={styles.headerCount}>{expiringDocuments.length} documents</Text>
      </View>

      {expiringDocuments.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📄</Text>
          <Text style={styles.emptyTitle}>All Documents Valid</Text>
          <Text style={styles.emptyText}>All your documents are up to date</Text>
        </View>
      ) : (
        <FlatList
          data={expiringDocuments}
          renderItem={renderDocument}
          keyExtractor={(item) => item.document_id}
          scrollEnabled={true}
          contentContainerStyle={styles.documentList}
        />
      )}
    </View>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  alertBox: {
    backgroundColor: '#FEE',
    borderLeftWidth: 4,
    borderLeftColor: '#E53E3E',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 16
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#E53E3E',
    marginBottom: 4
  },
  alertText: {
    fontSize: 12,
    color: '#C53030'
  },
  header: {
    paddingVertical: 16
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333'
  },
  headerCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 4
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4
  },
  emptyText: {
    fontSize: 13,
    color: '#999'
  },
  vehicleList: {
    paddingVertical: 8
  },
  vehicleCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  vehicleTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333'
  },
  vehicleSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2
  },
  vehicleBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4
  },
  verifiedBadge: {
    backgroundColor: '#E8F5E9'
  },
  unverifiedBadge: {
    backgroundColor: '#FFF3E0'
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2E7D32'
  },
  vehicleDetails: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  detailLabel: {
    fontSize: 12,
    color: '#666'
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  vehicleActions: {
    flexDirection: 'row',
    gap: 8
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center'
  },
  viewBtn: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#1976D2'
  },
  viewBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2'
  },
  deleteBtn: {
    backgroundColor: '#FEE',
    borderWidth: 1,
    borderColor: '#E53E3E'
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E53E3E'
  },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  buttonPrimary: {
    backgroundColor: '#FF6B35'
  },
  buttonSecondary: {
    backgroundColor: '#E0E0E0'
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14
  },
  buttonSecondaryText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  addVehicleModal: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14
  },
  typeSelection: {
    marginBottom: 16
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10
  },
  typeOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    marginBottom: 8
  },
  typeOptionSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35'
  },
  typeOptionText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500'
  },
  typeOptionTextSelected: {
    color: '#FFF',
    fontWeight: '600'
  },
  documentList: {
    paddingVertical: 8
  },
  documentCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4
  },
  documentType: {
    borderLeftWidth: 4,
    paddingLeft: 12,
    marginBottom: 8
  },
  documentTypeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333'
  },
  documentNumber: {
    fontSize: 11,
    color: '#999',
    marginTop: 2
  },
  documentStatus: {
    marginBottom: 8
  },
  statusExpired: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#E53E3E'
  },
  statusUrgent: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F59E0B'
  },
  statusWarning: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981'
  },
  statusOK: {
    fontSize: 12,
    color: '#3B82F6'
  },
  expiryDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8
  },
  renewBtn: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingVertical: 8
  },
  renewBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981'
  }
});
