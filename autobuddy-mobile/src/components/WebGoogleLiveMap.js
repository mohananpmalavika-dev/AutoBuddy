import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const DEFAULT_ZOOM = 14;
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const ROUTE_REFRESH_DELTA = 0.0005;

let googleMapsLoaderPromise = null;

const normalizeCoords = (location) => {
  if (!location) {
    return null;
  }
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    latitude,
    longitude,
  };
};

const hasMeaningfulMovement = (previous, next, threshold = ROUTE_REFRESH_DELTA) => {
  if (!previous || !next) {
    return true;
  }
  return (
    Math.abs(previous.latitude - next.latitude) > threshold ||
    Math.abs(previous.longitude - next.longitude) > threshold
  );
};

const loadGoogleMapsScript = (apiKey) => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-autobuddy-google-maps', '1');
    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps loaded without maps namespace.'));
      }
    };
    script.onerror = () => reject(new Error('Google Maps script failed to load.'));
    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
};

const createLatLng = (googleMaps, location) =>
  new googleMaps.LatLng(location.latitude, location.longitude);

const fitBoundsToPoints = (googleMaps, map, points) => {
  const validPoints = points.filter(Boolean);
  if (validPoints.length < 2) {
    return;
  }
  const bounds = new googleMaps.LatLngBounds();
  validPoints.forEach((point) => {
    bounds.extend(createLatLng(googleMaps, point));
  });
  map.fitBounds(bounds, 56);
};

export default function WebGoogleLiveMap({
  apiKey,
  title,
  fallbackUrl,
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
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const routeFallbackPolylineRef = useRef(null);
  const markersRef = useRef({
    pickup: null,
    dropoff: null,
    driver: null,
  });
  const lastRouteRef = useRef({
    origin: null,
    destination: null,
  });
  const mapClickListenerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const defaultCenterPoint = useMemo(() => normalizeCoords(defaultCenter), [defaultCenter]);
  const pickupPoint = useMemo(() => normalizeCoords(pickupLocation), [pickupLocation]);
  const dropoffPoint = useMemo(() => normalizeCoords(dropoffLocation), [dropoffLocation]);
  const driverPoint = useMemo(() => normalizeCoords(driverLocation), [driverLocation]);
  const routeOriginPoint = useMemo(() => normalizeCoords(routeOrigin), [routeOrigin]);
  const routeDestinationPoint = useMemo(() => normalizeCoords(routeDestination), [routeDestination]);
  const showEmbedFallback = !!fallbackUrl && (!apiKey || loadFailed);

  useEffect(() => {
    if (!apiKey || typeof window === 'undefined' || !mapContainerRef.current) {
      return undefined;
    }

    let cancelled = false;

    loadGoogleMapsScript(apiKey)
      .then((googleMaps) => {
        if (cancelled || mapRef.current || !mapContainerRef.current) {
          return;
        }
        mapRef.current = new googleMaps.Map(mapContainerRef.current, {
          center: createLatLng(googleMaps, defaultCenterPoint || { latitude: 13.0827, longitude: 80.2707 }),
          zoom: DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        directionsServiceRef.current = new googleMaps.DirectionsService();
        directionsRendererRef.current = new googleMaps.DirectionsRenderer({
          suppressMarkers: true,
          preserveViewport: true,
          polylineOptions: {
            strokeColor: '#1E88E5',
            strokeOpacity: 0.9,
            strokeWeight: 5,
          },
        });
        directionsRendererRef.current.setMap(mapRef.current);
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, defaultCenterPoint]);

  useEffect(() => {
    if (mapClickListenerRef.current) {
      mapClickListenerRef.current.remove();
      mapClickListenerRef.current = null;
    }

    if (
      !mapReady ||
      !isInteractiveMode ||
      !onMapPress ||
      typeof window === 'undefined' ||
      !mapRef.current ||
      !window.google?.maps
    ) {
      return undefined;
    }

    mapClickListenerRef.current = mapRef.current.addListener('click', (event) => {
      if (!event?.latLng) {
        return;
      }
      onMapPress({
        latitude: event.latLng.lat(),
        longitude: event.latLng.lng(),
      });
    });

    return () => {
      if (mapClickListenerRef.current) {
        mapClickListenerRef.current.remove();
        mapClickListenerRef.current = null;
      }
    };
  }, [mapReady, isInteractiveMode, onMapPress]);

  useEffect(() => {
    if (!mapReady || typeof window === 'undefined' || !mapRef.current || !window.google?.maps) {
      return;
    }
    const googleMaps = window.google.maps;
    const map = mapRef.current;

    const clearFallbackRoute = () => {
      if (routeFallbackPolylineRef.current) {
        routeFallbackPolylineRef.current.setMap(null);
        routeFallbackPolylineRef.current = null;
      }
    };

    const showFallbackRoute = () => {
      clearFallbackRoute();
      if (!routeOriginPoint || !routeDestinationPoint) {
        return;
      }
      routeFallbackPolylineRef.current = new googleMaps.Polyline({
        map,
        path: [
          createLatLng(googleMaps, routeOriginPoint),
          createLatLng(googleMaps, routeDestinationPoint),
        ],
        geodesic: true,
        strokeColor: '#1E88E5',
        strokeOpacity: 0.75,
        strokeWeight: 5,
      });
      fitBoundsToPoints(googleMaps, map, [routeOriginPoint, routeDestinationPoint]);
    };

    const syncMarker = (markerKey, point, titleText, labelText) => {
      const currentMarker = markersRef.current[markerKey];
      if (!point) {
        if (currentMarker) {
          currentMarker.setMap(null);
          markersRef.current[markerKey] = null;
        }
        return;
      }
      const nextPosition = createLatLng(googleMaps, point);
      if (!currentMarker) {
        const markerConfig = {
          map,
          position: nextPosition,
          title: titleText,
          label: labelText,
        };
        
        // Enable dragging for pickup/dropoff markers in interactive mode
        if (isInteractiveMode && (markerKey === 'pickup' || markerKey === 'dropoff') && onMarkerDragEnd) {
          markerConfig.draggable = true;
        }
        
        markersRef.current[markerKey] = new googleMaps.Marker(markerConfig);
        
        // Add drag listener for interactive markers
        if (isInteractiveMode && (markerKey === 'pickup' || markerKey === 'dropoff') && onMarkerDragEnd) {
          markersRef.current[markerKey].addListener('dragend', (event) => {
            const coordinate = {
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            };
            onMarkerDragEnd(markerKey, coordinate);
          });
        }
        return;
      }
      currentMarker.setPosition(nextPosition);
      currentMarker.setTitle(titleText);
      currentMarker.setLabel(labelText);
      
      // Update draggable state based on interactive mode
      if (isInteractiveMode && (markerKey === 'pickup' || markerKey === 'dropoff')) {
        currentMarker.setDraggable(true);
      } else {
        currentMarker.setDraggable(false);
      }
    };

    syncMarker('pickup', pickupPoint, 'Pickup', 'P');
    syncMarker('dropoff', dropoffPoint, 'Dropoff', 'D');
    syncMarker('driver', driverPoint, 'Driver', 'R');

    const routeOriginChanged = hasMeaningfulMovement(lastRouteRef.current.origin, routeOriginPoint);
    const routeDestinationChanged = hasMeaningfulMovement(lastRouteRef.current.destination, routeDestinationPoint);

    if (routeOriginPoint && routeDestinationPoint) {
      if (routeOriginChanged || routeDestinationChanged) {
        lastRouteRef.current = {
          origin: routeOriginPoint,
          destination: routeDestinationPoint,
        };
        if (!directionsServiceRef.current || !directionsRendererRef.current) {
          showFallbackRoute();
          return;
        }
        directionsServiceRef.current.route(
          {
            origin: createLatLng(googleMaps, routeOriginPoint),
            destination: createLatLng(googleMaps, routeDestinationPoint),
            travelMode: googleMaps.TravelMode.DRIVING,
            avoidHighways: true,
            avoidTolls: true,
          },
          (result, status) => {
            if (status === googleMaps.DirectionsStatus.OK && result) {
              clearFallbackRoute();
              directionsRendererRef.current.setDirections(result);
              fitBoundsToPoints(googleMaps, map, [routeOriginPoint, routeDestinationPoint]);
              return;
            }
            directionsRendererRef.current.setDirections({ routes: [] });
            showFallbackRoute();
          },
        );
      }
      return;
    }

    lastRouteRef.current = {
      origin: null,
      destination: null,
    };
    directionsRendererRef.current.setDirections({ routes: [] });
    clearFallbackRoute();

    const focusPoint = driverPoint || pickupPoint || dropoffPoint || defaultCenterPoint;
    if (focusPoint) {
      map.panTo(createLatLng(googleMaps, focusPoint));
    }
  }, [
    mapReady,
    defaultCenterPoint,
    pickupPoint,
    dropoffPoint,
    driverPoint,
    routeOriginPoint,
    routeDestinationPoint,
    isInteractiveMode,
    onMapPress,
    onMarkerDragEnd,
  ]);

  if (!apiKey || loadFailed) {
    return (
      <View style={[mapStyle, styles.mapFallbackSurface]}>
        {!!fallbackUrl && (
          <iframe
            title={title}
            src={fallbackUrl}
            style={styles.fallbackFrame}
            allowFullScreen
            loading="lazy"
          />
        )}
        {showStatusOverlay && (
          <View style={styles.statusOverlay} pointerEvents="none">
            <Text style={styles.statusTitle}>{fallbackUrl ? 'Live map fallback' : 'Live map unavailable'}</Text>
            <Text style={styles.statusCopy}>
              {fallbackUrl
                ? 'Showing the browser-safe Google Maps embed.'
                : 'Map coordinates are available when the driver location syncs.'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[mapStyle, styles.mapFallbackSurface]}>
      {showEmbedFallback && fallbackUrl && (
        <iframe
          title={title}
          src={fallbackUrl}
          style={styles.fallbackFrame}
          allowFullScreen
          loading="lazy"
        />
      )}
      <View ref={mapContainerRef} style={[MAP_CONTAINER_STYLE, styles.mapLayer, !mapReady && styles.mapLayerBooting]} />
      {!mapReady && !showEmbedFallback && (
        <View style={styles.mapLoadingPlaceholder} pointerEvents="none">
          <Text style={styles.loadingSpinner}>Loading</Text>
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      )}
      {showStatusOverlay && !mapReady && showEmbedFallback && (
        <View style={styles.statusOverlay} pointerEvents="none">
          <Text style={styles.statusTitle}>Map initializing</Text>
          <Text style={styles.statusCopy}>Preparing driver location and route view.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapFallbackSurface: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#EAF1ED',
  },
  fallbackFrame: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
  mapLayer: {
    position: 'relative',
    zIndex: 0,
  },
  mapLayerBooting: {
    opacity: 0.01,
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
  loadingSpinner: {
    fontSize: 16,
    color: '#0F2F1E',
    marginBottom: 8,
    fontWeight: '800',
  },
  loadingText: {
    marginTop: 8,
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
