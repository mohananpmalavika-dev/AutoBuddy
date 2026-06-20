import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const DEFAULT_ZOOM = 14;
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const ROUTE_REFRESH_DELTA = 0.0005;
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

// Logging utility for debugging (disable in production)
const LOG_ENABLED = true; // Set to false in production
const logWebGoogleLiveMap = (message, data) => {
  if (LOG_ENABLED && typeof console !== 'undefined') {
    console.log(`[WebGoogleLiveMap] ${message}`, data || '');
  }
};

const logWebGoogleLiveMapError = (message, error) => {
  if (typeof console !== 'undefined') {
    console.error(`[WebGoogleLiveMap ERROR] ${message}`, error || '');
  }
};

let googleMapsLoaderPromise = null;

const normalizeCoords = (location) => {
  if (!location) {
    return null;
  }
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    logWebGoogleLiveMapError('Invalid coordinates', { latitude, longitude });
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
    const err = 'Google Maps can only load in the browser.';
    logWebGoogleLiveMapError(err, null);
    return Promise.reject(new Error(err));
  }
  if (window.google?.maps) {
    logWebGoogleLiveMap('Google Maps already loaded from cache');
    return Promise.resolve(window.google.maps);
  }
  if (googleMapsLoaderPromise) {
    logWebGoogleLiveMap('Reusing pending Google Maps loader promise');
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const startTime = performance.now ? performance.now() : Date.now();

    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-autobuddy-google-maps', '1');

    script.onload = () => {
      const loadTime = performance.now ? performance.now() - startTime : 0;
      if (window.google?.maps) {
        logWebGoogleLiveMap('Google Maps script loaded successfully', { loadTime: `${loadTime.toFixed(0)}ms` });
        resolve(window.google.maps);
      } else {
        const err = 'Google Maps loaded without maps namespace.';
        logWebGoogleLiveMapError(err, null);
        reject(new Error(err));
      }
    };

    script.onerror = (event) => {
      const err = 'Google Maps script failed to load.';
      logWebGoogleLiveMapError(err, { event, apiKey: apiKey ? '[SET]' : '[MISSING]' });
      reject(new Error(err));
    };

    script.onabort = () => {
      logWebGoogleLiveMapError('Google Maps script load was aborted', null);
      reject(new Error('Google Maps script load was aborted.'));
    };

    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
};

const createLatLng = (googleMaps, location) =>
  new googleMaps.LatLng(location.latitude, location.longitude);

const createMarkerIcon = (googleMaps, markerKey) => {
  const fillColor = MARKER_COLORS[markerKey] || MARKER_COLORS.dropoff;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
      <path d="M17 42C14.2 37.9 3 25.8 3 15.9C3 7.7 9.3 2 17 2C24.7 2 31 7.7 31 15.9C31 25.8 19.8 37.9 17 42Z" fill="${fillColor}" stroke="#FFFFFF" stroke-width="3"/>
      <circle cx="17" cy="16" r="6" fill="rgba(255,255,255,0.24)"/>
    </svg>
  `;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new googleMaps.Size(34, 44),
    anchor: new googleMaps.Point(17, 42),
    labelOrigin: new googleMaps.Point(17, 16),
  };
};

const createMarkerLabel = (labelText) => ({
  text: labelText,
  color: '#FFFFFF',
  fontSize: '12px',
  fontWeight: '800',
});

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
  const showFallbackDriverPointer =
    showEmbedFallback && !!driverPoint && !pickupPoint && !dropoffPoint && !routeDestinationPoint;

  useEffect(() => {
    if (!apiKey || typeof window === 'undefined' || !mapContainerRef.current) {
      return undefined;
    }

    let cancelled = false;

    loadGoogleMapsScript(apiKey)
      .then((googleMaps) => {
        if (cancelled || mapRef.current || !mapContainerRef.current) {
          logWebGoogleLiveMap('Map initialization cancelled or already initialized');
          return;
        }

        const defaultCenter = defaultCenterPoint || { latitude: 13.0827, longitude: 80.2707 };
        logWebGoogleLiveMap('Initializing map', {
          center: defaultCenter,
          zoom: DEFAULT_ZOOM,
        });

        mapRef.current = new googleMaps.Map(mapContainerRef.current, {
          center: createLatLng(googleMaps, defaultCenter),
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

        logWebGoogleLiveMap('Map initialized successfully');
        setMapReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          logWebGoogleLiveMapError('Failed to initialize map', err);
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
          logWebGoogleLiveMap(`Marker '${markerKey}' removed (no point)`);
        }
        return;
      }
      const nextPosition = createLatLng(googleMaps, point);
      const markerIcon = createMarkerIcon(googleMaps, markerKey);
      const markerLabel = createMarkerLabel(labelText);
      const zIndex = MARKER_Z_INDEX[markerKey] || 1;
      if (!currentMarker) {
        const markerConfig = {
          map,
          position: nextPosition,
          title: titleText,
          icon: markerIcon,
          label: markerLabel,
          zIndex,
        };

        // Enable dragging for pickup/dropoff markers in interactive mode
        if (isInteractiveMode && (markerKey === 'pickup' || markerKey === 'dropoff') && onMarkerDragEnd) {
          markerConfig.draggable = true;
        }

        markersRef.current[markerKey] = new googleMaps.Marker(markerConfig);
        logWebGoogleLiveMap(`Marker '${markerKey}' created`, {
          position: point,
          draggable: markerConfig.draggable,
          title: titleText,
        });

        // Add drag listener for interactive markers
        if (isInteractiveMode && (markerKey === 'pickup' || markerKey === 'dropoff') && onMarkerDragEnd) {
          markersRef.current[markerKey].addListener('dragend', (event) => {
            const coordinate = {
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            };
            logWebGoogleLiveMap(`Marker '${markerKey}' dragged`, coordinate);
            onMarkerDragEnd(markerKey, coordinate);
          });
        }
        return;
      }
      currentMarker.setPosition(nextPosition);
      currentMarker.setTitle(titleText);
      currentMarker.setIcon(markerIcon);
      currentMarker.setLabel(markerLabel);
      currentMarker.setZIndex(zIndex);

      // Update draggable state based on interactive mode
      if (isInteractiveMode && (markerKey === 'pickup' || markerKey === 'dropoff')) {
        currentMarker.setDraggable(true);
      } else {
        currentMarker.setDraggable(false);
      }
    };

    syncMarker('pickup', pickupPoint, 'Passenger / Pickup', 'P');
    syncMarker('dropoff', dropoffPoint, 'Destination', 'D');
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
              // Validate result contains routes with legs
              if (!result.routes || result.routes.length === 0) {
                logWebGoogleLiveMapError('DirectionsService returned empty routes', { status, routesCount: result.routes?.length || 0 });
                showFallbackRoute();
                return;
              }

              const route = result.routes[0];
              if (!route.legs || route.legs.length === 0) {
                logWebGoogleLiveMapError('DirectionsService route has no legs', { status });
                showFallbackRoute();
                return;
              }

              // Log successful route calculation
              const totalDistance = route.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
              const totalDuration = route.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
              logWebGoogleLiveMap('DirectionsService route calculated successfully', {
                distance: `${(totalDistance / 1000).toFixed(1)} km`,
                duration: `${(totalDuration / 60).toFixed(0)} min`,
                legsCount: route.legs.length,
              });

              clearFallbackRoute();
              directionsRendererRef.current.setDirections(result);
              fitBoundsToPoints(googleMaps, map, [routeOriginPoint, routeDestinationPoint]);
              return;
            }

            // Handle errors
            const statusMessages = {
              ZERO_RESULTS: 'No route found between these locations',
              NOT_FOUND: 'Origin or destination location not found',
              MAX_WAYPOINTS_EXCEEDED: 'Too many waypoints for this route',
              INVALID_REQUEST: 'Invalid request parameters',
              OVER_QUERY_LIMIT: 'API query limit exceeded',
              REQUEST_DENIED: 'DirectionsService request was denied',
              UNKNOWN_ERROR: 'Unknown error in DirectionsService',
            };

            const errorMsg = statusMessages[status] || `DirectionsService error: ${status}`;
            logWebGoogleLiveMapError(errorMsg, { status, origin: routeOriginPoint, destination: routeDestinationPoint });

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
        {showFallbackDriverPointer && (
          <View style={styles.fallbackDriverMarker} pointerEvents="none">
            <View style={styles.fallbackDriverMarkerTail} />
            <Text style={styles.fallbackDriverMarkerText}>D</Text>
          </View>
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
      {showFallbackDriverPointer && (
        <View style={styles.fallbackDriverMarker} pointerEvents="none">
          <View style={styles.fallbackDriverMarkerTail} />
          <Text style={styles.fallbackDriverMarkerText}>D</Text>
        </View>
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
  fallbackDriverMarker: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 32,
    height: 32,
    marginLeft: -16,
    marginTop: -36,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#0B8F3A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 8,
    boxShadow: '0 8px 18px rgba(15, 47, 30, 0.28)',
  },
  fallbackDriverMarkerTail: {
    position: 'absolute',
    width: 12,
    height: 12,
    left: 7,
    bottom: -7,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#0B8F3A',
    transform: [{ rotate: '45deg' }],
  },
  fallbackDriverMarkerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    zIndex: 1,
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
