import apiClient from '../utils/apiClient';

// Simple uploader helper: call `uploadHazard` with sensor-derived event
export async function uploadHazard(event: {
  latitude: number;
  longitude: number;
  severity?: number;
  type?: string;
  source?: string;
  speed_kmph?: number;
  metadata?: Record<string, any>;
}) {
  try {
    const payload = {
      latitude: event.latitude,
      longitude: event.longitude,
      severity: event.severity,
      type: event.type || 'pothole',
      source: event.source || 'driver_app',
      speed_kmph: event.speed_kmph,
      metadata: event.metadata || {},
    };

    const res = await apiClient.post('/api/road-hazards/ingest', payload);
    return res.data;
  } catch (err) {
    console.warn('hazard upload failed', err);
    throw err;
  }
}

// Example helper to report a user-submitted hazard (photo handled elsewhere)
export async function reportHazard(report: {
  user_id?: string;
  latitude: number;
  longitude: number;
  description?: string;
}) {
  try {
    const res = await apiClient.post('/api/road-hazards/report', report);
    return res.data;
  } catch (err) {
    console.warn('hazard report failed', err);
    throw err;
  }
}

export async function fetchNearbyHazards(params: {
  latitude: number;
  longitude: number;
  radius_km?: number;
  limit?: number;
}) {
  try {
    const res = await apiClient.get('/api/road-hazards/nearby', {
      params: {
        latitude: params.latitude,
        longitude: params.longitude,
        radius_km: params.radius_km ?? 0.5,
        limit: params.limit ?? 50,
      },
    });
    return res.data;
  } catch (err) {
    console.warn('fetch nearby hazards failed', err);
    throw err;
  }
}

export async function fetchHazardRisk(params: {
  latitude: number;
  longitude: number;
  radius_km?: number;
}) {
  try {
    const res = await apiClient.get('/api/road-hazards/risk', {
      params: {
        latitude: params.latitude,
        longitude: params.longitude,
        radius_km: params.radius_km ?? 0.5,
      },
    });
    return res.data;
  } catch (err) {
    console.warn('fetch hazard risk failed', err);
    throw err;
  }
}

export async function requestSafeRoute(payload: {
  origin: {
    latitude: number;
    longitude: number;
  };
  destination: {
    latitude: number;
    longitude: number;
  };
  count?: number;
  distance_km?: number;
  timestamp?: string;
}) {
  try {
    const res = await apiClient.post('/api/road-hazards/safe-route', payload);
    return res.data;
  } catch (err) {
    console.warn('safe route request failed', err);
    throw err;
  }
}
