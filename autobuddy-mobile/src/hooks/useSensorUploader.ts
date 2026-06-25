import { useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { uploadHazard } from '../lib/hazardUploader';

// Hook: collect vertical acceleration (az) and detect impact peaks.
export default function useSensorUploader(opts?: {
  sampleHz?: number;
  windowMs?: number;
  threshold?: number;
  enabled?: boolean;
  onDetect?: (event: any) => void;
}) {
  const sampleHz = opts?.sampleHz || 50;
  const windowMs = opts?.windowMs || 500;
  const threshold = opts?.threshold || 2.5; // g units scaled depending on device
  const enabled = opts?.enabled !== false;
  const onDetect = opts?.onDetect;

  const [detectionCount, setDetectionCount] = useState(0);
  const bufferRef = useRef<number[]>([]);
  const subRef = useRef<any>(null);
  const lastDetectionRef = useRef<any>(null);
  const lastUploadAtRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      return () => {
        if (subRef.current) {
          subRef.current.remove();
        }
      };
    }

    let mounted = true;
    Accelerometer.setUpdateInterval(1000 / sampleHz);
    subRef.current = Accelerometer.addListener(async (data) => {
      if (!mounted) return;
      const az = data.z || 0;
      bufferRef.current.push(az);

      const maxSamples = Math.max(4, Math.floor(windowMs * sampleHz / 1000));
      if (bufferRef.current.length > maxSamples) bufferRef.current.shift();
      if (bufferRef.current.length === 0) return;

      const maxVal = Math.max(...bufferRef.current.map(Math.abs));
      const mean = bufferRef.current.reduce((s, v) => s + v, 0) / bufferRef.current.length;
      const std = Math.sqrt(
        bufferRef.current.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / bufferRef.current.length
      );

      if (Math.abs(maxVal) < threshold) {
        return;
      }

      const now = Date.now();
      if (now - lastUploadAtRef.current < 3000) {
        return;
      }
      lastUploadAtRef.current = now;

      const metadata = {
        az_max: maxVal,
        az_mean: mean,
        az_std: std,
        window_samples: bufferRef.current.length,
      };

      let latitude = 0;
      let longitude = 0;
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
          latitude = Number(position.coords.latitude);
          longitude = Number(position.coords.longitude);
        }
      } catch {
        // Geolocation may not be available, fallback to default coords.
      }

      const event = {
        latitude,
        longitude,
        severity: undefined,
        type: 'pothole',
        source: 'driver_app',
        speed_kmph: undefined,
        metadata,
      };

      lastDetectionRef.current = event;
      setDetectionCount((count) => count + 1);
      onDetect?.(event);

      uploadHazard(event).catch(() => {
        // intentionally ignore upload failures here.
      });
      bufferRef.current = [];
    });

    return () => {
      mounted = false;
      if (subRef.current) {
        subRef.current.remove();
      }
    };
  }, [enabled, onDetect, sampleHz, threshold, windowMs]);

  return {
    enabled,
    detectionCount,
    lastDetection: lastDetectionRef.current,
  };
}
