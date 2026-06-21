import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { COLORS, SHADOWS } from '../theme';
import { reverseGeocodeLocation } from '../lib/places';

const DEFAULT_CENTER = [9.9312, 76.2673];
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Fix Leaflet default marker icon
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom marker icons
const PICKUP_ICON = L.divIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
    <path d="M17 42C14.2 37.9 3 25.8 3 15.9C3 7.7 9.3 2 17 2C24.7 2 31 7.7 31 15.9C31 25.8 19.8 37.9 17 42Z" fill="#E53935" stroke="#FFFFFF" stroke-width="3"/>
    <circle cx="17" cy="16" r="6" fill="rgba(255,255,255,0.24)"/>
    <text x="17" y="20" text-anchor="middle" fill="white" font-size="13" font-weight="800">P</text>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 42],
  popupAnchor: [0, -42],
});

const DROPOFF_ICON = L.divIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
    <path d="M17 42C14.2 37.9 3 25.8 3 15.9C3 7.7 9.3 2 17 2C24.7 2 31 7.7 31 15.9C31 25.8 19.8 37.9 17 42Z" fill="#1E88E5" stroke="#FFFFFF" stroke-width="3"/>
    <circle cx="17" cy="16" r="6" fill="rgba(255,255,255,0.24)"/>
    <text x="17" y="20" text-anchor="middle" fill="white" font-size="13" font-weight="800">D</text>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 42],
  popupAnchor: [0, -42],
});

// Map center controller - re-centers when center prop changes
function MapCenterUpdater({ center }) {
  const map = useMap();
  React.useEffect(() => {
    if (center) {
      map.setView([center.lat || center.latitude, center.lng || center.longitude], map.getZoom());
    }
  }, [map, center]);
  return null;
}

// Click handler for selecting locations
function MapClickHandler({ enabled, selectingPoint, onLocationSelect }) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      onLocationSelect?.(selectingPoint || 'pickup', { latitude: lat, longitude: lng, address: `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}` });
    },
  });
  return null;
}

// Draggable marker wrapper
function DraggableMarker({ position, icon, type, onDragEnd }) {
  const markerRef = useRef(null);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const latlng = marker.getLatLng();
          onDragEnd?.(type, { latitude: latlng.lat, longitude: latlng.lng });
        }
      },
    }),
    [type, onDragEnd],
  );

  if (!position) return null;

  return (
    <Marker
      ref={markerRef}
      position={[position.lat || position.latitude, position.lng || position.longitude]}
      icon={icon}
      draggable={true}
      eventHandlers={eventHandlers}
    />
  );
}

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

export default function WebInteractiveMap({
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
    () =>
      pickupLocation
        ? { lat: Number(pickupLocation.latitude), lng: Number(pickupLocation.longitude) }
        : null,
    [pickupLocation],
  );
  const controlledDropoffMarkerPos = useMemo(
    () =>
      dropoffLocation
        ? { lat: Number(dropoffLocation.latitude), lng: Number(dropoffLocation.longitude) }
        : null,
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
    if (activePickupMarkerPos) return activePickupMarkerPos;
    if (activeDropoffMarkerPos) return activeDropoffMarkerPos;
    return { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
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
      setAddress(`Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`);
    } finally {
      setGeocoding(false);
    }
  }, []);

  // Handle location selection from map click
  const handleLocationSelect = useCallback(
    (point, location) => {
      const lat = location.latitude;
      const lng = location.longitude;

      if (point === 'pickup') {
        setPickupMarkerPos({ lat, lng });
        reverseGeocodeMarker(lat, lng, setPickupAddress, setGeocodingPickup);
        onLocationSelect('pickup', { latitude: lat, longitude: lng, address: `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}` });
      } else if (point === 'dropoff') {
        setDropoffMarkerPos({ lat, lng });
        reverseGeocodeMarker(lat, lng, setDropoffAddress, setGeocodingDropoff);
        onLocationSelect('dropoff', { latitude: lat, longitude: lng, address: `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}` });
      }
    },
    [onLocationSelect, reverseGeocodeMarker],
  );

  // Handle marker drag end
  const handleMarkerDragEnd = useCallback(
    (markerId, coord) => {
      const lat = coord.latitude;
      const lng = coord.longitude;

      if (markerId === 'pickup') {
        setPickupMarkerPos({ lat, lng });
        reverseGeocodeMarker(lat, lng, setPickupAddress, setGeocodingPickup);
        onLocationSelect('pickup', { latitude: lat, longitude: lng, address: activePickupAddress || `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}` });
      } else if (markerId === 'dropoff') {
        setDropoffMarkerPos({ lat, lng });
        reverseGeocodeMarker(lat, lng, setDropoffAddress, setGeocodingDropoff);
        onLocationSelect('dropoff', { latitude: lat, longitude: lng, address: activeDropoffAddress || `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}` });
      }
    },
    [onLocationSelect, reverseGeocodeMarker, activePickupAddress, activeDropoffAddress],
  );

  // Reset
  const handleReset = useCallback(() => {
    setPickupMarkerPos(null);
    setDropoffMarkerPos(null);
    setPickupAddress('');
    setDropoffAddress('');
    onLocationsReset?.();
  }, [onLocationsReset]);

  return (
    <View style={style}>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <View style={styles.toggleButtonRow}>
        <Text style={styles.instructionText}>
          {!activePickupMarkerPos
            ? '📍 Tap map to select pickup'
            : !activeDropoffMarkerPos
              ? '📍 Tap map to select dropoff'
              : '✓ Both locations selected'}
        </Text>
        {(activePickupMarkerPos || activeDropoffMarkerPos) && (
          <TouchableOpacity style={styles.toggleButton} onPress={handleReset}>
            <Text style={styles.toggleButtonText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.mapWrapper}>
        {!mapReady && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        )}
        <div style={{ width: '100%', height: '100%', display: mapReady ? 'block' : 'none' }}>
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={14}
            style={{ width: '100%', height: '300px' }}
            scrollWheelZoom={true}
            whenReady={() => setMapReady(true)}
          >
            <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
            <MapCenterUpdater center={mapCenter} />

            <MapClickHandler
              enabled={!selectingPoint || !activePickupMarkerPos || !activeDropoffMarkerPos}
              selectingPoint={selectingPoint}
              onLocationSelect={handleLocationSelect}
            />

            {activePickupMarkerPos && (
              <DraggableMarker
                position={activePickupMarkerPos}
                icon={PICKUP_ICON}
                type="pickup"
                onDragEnd={handleMarkerDragEnd}
              />
            )}
            {activeDropoffMarkerPos && (
              <DraggableMarker
                position={activeDropoffMarkerPos}
                icon={DROPOFF_ICON}
                type="dropoff"
                onDragEnd={handleMarkerDragEnd}
              />
            )}
          </MapContainer>
        </div>
      </View>

      {(activePickupMarkerPos || activeDropoffMarkerPos) && (
        <View style={styles.markerInfo}>
          {activePickupMarkerPos && (
            <>
              <Text style={styles.markerLabel}>📍 Pickup Location</Text>
              {geocodingPickup && <ActivityIndicator color={COLORS.primary} size="small" />}
              {!geocodingPickup && (
                <>
                  <Text style={styles.markerAddress}>{activePickupAddress}</Text>
                  <Text style={styles.markerCoords}>
                    Lat {activePickupMarkerPos.lat.toFixed(6)}, Lng {activePickupMarkerPos.lng.toFixed(6)}
                  </Text>
                </>
              )}
            </>
          )}
          {activeDropoffMarkerPos && (
            <>
              <Text style={[styles.markerLabel, { marginTop: activePickupMarkerPos ? 8 : 0 }]}>
                📍 Dropoff Location
              </Text>
              {geocodingDropoff && <ActivityIndicator color={COLORS.primary} size="small" />}
              {!geocodingDropoff && (
                <>
                  <Text style={styles.markerAddress}>{activeDropoffAddress}</Text>
                  <Text style={styles.markerCoords}>
                    Lat {activeDropoffMarkerPos.lat.toFixed(6)}, Lng {activeDropoffMarkerPos.lng.toFixed(6)}
                  </Text>
                </>
              )}
            </>
          )}
        </View>
      )}

      <View style={styles.instructionRow}>
        <Text style={styles.instructionText}>💡 Tip: You can drag markers to refine the location selection</Text>
      </View>
    </View>
  );
}
