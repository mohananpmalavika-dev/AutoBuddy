import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GoogleMap, Marker, LoadScript } from '@react-google-maps/api';
import { COLORS, SHADOWS } from '../theme';
import { reverseGeocodeLocation } from '../lib/places';

// Default center: Kochi, India
const DEFAULT_CENTER = { lat: 9.9312, lng: 76.2673 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '300px' };
const DEFAULT_ZOOM = 14;

// Marker icons configuration
const PICKUP_MARKER_ICON = {
  path: 'M12 0C5.383 0 0 5.383 0 12s5.383 12 12 12 12-5.383 12-12S18.617 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6zm0-10c-2.208 0-4 1.792-4 4s1.792 4 4 4 4-1.792 4-4-1.792-4-4-4z',
  fillColor: '#FF5252',
  fillOpacity: 1,
  scale: 1.5,
  strokeColor: '#FFFFFF',
  strokeWeight: 2,
  anchor: { x: 12, y: 24 },
};

const DROPOFF_MARKER_ICON = {
  path: 'M12 0C5.383 0 0 5.383 0 12s5.383 12 12 12 12-5.383 12-12S18.617 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6zm0-10c-2.208 0-4 1.792-4 4s1.792 4 4 4 4-1.792 4-4-1.792-4-4-4z',
  fillColor: '#4CAF50',
  fillOpacity: 1,
  scale: 1.5,
  strokeColor: '#FFFFFF',
  strokeWeight: 2,
  anchor: { x: 12, y: 24 },
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
  toggleButtonRow: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
  toggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  zoomControlsRow: {
    paddingHorizontal: 8,
    paddingTop: 8,
    flexDirection: 'row',
    gap: 6,
  },
  zoomButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  zoomButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});

export default function InteractiveMap({
  apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  pickupLocation = null,
  dropoffLocation = null,
  selectingPoint = null,
  onLocationSelect = () => {},
  onLocationsReset = null,
  center = null,
  style = styles.container,
  isLoading = false,
}) {
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pickupMarkerPos, setPickupMarkerPos] = useState(
    pickupLocation ? { lat: pickupLocation.latitude, lng: pickupLocation.longitude } : null,
  );
  const [dropoffMarkerPos, setDropoffMarkerPos] = useState(
    dropoffLocation ? { lat: dropoffLocation.latitude, lng: dropoffLocation.longitude } : null,
  );
  const [pickupAddress, setPickupAddress] = useState(pickupLocation?.address || '');
  const [dropoffAddress, setDropoffAddress] = useState(dropoffLocation?.address || '');
  const [geocodingPickup, setGeocodingPickup] = useState(false);
  const [geocodingDropoff, setGeocodingDropoff] = useState(false);
  const controlledPickupMarkerPos = useMemo(
    () => (
      pickupLocation
        ? { lat: Number(pickupLocation.latitude), lng: Number(pickupLocation.longitude) }
        : null
    ),
    [pickupLocation],
  );
  const controlledDropoffMarkerPos = useMemo(
    () => (
      dropoffLocation
        ? { lat: Number(dropoffLocation.latitude), lng: Number(dropoffLocation.longitude) }
        : null
    ),
    [dropoffLocation],
  );
  const activePickupMarkerPos = controlledPickupMarkerPos || pickupMarkerPos;
  const activeDropoffMarkerPos = controlledDropoffMarkerPos || dropoffMarkerPos;
  const activePickupAddress = pickupLocation?.address || pickupAddress;
  const activeDropoffAddress = dropoffLocation?.address || dropoffAddress;

  // Compute map center
  const mapCenter = useMemo(() => {
    if (center) {
      return { lat: Number(center.lat || center.latitude), lng: Number(center.lng || center.longitude) };
    }
    if (activePickupMarkerPos && activeDropoffMarkerPos) {
      return {
        lat: (activePickupMarkerPos.lat + activeDropoffMarkerPos.lat) / 2,
        lng: (activePickupMarkerPos.lng + activeDropoffMarkerPos.lng) / 2,
      };
    }
    if (activePickupMarkerPos) {
      return activePickupMarkerPos;
    }
    if (activeDropoffMarkerPos) {
      return activeDropoffMarkerPos;
    }
    return DEFAULT_CENTER;
  }, [center, activePickupMarkerPos, activeDropoffMarkerPos]);

  // Reverse geocode location when marker moves
  const reverseGeocodeMarker = useCallback(async (lat, lng, setAddress, setGeocoding) => {
    setGeocoding(true);
    try {
      const address = await reverseGeocodeLocation(lat, lng);
      if (address) {
        setAddress(address);
      }
    } catch (_err) {
      // Fallback to coordinate-based address
      setAddress(`Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`);
    } finally {
      setGeocoding(false);
    }
  }, []);

  // Handle map click to select pickup/dropoff
  const handleMapClick = useCallback(
    (e) => {
      if (!mapRef.current) {
        return;
      }
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      const targetPoint = selectingPoint || (!activePickupMarkerPos ? 'pickup' : !activeDropoffMarkerPos ? 'dropoff' : null);

      if (targetPoint === 'pickup') {
        // Selecting pickup location
        setPickupMarkerPos({ lat, lng });
        reverseGeocodeMarker(lat, lng, setPickupAddress, setGeocodingPickup);
        onLocationSelect('pickup', {
          latitude: lat,
          longitude: lng,
          address: `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`,
        });
      } else if (targetPoint === 'dropoff') {
        // Selecting dropoff location
        setDropoffMarkerPos({ lat, lng });
        reverseGeocodeMarker(lat, lng, setDropoffAddress, setGeocodingDropoff);
        onLocationSelect('dropoff', {
          latitude: lat,
          longitude: lng,
          address: `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`,
        });
      }
    },
    [selectingPoint, activePickupMarkerPos, activeDropoffMarkerPos, onLocationSelect, reverseGeocodeMarker],
  );

  // Handle marker drag end (refine location)
  const handleMarkerDragEnd = useCallback(
    (markerId, e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      if (markerId === 'pickup') {
        setPickupMarkerPos({ lat, lng });
        reverseGeocodeMarker(lat, lng, setPickupAddress, setGeocodingPickup);
        onLocationSelect('pickup', {
          latitude: lat,
          longitude: lng,
          address: activePickupAddress || `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`,
        });
      } else if (markerId === 'dropoff') {
        setDropoffMarkerPos({ lat, lng });
        reverseGeocodeMarker(lat, lng, setDropoffAddress, setGeocodingDropoff);
        onLocationSelect('dropoff', {
          latitude: lat,
          longitude: lng,
          address: activeDropoffAddress || `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`,
        });
      }
    },
    [onLocationSelect, reverseGeocodeMarker, activePickupAddress, activeDropoffAddress],
  );

  // Reset location selection
  const handleReset = useCallback(() => {
    setPickupMarkerPos(null);
    setDropoffMarkerPos(null);
    setPickupAddress('');
    setDropoffAddress('');
    onLocationsReset?.();
  }, [onLocationsReset]);

  // Zoom to fit markers
  const handleZoomToFit = useCallback(() => {
    if (!mapRef.current || (!activePickupMarkerPos && !activeDropoffMarkerPos)) {
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    if (activePickupMarkerPos) {
      bounds.extend(new window.google.maps.LatLng(activePickupMarkerPos.lat, activePickupMarkerPos.lng));
    }
    if (activeDropoffMarkerPos) {
      bounds.extend(new window.google.maps.LatLng(activeDropoffMarkerPos.lat, activeDropoffMarkerPos.lng));
    }
    mapRef.current.fitBounds(bounds);
  }, [activePickupMarkerPos, activeDropoffMarkerPos]);

  // Zoom controls
  const handleZoom = useCallback(
    (direction) => {
      if (!mapRef.current) {
        return;
      }
      const currentZoom = mapRef.current.getZoom();
      const newZoom = direction === 'in' ? currentZoom + 1 : Math.max(currentZoom - 1, 1);
      mapRef.current.setZoom(newZoom);
    },
    [],
  );

  if (!apiKey) {
    return (
      <View style={style}>
        <View style={styles.mapWrapper}>
          <View style={styles.loadingContainer}>
            <Text style={styles.instructionText}>Google Maps API key not configured</Text>
          </View>
        </View>
      </View>
    );
  }

  if (loadFailed) {
    return (
      <View style={style}>
        <View style={styles.mapWrapper}>
          <View style={styles.loadingContainer}>
            <Text style={styles.instructionText}>Failed to load map. Please try again.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={style}>
      <LoadScript googleMapsApiKey={apiKey} onLoad={() => setMapReady(true)} onError={() => setLoadFailed(true)}>
        {!mapReady ? (
          <View style={styles.mapWrapper}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.toggleButtonRow}>
              <Text style={styles.instructionText}>
                {!activePickupMarkerPos ? '📍 Tap map to select pickup' : !activeDropoffMarkerPos ? '📍 Tap map to select dropoff' : '✓ Both locations selected'}
              </Text>
              {(activePickupMarkerPos || activeDropoffMarkerPos) && (
                <TouchableOpacity style={styles.toggleButton} onPress={handleReset}>
                  <Text style={styles.toggleButtonText}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            <GoogleMap
              ref={mapRef}
              mapContainerStyle={MAP_CONTAINER_STYLE}
              center={mapCenter}
              zoom={DEFAULT_ZOOM}
              onClick={handleMapClick}
              options={{
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
              }}>
              {activePickupMarkerPos && (
                <Marker
                  position={activePickupMarkerPos}
                  icon={PICKUP_MARKER_ICON}
                  draggable={true}
                  onDragEnd={(e) => handleMarkerDragEnd('pickup', e)}
                  title={activePickupAddress || 'Pickup Location'}
                />
              )}

              {activeDropoffMarkerPos && (
                <Marker
                  position={activeDropoffMarkerPos}
                  icon={DROPOFF_MARKER_ICON}
                  draggable={true}
                  onDragEnd={(e) => handleMarkerDragEnd('dropoff', e)}
                  title={activeDropoffAddress || 'Dropoff Location'}
                />
              )}
            </GoogleMap>

            {(activePickupMarkerPos || activeDropoffMarkerPos) && (
              <View style={styles.markerInfo}>
                {activePickupMarkerPos && (
                  <>
                    <Text style={styles.markerLabel}>📍 Pickup Location</Text>
                    {geocodingPickup && <ActivityIndicator color={COLORS.primary} size="small" />}
                    {!geocodingPickup && (
                      <>
                        <Text style={styles.markerAddress}>{activePickupAddress}</Text>
                        <Text style={styles.markerCoords}>Lat {activePickupMarkerPos.lat.toFixed(6)}, Lng {activePickupMarkerPos.lng.toFixed(6)}</Text>
                      </>
                    )}
                  </>
                )}
                {activeDropoffMarkerPos && (
                  <>
                    <Text style={[styles.markerLabel, { marginTop: activePickupMarkerPos ? 8 : 0 }]}>📍 Dropoff Location</Text>
                    {geocodingDropoff && <ActivityIndicator color={COLORS.primary} size="small" />}
                    {!geocodingDropoff && (
                      <>
                        <Text style={styles.markerAddress}>{activeDropoffAddress}</Text>
                        <Text style={styles.markerCoords}>Lat {activeDropoffMarkerPos.lat.toFixed(6)}, Lng {activeDropoffMarkerPos.lng.toFixed(6)}</Text>
                      </>
                    )}
                  </>
                )}
              </View>
            )}

            {(activePickupMarkerPos || activeDropoffMarkerPos) && (
              <View style={styles.zoomControlsRow}>
                <TouchableOpacity style={styles.zoomButton} onPress={() => handleZoom('in')}>
                  <Text style={styles.zoomButtonText}>+ Zoom In</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoomButton} onPress={() => handleZoom('out')}>
                  <Text style={styles.zoomButtonText}>- Zoom Out</Text>
                </TouchableOpacity>
                {activePickupMarkerPos && activeDropoffMarkerPos && (
                  <TouchableOpacity style={styles.zoomButton} onPress={handleZoomToFit}>
                    <Text style={styles.zoomButtonText}>Fit Map</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.instructionRow}>
              <Text style={styles.instructionText}>
                💡 Tip: You can drag markers to refine the location selection
              </Text>
            </View>
          </>
        )}
      </LoadScript>
    </View>
  );
}
