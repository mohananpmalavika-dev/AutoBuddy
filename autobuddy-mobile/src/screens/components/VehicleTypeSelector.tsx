/**
 * Vehicle Type Selector Component
 * Location: autobuddy-mobile/src/screens/components/VehicleTypeSelector.tsx
 *
 * Purpose: Allow users to select from 5 vehicle types for their booking
 */

import React, { useCallback, useEffect, useState } from 'react';
import { 
  View, 
  FlatList, 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ActivityIndicator,
  Image 
} from 'react-native';
import { vehicleTypesAPI } from '../../services/apiClient';

interface VehicleType {
  id: number | string;
  vehicle_type_name: string;
  category: string;
  capacity_passengers: number;
  estimated_fare_per_km: number;
  base_fare: number;
  image_url: string;
  description: string;
  is_active: boolean;
}

interface VehicleTypeSelectorProps {
  onSelect: (vehicleType: VehicleType) => void;
  selectedId?: number | string;
}

export const VehicleTypeSelector: React.FC<VehicleTypeSelectorProps> = ({
  onSelect,
  selectedId
}) => {
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicleTypes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await vehicleTypesAPI.getAllVehicleTypes({
        activeOnly: true
      });
      const nextVehicleTypes = Array.isArray(response)
        ? response
        : response.vehicle_types || response.data || [];
      
      setVehicleTypes(nextVehicleTypes);
    } catch (err) {
      setError('Failed to load vehicle types');
      console.error('Error fetching vehicle types:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchVehicleTypes();
    }, 0);
    return () => clearTimeout(timeout);
  }, [fetchVehicleTypes]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1F97D4" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Vehicle Type</Text>
      
      <FlatList
        data={vehicleTypes}
        keyExtractor={(item) => item.id.toString()}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.vehicleCard,
              selectedId?.toString() === item.id.toString() && styles.selectedCard
            ]}
            onPress={() => onSelect(item)}
            activeOpacity={0.7}
          >
            <Image
              source={{ uri: item.image_url }}
              style={styles.vehicleImage}
            />
            
            <Text style={styles.vehicleTypeText}>
              {item.vehicle_type_name}
            </Text>
            
            <Text style={styles.categoryText}>
              {item.category}
            </Text>
            
            <View style={styles.detailsRow}>
              <Text style={styles.detailLabel}>Passengers:</Text>
              <Text style={styles.detailValue}>
                {item.capacity_passengers}
              </Text>
            </View>
            
            <View style={styles.detailsRow}>
              <Text style={styles.detailLabel}>Base Fare:</Text>
              <Text style={styles.detailValue}>
                ₹{item.base_fare}
              </Text>
            </View>
            
            <View style={styles.detailsRow}>
              <Text style={styles.detailLabel}>₹/km:</Text>
              <Text style={styles.detailValue}>
                ₹{item.estimated_fare_per_km}
              </Text>
            </View>
            
            <Text style={styles.descriptionText}>
              {item.description}
            </Text>
            
            {selectedId?.toString() === item.id.toString() && (
              <View style={styles.selectedBadge}>
                <Text style={styles.selectedBadgeText}>✓ Selected</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 16,
    textAlign: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 0,
  },
  vehicleCard: {
    width: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  selectedCard: {
    borderColor: '#1F97D4',
    backgroundColor: '#F0F7FF',
  },
  vehicleImage: {
    width: '100%',
    height: 100,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#F5F5F5',
  },
  vehicleTypeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 8,
    fontWeight: '500',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 11,
    color: '#95A5A6',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 11,
    color: '#2C3E50',
    fontWeight: '600',
  },
  descriptionText: {
    fontSize: 10,
    color: '#7F8C8D',
    marginTop: 8,
    fontStyle: 'italic',
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#27AE60',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});
