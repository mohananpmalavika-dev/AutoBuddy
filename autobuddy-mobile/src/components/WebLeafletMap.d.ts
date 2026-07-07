import type { ComponentType } from 'react';

type Coordinate = {
  latitude: number;
  longitude: number;
};

export interface WebLeafletMapProps {
  defaultCenter?: Coordinate | null;
  pickupLocation?: Coordinate | null;
  dropoffLocation?: Coordinate | null;
  hazardMarkers?: Coordinate[];
  showReportButton?: boolean;
  onReportPress?: (() => void) | null;
  [key: string]: unknown;
}

declare const WebLeafletMap: ComponentType<WebLeafletMapProps>;

export default WebLeafletMap;
