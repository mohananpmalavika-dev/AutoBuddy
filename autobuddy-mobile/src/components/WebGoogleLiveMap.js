import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

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
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const markersRef = useRef({
    pickup: null,
    dropoff: null,
    driver: null,
  });
  const lastRouteRef = useRef({
    origin: null,
    destination: null,
  });
  const [mapReady, setMapReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const defaultCenterPoint = useMemo(() => normalizeCoords(defaultCenter), [defaultCenter]);
  const pickupPoint = useMemo(() => normalizeCoords(pickupLocation), [pickupLocation]);
  const dropoffPoint = useMemo(() => normalizeCoords(dropoffLocation), [dropoffLocation]);
  const driverPoint = useMemo(() => normalizeCoords(driverLocation), [driverLocation]);
  const routeOriginPoint = useMemo(() => normalizeCoords(routeOrigin), [routeOrigin]);
  const routeDestinationPoint = useMemo(() => normalizeCoords(routeDestination), [routeDestination]);

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
        
        // Add click listener for interactive mode (click to place markers)
        if (isInteractiveMode && onMapPress) {
          mapRef.current.addListener('click', (event) => {
            const coordinate = {
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            };
            onMapPress(coordinate);
          });
        }
        
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
  }, [apiKey, defaultCenterPoint, isInteractiveMode, onMapPress]);

  useEffect(() => {
    if (!mapReady || typeof window === 'undefined' || !mapRef.current || !window.google?.maps) {
      return;
    }
    const googleMaps = window.google.maps;
    const map = mapRef.current;

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
              directionsRendererRef.current.setDirections(result);
              return;
            }
            directionsRendererRef.current.setDirections({ routes: [] });
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
    if (!fallbackUrl) {
      return <View style={mapStyle} />;
    }
    return (
      <iframe
        title={title}
        src={fallbackUrl}
        style={mapStyle}
        allowFullScreen
        loading="lazy"
      />
    );
  }

  return (
    <View style={mapStyle}>
      <View ref={mapContainerRef} style={MAP_CONTAINER_STYLE} />
    </View>
  );
}
