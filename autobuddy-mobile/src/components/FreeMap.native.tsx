import React, { Children, forwardRef, isValidElement, useEffect, useId, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, UserLocation, ViewAnnotation, type CameraRef } from '@maplibre/maplibre-react-native';

type Coordinate = { latitude: number; longitude: number };
type Region = Coordinate & { latitudeDelta?: number; longitudeDelta?: number };
export type FreeMapRef = {
  animateToRegion: (region: Region, duration?: number) => void;
  fitToCoordinates: (coordinates: Coordinate[], options?: {
    edgePadding?: { top?: number; right?: number; bottom?: number; left?: number };
    animated?: boolean;
  }) => void;
};

const OSM_STYLE = {
  version: 8,
  name: 'OpenStreetMap',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '(c) OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
} as const;
const DEFAULT_REGION: Region = { latitude: 9.9312, longitude: 76.2673, latitudeDelta: 0.05, longitudeDelta: 0.05 };

function isCoordinate(value?: Coordinate | null): value is Coordinate {
  return Boolean(value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude)));
}
function lngLat(value: Coordinate): [number, number] {
  return [Number(value.longitude), Number(value.latitude)];
}
function regionZoom(value: Region): number {
  const delta = Number(value.longitudeDelta || value.latitudeDelta || 0.05);
  return Math.max(2, Math.min(19, Math.log2(360 / Math.max(delta, 0.00001)) - 1));
}
function mapId(prefix: string, id: string) {
  return prefix + '-' + id.replace(/[^a-zA-Z0-9_-]/g, '');
}

export const Marker = ({ coordinate, title, description, pinColor = '#E53935', draggable = false, onDragEnd, onPress, rotation = 0, children }: any) => {
  const id = useId();
  if (!isCoordinate(coordinate)) return null;
  const eventFor = (event: any) => ({
    nativeEvent: {
      coordinate: {
        latitude: Number(event?.nativeEvent?.lngLat?.[1] ?? coordinate.latitude),
        longitude: Number(event?.nativeEvent?.lngLat?.[0] ?? coordinate.longitude),
      },
    },
  });
  return (
    <ViewAnnotation
      id={mapId('marker', id)}
      lngLat={lngLat(coordinate)}
      anchor="bottom"
      title={title}
      snippet={description}
      draggable={Boolean(draggable)}
      onPress={onPress ? (event) => onPress(eventFor(event)) : undefined}
      onDragEnd={onDragEnd ? (event) => onDragEnd(eventFor(event)) : undefined}>
      <View style={{ transform: [{ rotate: String(Number(rotation) || 0) + 'deg' }] }}>
        {children || (
          <View style={[styles.pin, { backgroundColor: pinColor }]}>
            <View style={styles.pinDot} />
          </View>
        )}
      </View>
    </ViewAnnotation>
  );
};

export const Polyline = ({ coordinates = [], strokeColor = '#208AEF', strokeWidth = 3 }: any) => {
  const id = mapId('line', useId());
  const points = coordinates.filter(isCoordinate);
  const data = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: points.map(lngLat) },
  }), [points]);
  if (points.length < 2) return null;
  return (
    <GeoJSONSource id={id + '-source'} data={data}>
      <Layer id={id + '-layer'} type="line" paint={{
        'line-color': strokeColor,
        'line-width': Number(strokeWidth) || 3,
        'line-cap': 'round',
        'line-join': 'round',
      } as any} />
    </GeoJSONSource>
  );
};

function circlePoints(center: Coordinate, radius: number) {
  const result: [number, number][] = [];
  const latScale = 111320;
  const lngScale = Math.max(1, latScale * Math.cos((center.latitude * Math.PI) / 180));
  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    result.push([
      center.longitude + (Math.cos(angle) * radius) / lngScale,
      center.latitude + (Math.sin(angle) * radius) / latScale,
    ]);
  }
  return result;
}
export const Circle = ({ center, radius = 50, fillColor = 'rgba(32,138,239,0.12)', strokeColor = 'rgba(32,138,239,0.4)', strokeWidth = 1 }: any) => {
  const id = mapId('circle', useId());
  const data = useMemo(() => isCoordinate(center) ? ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [circlePoints(center, Math.max(1, Number(radius) || 1))] },
  }) : null, [center, radius]);
  if (!data) return null;
  return (
    <GeoJSONSource id={id + '-source'} data={data}>
      <Layer id={id + '-fill'} type="fill" paint={{ 'fill-color': fillColor } as any} />
      <Layer id={id + '-outline'} type="line" paint={{
        'line-color': strokeColor,
        'line-width': Number(strokeWidth) || 1,
      } as any} />
    </GeoJSONSource>
  );
};

const FreeMap = forwardRef<FreeMapRef, any>(function FreeMap({
  style,
  region,
  initialRegion,
  onPress,
  onRegionChangeComplete,
  scrollEnabled = true,
  zoomEnabled = true,
  rotateEnabled = true,
  pitchEnabled = true,
  showsUserLocation = false,
  followsUserLocation = false,
  children,
}, ref) {
  const camera = useRef<CameraRef>(null);
  const start = isCoordinate(region) ? region : isCoordinate(initialRegion) ? initialRegion : DEFAULT_REGION;

  useImperativeHandle(ref, () => ({
    animateToRegion(next: Region, duration = 500) {
      if (isCoordinate(next)) camera.current?.easeTo({ center: lngLat(next), zoom: regionZoom(next), duration });
    },
    fitToCoordinates(coordinates: Coordinate[], options = {}) {
      const points = coordinates.filter(isCoordinate);
      if (!points.length) return;
      if (points.length === 1) {
        camera.current?.easeTo({ center: lngLat(points[0]), zoom: 15, duration: 500 });
        return;
      }
      const xs = points.map((point) => point.longitude);
      const ys = points.map((point) => point.latitude);
      const padding = options.edgePadding || {};
      camera.current?.fitBounds(
        [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        {
          padding: {
            top: padding.top || 40,
            right: padding.right || 40,
            bottom: padding.bottom || 40,
            left: padding.left || 40,
          },
          duration: options.animated === false ? 0 : 500,
        },
      );
    },
  }), []);

  useEffect(() => {
    if (isCoordinate(region)) {
      camera.current?.easeTo({ center: lngLat(region), zoom: regionZoom(region), duration: 250 });
    }
  }, [region?.latitude, region?.longitude, region?.latitudeDelta, region?.longitudeDelta]);

  return (
    <Map
      style={style}
      mapStyle={OSM_STYLE as any}
      dragPan={Boolean(scrollEnabled)}
      touchZoom={Boolean(zoomEnabled)}
      doubleTapZoom={Boolean(zoomEnabled)}
      doubleTapHoldZoom={Boolean(zoomEnabled)}
      touchRotate={Boolean(rotateEnabled)}
      touchPitch={Boolean(pitchEnabled)}
      attribution
      logo={false}
      onPress={onPress ? (event) => {
        const [longitude, latitude] = event.nativeEvent.lngLat;
        onPress({ nativeEvent: { coordinate: { latitude, longitude } } });
      } : undefined}
      onRegionDidChange={onRegionChangeComplete ? (event) => {
        const { center, bounds } = event.nativeEvent;
        onRegionChangeComplete({
          latitude: center[1],
          longitude: center[0],
          latitudeDelta: Math.abs(bounds[3] - bounds[1]),
          longitudeDelta: Math.abs(bounds[2] - bounds[0]),
        });
      } : undefined}>
      <Camera
        ref={camera}
        initialViewState={{ center: lngLat(start), zoom: regionZoom(start) }}
        trackUserLocation={followsUserLocation ? 'default' : undefined}
      />
      {showsUserLocation ? <UserLocation /> : null}
      {Children.map(children, (child) => isValidElement(child) ? child : null)}
    </Map>
  );
});

const styles = StyleSheet.create({
  pin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 4,
  },
  pinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
});
export default FreeMap;
