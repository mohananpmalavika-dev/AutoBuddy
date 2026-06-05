import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Alert } from 'react-native';
import { COLORS, SHADOWS } from '../theme';

/**
 * DriverSOSButton - Emergency button for driver safety
 * Allows drivers to alert authorities in case of emergency
 * Sends real-time alert to support + nearby drivers + authorities
 */

export default function DriverSOSButton({
  onTriggerSOS,
  onCancelSOS,
  sosActive = false,
  sosError = '',
  disabled = false,
  compact = false,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSOSPress = () => {
    if (!compact) {
      Alert.alert(
        '🆘 EMERGENCY SOS',
        'Are you in immediate danger? This will alert authorities, support team, and nearby drivers immediately.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'YES - SEND SOS',
            onPress: handleConfirmSOS,
            style: 'destructive',
          },
        ]
      );
    } else {
      handleConfirmSOS();
    }
  };

  const handleConfirmSOS = async () => {
    setIsSubmitting(true);
    try {
      const result = await onTriggerSOS?.();
      return result;
    } catch (error) {
      Alert.alert('SOS Error', error?.message || 'Failed to send emergency alert');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSOS = async () => {
    if (sosActive) {
      try {
        await onCancelSOS?.();
      } catch {
        Alert.alert('Error', 'Failed to cancel SOS');
      }
    }
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={[
          styles.compactButton,
          sosActive && styles.compactButtonActive,
          disabled && styles.compactButtonDisabled,
        ]}
        onPress={handleSOSPress}
        disabled={disabled || isSubmitting}
        activeOpacity={0.7}
      >
        <Text style={styles.compactButtonEmoji}>🆘</Text>
        <Text style={styles.compactButtonText}>{sosActive ? 'SOS ACTIVE' : 'SOS'}</Text>
        {isSubmitting && <ActivityIndicator color="#FFF" size="small" style={{ marginLeft: 8 }} />}
      </TouchableOpacity>
    );
  }

  return (
    <>
      {/* Driver SOS Button */}
      <View style={[styles.container, sosActive && styles.containerActive]}>
        <TouchableOpacity
          style={[
            styles.button,
            sosActive && styles.buttonActive,
            disabled && styles.buttonDisabled,
          ]}
          onPress={handleSOSPress}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonEmoji}>🆘</Text>
          <View style={styles.buttonContent}>
            <Text style={styles.buttonText}>
              {sosActive ? 'SOS - EMERGENCY ACTIVE' : 'Emergency SOS'}
            </Text>
            <Text style={styles.buttonHint}>
              {sosActive
                ? 'Authorities & support have been notified'
                : 'Tap to alert authorities instantly'}
            </Text>
          </View>
          {isSubmitting && <ActivityIndicator color="#FFF" size="small" />}
        </TouchableOpacity>

        {sosActive && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelSOS} disabled={isSubmitting}>
            <Text style={styles.cancelButtonText}>Cancel SOS</Text>
          </TouchableOpacity>
        )}
      </View>

      {sosError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{sosError}</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  containerActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  button: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  buttonActive: {
    backgroundColor: '#CC0000',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  buttonContent: {
    flex: 1,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonHint: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginTop: 4,
  },
  compactButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButtonActive: {
    backgroundColor: '#FF3B30',
  },
  compactButtonDisabled: {
    opacity: 0.5,
  },
  compactButtonEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  compactButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FF3B30',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText: {
    color: '#C41C00',
    fontSize: 12,
  },
});
