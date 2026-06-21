import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const DEFAULT_ZOOM = 14;
const MARKER_COLORS = {
  pickup: '#E53935',
  dropoff: '#1E88E5',
  driver: '#0B8F3A',
};
const MARKER_Z_INDEX = {
  pickup: 20,
  dropoff: 10,
  driver: 30,
};
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Fix Leaflet default marker icon issue
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

// Custom SVG marker icons
function createMarkerIcon(color, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
      <path d="M17 42C14.2 37.9 3 25.8 3 15.9C3 7.7 9.3 2 17 2C24.7 2 31 7.7 31 15.9C31 25.8 19.8 37.9 17 42Z" fill="${color}" stroke="#FFFFFF" stroke-width="3"/>
      <circle cx="17" cy="16" r="6" fill="rgba(255,255,255,0.24)"/>
      <text x="17" y="19" text-anchor="middle" fill="white" font-size="12" font-weight="800">${label}</text>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [34, 44],
    iconAnchor: [17, 42],
    popupAnchor: [0, -42],
  });
}

const PICKUP_ICON = createMarkerIcon(MARKER_COLORS.pickup, 'P');
const DROPOFF_ICON = createMarkerIcon(MARKER_COLORS.dropoff, 'D');
const DRIVER_ICON = createMarkerIcon(MARKER_COLORS.driver, 'R');

function normalizeCoords(location) {
  if (!location) return null;
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function MapBoundsUpdater({ points }) {
  const map = useMap();
  useEffect(() => {
    const validPoints = points.filter(Boolean);
    if (validPoints.length < 2) return;
    const bounds = L.latLngBounds([]);
    validPoints.forEach((p) => bounds.extend([p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [56, 56] });
  }, [map, points]);
  return null;
}

function MapClickHandler({ isInteractiveMode, onMapPress }) {
  useMapEvents({
    click(e) {
      if (!isInteractiveMode || !onMapPress) return;
      onMapPress({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

function DraggableMarkerWrapper({ position, icon, onDragEnd, title, children }) {
  const [draggedPos, setDraggedPos] = useState(position);
  const markerRef = useRef(null);

  useEffect(() => {
    setDraggedPos(position);
  }, [position]);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const latlng = marker.getLatLng();
          const coord = { latitude: latlng.lat, longitude: latlng.lng };
          setDraggedPos([latlng.lat, latlng.lng]);
          onDragEnd?.(coord);
        }
      },
    }),
    [onDragEnd],
  );

  if (!draggedPos) return null;

  return (
    <Marker
      ref={markerRef}
      position={[draggedPos.latitude || draggedPos.lat, draggedPos.longitude || draggedPos.lng]}
      icon={icon}
      draggable={!!onDragEnd}
      eventHandlers={eventHandlers}
      title={title}
    >
      {children}
    </Marker>
  );
}

export default function WebLeafletMap({
  title,
  mapStyle,
  defaultCenter,
  pickupLocation = null,
  dropoffLocation = null,
  driverLocation = null,
  routeOrigin = null,
  routeDestination = null,
  isInteractiveMode = false,
  onMapPress = null,
  onMarkerDragEnd = null,
  selectingPoint = null,
  showStatusOverlay = true,
}) {
  const [mapReady, setMapReady] = useState(false);

  const defaultCenterPoint = useMemo(() => normalizeCoords(defaultCenter), [defaultCenter]);
  const pickupPoint = useMemo(() => normalizeCoords(pickupLocation), [pickupLocation]);
  const dropoffPoint = useMemo(() => normalizeCoords(dropoffLocation), [dropoffLocation]);
  const driverPoint = useMemo(() => normalizeCoords(driverLocation), [driverLocation]);
  const routeOriginPoint = useMemo(() => normalizeCoords(routeOrigin), [routeOrigin]);
  const routeDestinationPoint = useMemo(() => normalizeCoords(routeDestination), [routeDestination]);

  const center = useMemo(() => {
    const point = defaultCenterPoint || { latitude: 13.0827, longitude: 80.2707 };
    return [point.latitude, point.longitude];
  }, [defaultCenterPoint]);

  const fitPoints = useMemo(() => {
    const points = [driverPoint, pickupPoint, dropoffPoint, routeOriginPoint, routeDestinationPoint].filter(Boolean);
    if (points.length === 0 && defaultCenterPoint) {
      return [defaultCenterPoint];
    }
    return points;
  }, [driverPoint, pickupPoint, dropoffPoint, routeOriginPoint, routeDestinationPoint, defaultCenterPoint]);

  const handleDragEnd = (markerKey) => (coord) => {
    if (onMarkerDragEnd && markerKey) {
      onMarkerDragEnd(markerKey, coord);
    }
  };

  return (
    <View style={[mapStyle, styles.mapContainer]}>
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        <MapContainer
          center={center}
          zoom={DEFAULT_ZOOM}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={true}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <MapClickHandler isInteractiveMode={isInteractiveMode} onMapPress={onMapPress} />

          {fitPoints.length >= 2 && (
            <MapBoundsUpdater points={fitPoints} />
          )}

          {driverPoint && (
            <Marker
              position={[driverPoint.latitude, driverPoint.longitude]}
              icon={DRIVER_ICON}
              title="Driver"
              zIndexOffset={MARKER_Z_INDEX.driver}
            >
              <Popup>Driver location</Popup>
            </Marker>
          )}

          {pickupPoint && (
            <DraggableMarkerWrapper
              position={pickupPoint}
              icon={PICKUP_ICON}
              onDragEnd={isInteractiveMode ? handleDragEnd('pickup') : undefined}
              title="Passenger / Pickup"
            >
              <Popup>Pickup location</Popup>
            </DraggableMarkerWrapper>
          )}

          {dropoffPoint && (
            <DraggableMarkerWrapper
              position={dropoffPoint}
              icon={DROPOFF_ICON}
              onDragEnd={isInteractiveMode ? handleDragEnd('dropoff') : undefined}
              title="Destination"
            >
              <Popup>Dropoff location</Popup>
            </DraggableMarkerWrapper>
          )}

          {routeOriginPoint && routeDestinationPoint && (
            <Polyline
              positions={[
                [routeOriginPoint.latitude, routeOriginPoint.longitude],
                [routeDestinationPoint.latitude, routeDestinationPoint.longitude],
              ]}
              color="#1E88E5"
              weight={5}
              opacity={0.9}
            />
          )}

          {isInteractiveMode && selectingPoint && (
            <div style={{
              position: 'absolute',
              top: 10,
              left: 10,
              zIndex: 1000,
              background: 'rgba(255,255,255,0.94)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 700,
              color: '#0F2F1E',
              pointerEvents: 'none',
            }}>
              Tap on the map to select {selectingPoint === 'pickup' ? 'pickup location' : 'dropoff location'}
            </div>
          )}
        </MapContainer>

        {!mapReady && (
          <View style={styles.mapLoadingPlaceholder} pointerEvents="none">
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        )}
      </div>

      {showStatusOverlay && (
        <View style={styles.statusOverlay} pointerEvents="none">
          <Text style={styles.statusTitle}>{title || 'Map'}</Text>
          <Text style={styles.statusCopy}>OpenStreetMap — free, no API key needed.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#EAF1ED',
  },
  mapLoadingPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    zIndex: 1,
  },
  loadingText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  statusOverlay: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(215, 226, 218, 0.92)',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 10,
  },
  statusTitle: {
    color: '#0F2F1E',
    fontSize: 13,
    fontWeight: '900',
  },
  statusCopy: {
    color: '#486453',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
