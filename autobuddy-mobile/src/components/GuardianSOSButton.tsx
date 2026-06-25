import React, { useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import SOSButton from './SOSButton';
import { apiRequest } from '../lib/api-client';
import { useNotifications } from '../contexts/NotificationContext';

export default function GuardianSOSButton() {
  const { addNotification } = useNotifications();
  const [sosActive, setSosActive] = useState(false);
  const [sosMessage, setSosMessage] = useState('');
  const [sosError, setSosError] = useState('');

  const handleTriggerSOS = async () => {
    try {
      setSosError('');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission is required for SOS.');
      }

      const location = await Location.getCurrentPositionAsync({});
      const body = {
        reason: 'Guardian mode emergency',
        caregiver_phone: '+911234567890',
        contact_emergency: true,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      const response = await apiRequest<{ ok: boolean; message: string }>('/api/guardian/sos', {
        method: 'POST',
        body,
      });

      if (!response || (response as any).ok === false) {
        throw new Error((response as any)?.message || 'Failed to trigger SOS');
      }

      setSosActive(true);
      setSosMessage('SOS activated. Caregiver and emergency support notified.');
      addNotification({
        title: 'Guardian SOS Sent',
        body: 'Emergency alert sent to caregiver and support team.',
        type: 'alert',
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to send SOS';
      setSosError(message);
      Alert.alert('SOS Failed', message);
      return false;
    }
  };

  const handleCancelSOS = async () => {
    setSosActive(false);
    setSosMessage('Guardian SOS cancelled.');
    addNotification({
      title: 'Guardian SOS Cancelled',
      body: 'Emergency alert has been cancelled.',
      type: 'info',
      timestamp: new Date().toISOString(),
    });
    return true;
  };

  return (
    <SOSButton
      onTriggerSOS={handleTriggerSOS}
      onCancelSOS={handleCancelSOS}
      sosActive={sosActive}
      sosMessage={sosMessage}
      sosError={sosError}
      compact={true}
    />
  );
}
