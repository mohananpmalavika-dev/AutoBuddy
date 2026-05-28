/**
 * ConfirmationDialog.js - Reusable confirmation modal for destructive actions
 * Prevents accidental data loss with clear confirmation prompts
 * 
 * Usage:
 * <ConfirmationDialog
 *   visible={showConfirm}
 *   title="Delete Account"
 *   message="Are you sure? This will delete all user data."
 *   confirmText="DELETE"
 *   confirmButtonColor="red"
 *   onConfirm={handleDelete}
 *   onCancel={handleCancel}
 * />
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { COLORS } from '../theme';

const ConfirmationDialog = ({
  visible = false,
  title = 'Confirm Action',
  message = 'Are you sure?',
  details = '', // Additional info to show
  confirmText = 'CONFIRM',
  confirmButtonColor = COLORS.danger || '#FF3B30',
  cancelText = 'CANCEL',
  onConfirm,
  onCancel,
  isLoading = false,
  requireTextInput = false,
  requiredText = '', // Text user must type to confirm
  textInputPlaceholder = '',
  dangerous = false, // Shows red warning styling
}) => {
  const [userInput, setUserInput] = useState('');

  const isConfirmEnabled = !requireTextInput || userInput === requiredText;

  const handleConfirm = () => {
    if (isConfirmEnabled && !isLoading) {
      onConfirm?.();
      // Reset input after confirm
      setTimeout(() => setUserInput(''), 300);
    }
  };

  const handleCancel = () => {
    setUserInput('');
    onCancel?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, dangerous && styles.containerDangerous]}>
          {/* Header */}
          <View
            style={[styles.header, dangerous && styles.headerDangerous]}
          >
            <Text style={[styles.title, dangerous && styles.titleDangerous]}>
              {title}
            </Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.message}>{message}</Text>
            {details && <Text style={styles.details}>{details}</Text>}
          </View>

          {/* Text input (for high-risk confirmations) */}
          {requireTextInput && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                Type {requiredText} to confirm:
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder={textInputPlaceholder}
                placeholderTextColor={COLORS.grey}
                value={userInput}
                onChangeText={setUserInput}
                editable={!isLoading}
              />
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : (
                <Text style={styles.cancelButtonText}>{cancelText}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                {
                  backgroundColor: confirmButtonColor,
                  opacity: isConfirmEnabled ? 1 : 0.5,
                },
              ]}
              onPress={handleConfirm}
              disabled={!isConfirmEnabled || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.confirmButtonText}>{confirmText}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 24,
    minWidth: 280,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  containerDangerous: {
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGrey,
    paddingBottom: 12,
  },
  headerDangerous: {
    borderBottomColor: '#FF3B30',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.dark,
    textAlign: 'center',
  },
  titleDangerous: {
    color: '#FF3B30',
  },
  content: {
    marginBottom: 16,
  },
  message: {
    fontSize: 14,
    color: COLORS.darkGrey,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  details: {
    fontSize: 12,
    color: COLORS.grey,
    textAlign: 'center',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  inputContainer: {
    marginBottom: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGrey,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGrey,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.darkGrey,
    marginBottom: 8,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.lightGrey,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.dark,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  cancelButton: {
    backgroundColor: COLORS.lightGrey,
    borderWidth: 1,
    borderColor: COLORS.grey,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.darkGrey,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
});

export default ConfirmationDialog;
