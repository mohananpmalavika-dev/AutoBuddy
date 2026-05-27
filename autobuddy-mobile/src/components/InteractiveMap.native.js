import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { COLORS, SHADOWS } from '../theme';
import { reverseGeocodeLocation } from '../lib/places';

// Default region: Kochi, India
const DEFAULT_REGION = {
  latitude: 9.9312,
  longitude: 76.2673,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
    ...SHADOWS.sm,
  },
  mapWrapper: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    width: '100%',
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  instructionRow: {
    padding: 8,
    paddingTop: 4,
    backgroundColor: '#FFF9E6',
    borderTopWidth: 1,
    borderTopColor: '#FFE0B2',
  },
  instructionText: {
    fontSize: 11,
    color: '#F57C00',
    fontWeight: '500',
  },
  markerInfo: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  markerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  markerAddress: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  markerCoords: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
  buttonRow: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});

export default function InteractiveMap({
  pickupLocation = null,
  dropoffLocation = null,
  selectingPoint = null,
  onLocationSelect = () => {},
  center = null,
  style = styles.container,
  isLoading = false,
}) {
  const mapRef = useRef(null);
  const [pickupMarkerPos, setPickupMarkerPos] = useState(
    pickupLocation ? { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude } : null,
  );
  const [dropoffMarkerPos, setDropoffMarkerPos] = useState(
    dropoffLocation ? { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude } : null,
  );
  const [pickupAddress, setPickupAddress] = useState(pickupLocation?.address || '');
  const [dropoffAddress, setDropoffAddress] = useState(dropoffLocation?.address || '');
  const [geocodingPickup, setGeocodingPickup] = useState(false);
  const [geocodingDropoff, setGeocodingDropoff] = useState(false);

  // Compute map region
  const mapRegion = useMemo(() => {
    if (center) {
      return {
        latitude: Number(center.latitude || center.lat),
        longitude: Number(center.longitude || center.lng),
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    if (pickupMarkerPos && dropoffMarkerPos) {
      const avgLat = (pickupMarkerPos.latitude + dropoffMarkerPos.latitude) / 2;
      const avgLng = (pickupMarkerPos.longitude + dropoffMarkerPos.longitude) / 2;
      const deltaLat = Math.abs(pickupMarkerPos.latitude - dropoffMarkerPos.latitude) + 0.01;
      const deltaLng = Math.abs(pickupMarkerPos.longitude - dropoffMarkerPos.longitude) + 0.01;
      return {
        latitude: avgLat,
        longitude: avgLng,
        latitudeDelta: deltaLat * 1.5,
        longitudeDelta: deltaLng * 1.5,
      };
    }
    if (pickupMarkerPos) {
      return {
        latitude: pickupMarkerPos.latitude,
        longitude: pickupMarkerPos.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    if (dropoffMarkerPos) {
      return {
        latitude: dropoffMarkerPos.latitude,
        longitude: dropoffMarkerPos.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    return DEFAULT_REGION;
  }, [center, pickupMarkerPos, dropoffMarkerPos]);

  // Reverse geocode location when marker is placed
  const reverseGeocodeMarker = useCallback(async (lat, lng, setAddress, setGeocoding) => {
    setGeocoding(true);
    try {
      const address = await reverseGeocodeLocation(lat, lng);
      if (address) {
        setAddress(address);
      } else {
        setAddress(`Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`);
      }
    } catch (_err) {
      // Fallback to coordinate-based address
      setAddress(`Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`);
    } finally {
      setGeocoding(false);
    }
  }, []);

  // Handle map press to select pickup/dropoff
  const handleMapPress = useCallback(
    (e) => {
      const lat = e.nativeEvent.coordinate.latitude;
      const lng = e.nativeEvent.coordinate.longitude;

      if (!pickupMarkerPos) {
        // Selecting pickup location
        setPickupMarkerPos({ latitude: lat, longitude: lng });
        reverseGeocodeMarker(lat, lng, setPickupAddress, setGeocodingPickup);
        onLocationSelect('pickup', {
          latitude: lat,
          longitude: lng,
          address: `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`,
        });
      } else if (!dropoffMarkerPos) {
        // Selecting dropoff location
        setDropoffMarkerPos({ latitude: lat, longitude: lng });
        reverseGeocodeMarker(lat, lng, setDropoffAddress, setGeocodingDropoff);
        onLocationSelect('dropoff', {
          latitude: lat,
          longitude: lng,
          address: `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`,
        });
      }
    },
    [pickupMarkerPos, dropoffMarkerPos, onLocationSelect, reverseGeocodeMarker],
  );

  // Handle marker drag end to refine location
  const handleMarkerDragEnd = useCallback(
    (markerId, e) => {
      const lat = e.nativeEvent.coordinate.latitude;
      const lng = e.nativeEvent.coordinate.longitude;

      if (markerId === 'pickup') {
        setPickupMarkerPos({ latitude: lat, longitude: lng });
        reverseGeocodeMarker(lat, lng, setPickupAddress, setGeocodingPickup);
        onLocationSelect('pickup', {
          latitude: lat,
          longitude: lng,
          address: pickupAddress,
        });
      } else if (markerId === 'dropoff') {
        setDropoffMarkerPos({ latitude: lat, longitude: lng });
        reverseGeocodeMarker(lat, lng, setDropoffAddress, setGeocodingDropoff);
        onLocationSelect('dropoff', {
          latitude: lat,
          longitude: lng,
          address: dropoffAddress,
        });
      }
    },
    [onLocationSelect, reverseGeocodeMarker, pickupAddress, dropoffAddress],
  );

  // Reset location selection
  const handleReset = useCallback(() => {
    setPickupMarkerPos(null);
    setDropoffMarkerPos(null);
    setPickupAddress('');
    setDropoffAddress('');
  }, []);

  // Zoom to fit both markers
  const handleZoomToFit = useCallback(() => {
    if (!mapRef.current || (!pickupMarkerPos && !dropoffMarkerPos)) {
      return;
    }

    const coordinates = [];
    if (pickupMarkerPos) {
      coordinates.push({
        latitude: pickupMarkerPos.latitude,
        longitude: pickupMarkerPos.longitude,
      });
    }
    if (dropoffMarkerPos) {
      coordinates.push({
        latitude: dropoffMarkerPos.latitude,
        longitude: dropoffMarkerPos.longitude,
      });
    }

    if (coordinates.length > 0) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  }, [pickupMarkerPos, dropoffMarkerPos]);

  return (
    <View style={style}>
      <View style={styles.buttonRow}>
        <Text style={styles.instructionText}>
          {!pickupMarkerPos ? '📍 Tap map to select pickup' : !dropoffMarkerPos ? '📍 Tap map to select dropoff' : '✓ Both locations selected'}
        </Text>
        {(pickupMarkerPos || dropoffMarkerPos) && (
          <TouchableOpacity style={styles.button} onPress={handleReset}>
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          region={mapRegion}
          onRegionChangeComplete={(region) => {
            // Allow map to update region
          }}
          onPress={handleMapPress}
          scrollEnabled={true}
          zoomEnabled={true}
          showsUserLocation={false}>
          {pickupMarkerPos && (
            <Marker
              coordinate={pickupMarkerPos}
              title="Pickup Location"
              description={pickupAddress}
              draggable={true}
              onDragEnd={(e) => handleMarkerDragEnd('pickup', e)}
              pinColor="#FF5252"
            />
          )}

          {dropoffMarkerPos && (
            <Marker
              coordinate={dropoffMarkerPos}
              title="Dropoff Location"
              description={dropoffAddress}
              draggable={true}
              onDragEnd={(e) => handleMarkerDragEnd('dropoff', e)}
              pinColor="#4CAF50"
            />
          )}
        </MapView>
      </View>

      {(pickupMarkerPos || dropoffMarkerPos) && (
        <View style={styles.markerInfo}>
          {pickupMarkerPos && (
            <>
              <Text style={styles.markerLabel}>📍 Pickup Location</Text>
              {geocodingPickup && <ActivityIndicator color={COLORS.primary} size="small" />}
              {!geocodingPickup && (
                <>
                  <Text style={styles.markerAddress}>{pickupAddress}</Text>
                  <Text style={styles.markerCoords}>
                    Lat {pickupMarkerPos.latitude.toFixed(6)}, Lng {pickupMarkerPos.longitude.toFixed(6)}
                  </Text>
                </>
              )}
            </>
          )}
          {dropoffMarkerPos && (
            <>
              <Text style={[styles.markerLabel, { marginTop: pickupMarkerPos ? 8 : 0 }]}>📍 Dropoff Location</Text>
              {geocodingDropoff && <ActivityIndicator color={COLORS.primary} size="small" />}
              {!geocodingDropoff && (
                <>
                  <Text style={styles.markerAddress}>{dropoffAddress}</Text>
                  <Text style={styles.markerCoords}>
                    Lat {dropoffMarkerPos.latitude.toFixed(6)}, Lng {dropoffMarkerPos.longitude.toFixed(6)}
                  </Text>
                </>
              )}
            </>
          )}
        </View>
      )}

      {(pickupMarkerPos || dropoffMarkerPos) && (
        <View style={styles.buttonRow}>
          {pickupMarkerPos && dropoffMarkerPos && (
            <TouchableOpacity style={styles.button} onPress={handleZoomToFit}>
              <Text style={styles.buttonText}>Fit Map</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.instructionRow}>
        <Text style={styles.instructionText}>💡 Tip: You can drag markers to refine the location selection</Text>
      </View>
    </View>
  );
}
