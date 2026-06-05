import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Modal, ActivityIndicator } from 'react-native';
import { SHADOWS } from '../theme';

export default function SOSButton({
  onTriggerSOS,
  onCancelSOS,
  sosActive = false,
  sosMessage = '',
  sosError = '',
  disabled = false,
  compact = false,
}) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSOSPress = () => {
    if (!compact) {
      setShowConfirmation(true);
    } else {
      handleConfirmSOS();
    }
  };

  const handleConfirmSOS = async () => {
    setIsSubmitting(true);
    const result = await onTriggerSOS();
    setIsSubmitting(false);

    if (result) {
      setShowConfirmation(false);
    }
  };

  const handleCancelSOS = async () => {
    if (sosActive) {
      await onCancelSOS();
    }
    setShowConfirmation(false);
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
      {/* SOS Button */}
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
          <Text style={styles.buttonText}>{sosActive ? 'SOS - EMERGENCY ACTIVE' : 'Emergency SOS'}</Text>
          <Text style={styles.buttonHint}>Tap to alert authorities</Text>
        </View>
        {isSubmitting && <ActivityIndicator color="#FFF" size="small" />}
      </TouchableOpacity>

      {/* Status Messages */}
      {sosMessage && !sosError && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{sosMessage}</Text>
        </View>
      )}

      {sosError && (
        <View style={[styles.messageBox, styles.messageBoxError]}>
          <Text style={styles.messageTextError}>{sosError}</Text>
        </View>
      )}

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Emergency Alert</Text>
            <Text style={styles.modalMessage}>
              Are you in immediate danger? This will alert local authorities and emergency services to your
              location.
            </Text>

            <View style={styles.modalWarning}>
              <Text style={styles.modalWarningText}>⚠️ This action cannot be undone immediately</Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowConfirmation(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmSOS}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalButtonConfirmText}>🆘 Send SOS Alert</Text>
                )}
              </TouchableOpacity>
            </View>

            {sosActive && (
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={handleCancelSOS}
                disabled={isSubmitting}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel Active SOS</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Full Button Styles
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: '#DC143C', // Crimson red
    borderWidth: 2,
    borderColor: '#8B0000',
    ...SHADOWS.card,
  },
  buttonActive: {
    backgroundColor: '#FF4444',
    borderColor: '#CC0000',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  buttonContent: {
    flex: 1,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  buttonHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // Compact Button Styles
  compactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#DC143C',
    borderWidth: 2,
    borderColor: '#8B0000',
  },
  compactButtonActive: {
    backgroundColor: '#FF4444',
    borderColor: '#CC0000',
  },
  compactButtonDisabled: {
    opacity: 0.5,
  },
  compactButtonEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  compactButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },

  // Messages
  messageBox: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2E7D32',
  },
  messageBoxError: {
    backgroundColor: '#FFEBEE',
    borderLeftColor: '#C62828',
  },
  messageText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  messageTextError: {
    color: '#C62828',
    fontSize: 13,
    fontWeight: '600',
  },

  // Modal Styles
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    ...SHADOWS.card,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#DC143C',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalWarning: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  modalWarningText: {
    fontSize: 13,
    color: '#E65100',
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#BDBDBD',
  },
  modalButtonCancelText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
  modalButtonConfirm: {
    backgroundColor: '#DC143C',
  },
  modalButtonConfirmText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  modalButtonSecondary: {
    backgroundColor: '#FFE0E0',
    borderWidth: 1,
    borderColor: '#DC143C',
  },
  modalButtonSecondaryText: {
    color: '#DC143C',
    fontWeight: '600',
    fontSize: 14,
  },
});
