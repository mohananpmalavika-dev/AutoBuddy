import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

const SOS_COOLDOWN_MS = 5000; // 5 second cooldown between SOS calls

const VALID_SOS_REASONS = ['emergency', 'accident', 'medical', 'harassment', 'other'];

export function useSOSAlert({ token, driverId, rideId, currentLocation }) {
  const [sosActive, setSosActive] = useState(false);
  const [sosError, setSosError] = useState('');
  const [sosMessage, setSosMessage] = useState('');
  const [lastSOSTimestamp, setLastSOSTimestamp] = useState(0);
  const [activeSosId, setActiveSosId] = useState(null);

  const triggerSOS = useCallback(
    async (reason = 'emergency', description = 'Driver needs emergency assistance') => {
      // Check cooldown
      const now = Date.now();
      if (now - lastSOSTimestamp < SOS_COOLDOWN_MS) {
        setSosError('Please wait before sending another SOS alert');
        return false;
      }

      if (!token || !driverId) {
        setSosError('Not authenticated');
        return false;
      }

      const latitude = Number(currentLocation?.latitude);
      const longitude = Number(currentLocation?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setSosError('Current location is required before sending SOS.');
        return false;
      }

      const normalizedReason = VALID_SOS_REASONS.includes(reason) ? reason : 'emergency';
      const normalizedDescription = VALID_SOS_REASONS.includes(reason) ? description : String(reason || description);

      setSosActive(true);
      setSosError('');
      setSosMessage('SOS Alert sent. Help is on the way...');

      try {
        const response = await apiRequest('/drivers/sos', {
          method: 'POST',
          token,
          body: {
            driver_id: driverId,
            reason: normalizedReason,
            description: normalizedDescription,
            ride_id: rideId || undefined,
            latitude,
            longitude,
            address: currentLocation?.address,
            timestamp: new Date().toISOString(),
          },
        });

        setActiveSosId(response?.id || response?.sos_id || null);
        setLastSOSTimestamp(now);
        setSosMessage('SOS Alert sent successfully. Emergency services notified.');
        setTimeout(() => setSosMessage(''), 5000);

        return response;
      } catch (err) {
        setSosError(`SOS failed: ${err.message}`);
        setSosActive(false);
        return false;
      }
    },
    [token, driverId, rideId, currentLocation, lastSOSTimestamp]
  );

  const cancelSOS = useCallback(async () => {
    if (!token || !driverId) return false;
    if (!activeSosId) {
      setSosError('No active SOS alert to cancel.');
      return false;
    }

    try {
      await apiRequest(`/drivers/sos/${activeSosId}/cancel`, {
        method: 'POST',
        token,
      });

      setSosActive(false);
      setActiveSosId(null);
      setSosMessage('SOS cancelled');
      setTimeout(() => setSosMessage(''), 3000);
      return true;
    } catch (err) {
      setSosError(`Cancel failed: ${err.message}`);
      return false;
    }
  }, [token, driverId, activeSosId]);

  return {
    sosActive,
    sosError,
    sosMessage,
    triggerSOS,
    cancelSOS,
  };
}
