import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { DriverLocation, RideTracking } from '../hooks/useRealtimeTracking';

interface LiveTrackingMapProps {
  driverLocation: DriverLocation;
  rideInfo: RideTracking;
  pickupLocation?: { latitude: number; longitude: number };
  dropoffLocation?: { latitude: number; longitude: number };
  onRideCancel: () => void;
  onCallDriver?: () => void;
}

export const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  driverLocation,
  rideInfo,
  pickupLocation,
  dropoffLocation,
  onRideCancel,
  onCallDriver,
}) => {
  const mapRef = useRef<MapView>(null);
  const [isAutoFollowEnabled, setIsAutoFollowEnabled] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [displayedLocation, setDisplayedLocation] = useState<DriverLocation | null>(driverLocation);
  const previousLocationRef = useRef<DriverLocation | null>(null);

  // Request location permission
  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (error) {
      console.error('Location permission error:', error);
    }
  };

  // Smooth location update animation
  useEffect(() => {
    if (!driverLocation) {return;}

    // Smooth transition between locations
    if (previousLocationRef.current) {
      const lat = previousLocationRef.current.latitude;
      const lng = previousLocationRef.current.longitude;
      const newLat = driverLocation.latitude;
      const newLng = driverLocation.longitude;

      // Interpolate between old and new position
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        setTimeout(() => {
          const progress = i / steps;
          setDisplayedLocation({
            ...driverLocation,
            latitude: lat + (newLat - lat) * progress,
            longitude: lng + (newLng - lng) * progress,
          });
        }, (i * 500) / steps);
      }
    } else {
      setDisplayedLocation(driverLocation);
    }

    previousLocationRef.current = driverLocation;
  }, [driverLocation]);

  // Auto-follow driver
  useEffect(() => {
    if (!isAutoFollowEnabled || !displayedLocation || !mapRef.current) {return;}

    // Validate coordinates before animating
    const lat = Number(displayedLocation.latitude);
    const lon = Number(displayedLocation.longitude);
    
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.warn('Invalid location coordinates for map animation:', displayedLocation);
      return;
    }

    mapRef.current.animateToRegion(
      {
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      500
    );
  }, [displayedLocation, isAutoFollowEnabled]);

  // Calculate route polyline
  const getRouteCoordinates = useCallback(() => {
    const route = [];

    if (pickupLocation) {
      route.push(pickupLocation);
    }

    if (displayedLocation) {
      route.push({
        latitude: displayedLocation.latitude,
        longitude: displayedLocation.longitude,
      });
    }

    if (dropoffLocation) {
      route.push(dropoffLocation);
    }

    return route;
  }, [pickupLocation, displayedLocation, dropoffLocation]);

  // Calculate ETA (placeholder - in real app, use routing service)
  const calculateETA = () => {
    if (!rideInfo?.eta) {return null;}

    const minutes = Math.ceil(rideInfo.eta / 60);
    if (minutes < 1) {return '< 1 min';}
    if (minutes === 1) {return '1 min';}
    return `${minutes} mins`;
  };

  const getInitialRegion = () => {
    if (displayedLocation) {
      return {
        latitude: displayedLocation.latitude,
        longitude: displayedLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    // Default to India
    return {
      latitude: 28.7041,
      longitude: 77.1025,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={getInitialRegion()}
        showsUserLocation={true}
        showsMyLocationButton={false}
        zoomControlEnabled={false}
      >
        {/* Pickup location marker */}
        {pickupLocation && (
          <Marker
            coordinate={pickupLocation}
            title="Pickup"
            pinColor="#FF6B6B"
          >
            <View style={styles.pickupMarker}>
              <MaterialIcons name="location-on" size={24} color="#FF6B6B" />
            </View>
          </Marker>
        )}

        {/* Dropoff location marker */}
        {dropoffLocation && (
          <Marker
            coordinate={dropoffLocation}
            title="Dropoff"
            pinColor="#4CAF50"
          >
            <View style={styles.dropoffMarker}>
              <MaterialIcons name="location-on" size={24} color="#4CAF50" />
            </View>
          </Marker>
        )}

        {/* Driver location marker with accuracy circle */}
        {displayedLocation && (
          <>
            {/* Accuracy circle */}
            <Circle
              center={{
                latitude: displayedLocation.latitude,
                longitude: displayedLocation.longitude,
              }}
              radius={displayedLocation.accuracy || 50}
              fillColor="rgba(33, 150, 243, 0.1)"
              strokeColor="rgba(33, 150, 243, 0.3)"
              strokeWidth={1}
            />

            {/* Driver marker */}
            <Marker
              coordinate={{
                latitude: displayedLocation.latitude,
                longitude: displayedLocation.longitude,
              }}
              title={rideInfo?.driver_name || 'Driver'}
              rotation={displayedLocation.heading || 0}
            >
              <DriverMarker
                name={rideInfo?.driver_name}
                rating={rideInfo?.driver_rating}
              />
            </Marker>
          </>
        )}

        {/* Route polyline */}
        {getRouteCoordinates().length > 1 && (
          <Polyline
            coordinates={getRouteCoordinates()}
            strokeColor="#2196F3"
            strokeWidth={3}
            lineDashPattern={[0]}
            geodesic={true}
          />
        )}
      </MapView>

      {/* Header Info Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerLeft}>
          <Text style={styles.driverName}>{rideInfo?.driver_name}</Text>
          <View style={styles.ratingContainer}>
            <MaterialIcons name="star" size={14} color="#FFB800" />
            <Text style={styles.rating}>{rideInfo?.driver_rating?.toFixed(1)}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.etaContainer}>
            <MaterialIcons name="timer" size={16} color="#666" />
            <Text style={styles.eta}>{calculateETA()}</Text>
          </View>
          <Pressable
            style={styles.callButton}
            onPress={onCallDriver}
          >
            <MaterialIcons name="phone" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Vehicle Info */}
      {rideInfo?.vehicle_info && (
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleLeft}>
            <MaterialIcons name="directions-car" size={24} color="#2196F3" />
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleModel}>{rideInfo.vehicle_info.model}</Text>
              <Text style={styles.vehicleNumber}>{rideInfo.vehicle_info.number}</Text>
            </View>
          </View>
          <View style={[styles.vehicleColor, { backgroundColor: rideInfo.vehicle_info.color }]} />
        </View>
      )}

      {/* Control Buttons */}
      <View style={styles.controlButtons}>
        <Pressable
          style={[styles.button, styles.followButton, !isAutoFollowEnabled && styles.buttonInactive]}
          onPress={() => setIsAutoFollowEnabled(!isAutoFollowEnabled)}
        >
          <MaterialIcons
            name={isAutoFollowEnabled ? 'my-location' : 'location-searching'}
            size={20}
            color={isAutoFollowEnabled ? '#2196F3' : '#999'}
          />
        </Pressable>

        <Pressable
          style={[styles.button, styles.cancelButton]}
          onPress={onRideCancel}
        >
          <MaterialIcons name="close" size={20} color="#F44336" />
        </Pressable>
      </View>

      {/* Loading Indicator */}
      {!displayedLocation && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Waiting for driver...</Text>
        </View>
      )}
    </View>
  );
};

/**
 * Driver Marker Component
 */
const DriverMarker: React.FC<{ name?: string; rating?: number }> = ({ name, rating }) => {
  return (
    <View style={styles.markerContainer}>
      <View style={styles.markerInner}>
        <MaterialIcons name="directions-car" size={18} color="#fff" />
      </View>
      <View style={styles.markerTail} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  headerCard: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rating: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  eta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCard: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  vehicleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  vehicleInfo: {
    gap: 2,
  },
  vehicleModel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  vehicleNumber: {
    fontSize: 12,
    color: '#999',
  },
  vehicleColor: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  controlButtons: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    gap: 8,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  followButton: {
    backgroundColor: '#E3F2FD',
  },
  cancelButton: {
    backgroundColor: '#FFEBEE',
  },
  buttonInactive: {
    opacity: 0.6,
  },
  markerContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#2196F3',
    marginTop: 2,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  pickupMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropoffMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LiveTrackingMap;
