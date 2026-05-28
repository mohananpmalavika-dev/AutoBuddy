import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

const LOST_ITEM_TYPES = ['Phone', 'Wallet', 'Keys', 'Bag', 'Other'];

export default function LostItemTab({ bookingId, token, onSubmitted }) {
  const [itemType, setItemType] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSuccess(false);
    if (!bookingId) {
      setError('Booking is unavailable for this lost item report.');
      return;
    }
    if (!itemType) {
      setError('Choose an item type.');
      return;
    }
    if (!description.trim()) {
      setError('Describe the lost item.');
      return;
    }
    if (!contact.trim()) {
      setError('Add a contact number or email for retrieval.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest(`/v1/passengers/bookings/${bookingId}/lost-item`, {
        method: 'POST',
        token,
        body: {
          item_type: itemType,
          description,
          contact,
        },
      });
      setSuccess(true);
      setItemType('');
      setDescription('');
      setContact('');
      onSubmitted?.(response);
    } catch (err) {
      setError(err.message || 'Failed to report lost item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Report Lost Item</Text>
      <Text style={styles.helper}>Tell support what was left behind and how to reach you.</Text>

      <Text style={styles.label}>Item type</Text>
      <View style={styles.chipRow}>
        {LOST_ITEM_TYPES.map((type) => {
          const selected = itemType === type;
          return (
            <TouchableOpacity
              key={type}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => setItemType(type)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={loading}>
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>{type}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Description</Text>
      <VoiceTextInput
        value={description}
        onChangeText={(text) => setDescription(text.slice(0, 500))}
        multiline
        style={[styles.input, styles.multilineInput]}
        placeholder="Color, brand, seat location, or anything that helps identify it"
        placeholderTextColor={COLORS.textMuted}
      />
      <Text style={styles.count}>{description.length}/500</Text>

      <Text style={styles.label}>Contact for retrieval</Text>
      <VoiceTextInput
        value={contact}
        onChangeText={(text) => setContact(text.slice(0, 120))}
        style={styles.input}
        placeholder="Phone or email"
        placeholderTextColor={COLORS.textMuted}
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {success && <Text style={styles.successText}>Lost item report sent.</Text>}

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
        accessibilityRole="button">
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Lost Item</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    color: COLORS.textMain,
    fontSize: 16,
    fontWeight: '800',
  },
  helper: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 14,
  },
  label: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#D8DEE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    backgroundColor: '#E8F5E9',
    borderColor: COLORS.primary,
  },
  chipText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: COLORS.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textMain,
    fontSize: 13,
    backgroundColor: '#FFFFFF',
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  count: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
    marginBottom: 12,
    textAlign: 'right',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
  },
  successText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 10,
  },
  submitButton: {
    marginTop: 14,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
