import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

const SOS_COOLDOWN_MS = 5000; // 5 second cooldown between SOS calls

export function useSOSAlert({ token, driverId, currentLocation }) {
  const [sosActive, setSosActive] = useState(false);
  const [sosError, setSosError] = useState('');
  const [sosMessage, setSosMessage] = useState('');
  const [lastSOSTimestamp, setLastSOSTimestamp] = useState(0);

  const triggerSOS = useCallback(
    async (reason = 'Emergency - Driver needs assistance') => {
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

      setSosActive(true);
      setSosError('');
      setSosMessage('SOS Alert sent. Help is on the way...');

      try {
        const response = await apiRequest('/drivers/sos', {
          method: 'POST',
          token,
          body: {
            driver_id: driverId,
            reason,
            latitude: currentLocation?.latitude,
            longitude: currentLocation?.longitude,
            address: currentLocation?.address,
            timestamp: new Date().toISOString(),
          },
        });

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
    [token, driverId, currentLocation, lastSOSTimestamp]
  );

  const cancelSOS = useCallback(async () => {
    if (!token || !driverId) return false;

    try {
      await apiRequest(`/drivers/sos/cancel`, {
        method: 'POST',
        token,
        body: { driver_id: driverId },
      });

      setSosActive(false);
      setSosMessage('SOS cancelled');
      setTimeout(() => setSosMessage(''), 3000);
      return true;
    } catch (err) {
      setSosError(`Cancel failed: ${err.message}`);
      return false;
    }
  }, [token, driverId]);

  return {
    sosActive,
    sosError,
    sosMessage,
    triggerSOS,
    cancelSOS,
  };
}
