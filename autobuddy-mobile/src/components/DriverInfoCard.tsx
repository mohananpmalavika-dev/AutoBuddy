import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
// BUG-024 FIX: Import image optimization utilities
import { ImageOptimization } from '../utils/performanceOptimizations';

export interface DriverInfo {
  id: string;
  name: string;
  photo?: string;
  rating: number;
  rideCount: number;
  vehicle: {
    make: string;
    model: string;
    licensePlate: string;
    color: string;
  };
  currentLocation?: {
    latitude: number;
    longitude: number;
  };
  eta?: number;
}

interface DriverInfoCardProps {
  driver: DriverInfo;
  onCall?: () => void;
  onMessage?: () => void;
  showEta?: boolean;
}

export function DriverInfoCard({
  driver,
  onCall,
  onMessage,
  showEta = true,
}: DriverInfoCardProps) {
  return (
    <View style={styles.container}>
      {/* Header with rating */}
      <View style={styles.header}>
        <View style={styles.driverInfo}>
          {/* BUG-024 FIX: Optimize image loading with thumbnail */}
          <Image
            source={{ uri: ImageOptimization.getThumbnailUri(driver.photo || 'https://via.placeholder.com/80') }}
            style={styles.avatar}
          />
          <View style={styles.driverDetails}>
            <Text style={styles.name}>{driver.name}</Text>
            <View style={styles.ratingRow}>
              <MaterialIcons name="star" size={16} color="#FFB800" />
              <Text style={styles.rating}>{driver.rating.toFixed(1)}</Text>
              <Text style={styles.rideCount}>({driver.rideCount} rides)</Text>
            </View>
          </View>
        </View>

        {showEta && driver.eta && (
          <View style={styles.etaBox}>
            <MaterialIcons name="schedule" size={16} color="#2196F3" />
            <Text style={styles.etaText}>{driver.eta} min</Text>
          </View>
        )}
      </View>

      {/* Vehicle info */}
      <View style={styles.vehicleSection}>
        <View style={styles.vehicleIcon}>
          <MaterialIcons name="directions-car" size={32} color="#2196F3" />
        </View>
        <View style={styles.vehicleDetails}>
          <Text style={styles.vehicleModel}>
            {driver.vehicle.make} {driver.vehicle.model}
          </Text>
          <Text style={styles.vehicleColor}>{driver.vehicle.color}</Text>
          <Text style={styles.licensePlate}>{driver.vehicle.licensePlate}</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionButtons}>
        <Pressable
          style={[styles.button, styles.callButton]}
          onPress={onCall}
        >
          <MaterialIcons name="call" size={20} color="#2196F3" />
          <Text style={styles.callButtonText}>CALL</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.messageButton]}
          onPress={onMessage}
        >
          <MaterialIcons name="message" size={20} color="#2196F3" />
          <Text style={styles.messageButtonText}>MESSAGE</Text>
        </Pressable>
      </View>

      {/* Safety info */}
      <View style={styles.safetyInfo}>
        <MaterialIcons name="verified" size={16} color="#4CAF50" />
        <Text style={styles.safetyText}>
          Verified driver • Share trip details with emergency contacts
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  driverDetails: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rating: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  rideCount: {
    fontSize: 13,
    color: '#999',
  },
  etaBox: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  etaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2196F3',
  },
  vehicleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  vehicleIcon: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  vehicleDetails: {
    flex: 1,
  },
  vehicleModel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  vehicleColor: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  licensePlate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2196F3',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  callButton: {
    backgroundColor: '#E3F2FD',
  },
  callButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2196F3',
  },
  messageButton: {
    backgroundColor: '#E3F2FD',
  },
  messageButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2196F3',
  },
  safetyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F8E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 8,
  },
  safetyText: {
    fontSize: 12,
    color: '#558B2F',
    flex: 1,
  },
});
