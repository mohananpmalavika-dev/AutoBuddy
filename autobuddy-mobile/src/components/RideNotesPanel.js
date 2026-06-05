import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

/**
 * RideNotesPanel - Add ride notes and special instructions for drivers
 */
export default function RideNotesPanel({ token, bookingId, onNotesUpdated = () => {} }) {
  const [notes, setNotes] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const PRESET_INSTRUCTIONS = [
    '🚭 No smoking during ride',
    '🎵 Keep volume low',
    '🛣️ Avoid highways',
    '☕ Careful with food/drinks',
    '📞 No personal calls',
    '❄️ Please use AC',
    '🌡️ Please reduce AC',
  ];

  const fetchNotes = useCallback(async () => {
    if (!bookingId) return;
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest(`/bookings/${bookingId}/notes`, { token });
      setNotes(data?.notes || '');
      setSpecialInstructions(data?.special_instructions || '');
    } catch (err) {
      setError(err.message || 'Failed to load ride notes');
    } finally {
      setLoading(false);
    }
  }, [bookingId, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNotes().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchNotes]);

  const saveNotes = async () => {
    if (!bookingId) {
      setError('No active booking');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const response = await apiRequest(`/bookings/${bookingId}/notes`, {
        token,
        method: 'PUT',
        body: {
          notes: notes.trim(),
          special_instructions: specialInstructions.trim(),
        },
      });
      setMessage('Ride notes saved successfully');
      AccessibilityInfo.announceForAccessibility('Ride notes saved successfully');
      setTimeout(() => setMessage(''), 3000);
      onNotesUpdated(response);
    } catch (err) {
      setError(err.message || 'Failed to save ride notes');
      AccessibilityInfo.announceForAccessibility(`Error: ${err.message || 'Failed to save ride notes'}`);
    } finally {
      setSaving(false);
    }
  };

  const togglePresetInstruction = (instruction) => {
    const lines = specialInstructions.split('\n').map((line) => line.trim()).filter(Boolean);
    const index = lines.indexOf(instruction);

    if (index >= 0) {
      lines.splice(index, 1);
    } else {
      lines.push(instruction);
    }

    setSpecialInstructions(lines.join('\n'));
  };

  const isPresetSelected = (instruction) =>
    specialInstructions.split('\n').some((line) => line.trim() === instruction);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {error && <Text style={styles.errorText}>❌ {error}</Text>}
      {message && <Text style={styles.messageText}>✓ {message}</Text>}

      {/* Ride Notes Section */}
      <View style={[styles.section, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>🎯 Ride Notes</Text>
        <Text style={styles.sectionDescription}>
          Add any notes for the driver about your ride preferences, payment terms, or special requests.
        </Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Enter ride notes for driver..."
          placeholderTextColor={COLORS.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          maxLength={500}
          editable={!saving}
        />
        <Text style={styles.charCount}>{notes.length}/500 characters</Text>
      </View>

      {/* Special Instructions Section */}
      <View style={[styles.section, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>⚡ Special Instructions</Text>
        <Text style={styles.sectionDescription}>
          Select or add special instructions for your ride. These help drivers provide better service.
        </Text>

        {/* Preset Instructions */}
        <View style={styles.presetsGrid}>
          {PRESET_INSTRUCTIONS.map((instruction) => (
            <TouchableOpacity
              key={instruction}
              style={[
                styles.presetButton,
                isPresetSelected(instruction) && styles.presetButtonActive,
              ]}
              onPress={() => togglePresetInstruction(instruction)}
              disabled={saving}
            >
              <Text
                style={[
                  styles.presetText,
                  isPresetSelected(instruction) && styles.presetTextActive,
                ]}
                numberOfLines={2}
              >
                {instruction}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom Instructions */}
        <TextInput
          style={styles.instructionsInput}
          placeholder="Add custom instructions (separate with newlines)..."
          placeholderTextColor={COLORS.textMuted}
          value={specialInstructions}
          onChangeText={setSpecialInstructions}
          multiline
          numberOfLines={3}
          maxLength={300}
          editable={!saving}
        />
        <Text style={styles.charCount}>{specialInstructions.length}/300 characters</Text>
      </View>

      {/* Quick Tips */}
      <View style={[styles.tipsSection, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>💡 Tips</Text>
        <View style={styles.tipItem}>
          <Text style={styles.tipLabel}>Good notes include:</Text>
          <Text style={styles.tipText}>• Payment method preferences</Text>
          <Text style={styles.tipText}>• Route preferences (highway/local roads)</Text>
          <Text style={styles.tipText}>• Luggage or passenger count clarifications</Text>
        </View>
        <View style={styles.tipItem}>
          <Text style={styles.tipLabel}>Driver visibility:</Text>
          <Text style={styles.tipText}>
            Drivers see these notes before accepting your ride, helping them prepare better.
          </Text>
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={styles.saveButton}
        onPress={saveNotes}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? '💾 Saving...' : '💾 Save Ride Notes'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  section: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  sectionDescription: { fontSize: 13, color: COLORS.textMuted, marginBottom: 12, lineHeight: 18 },
  notesInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    fontSize: 13,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  instructionsInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  charCount: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, textAlign: 'right' },
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  presetButton: {
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: COLORS.background,
  },
  presetButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  presetText: { fontSize: 12, color: COLORS.text, fontWeight: '500', textAlign: 'center' },
  presetTextActive: { color: '#FFFFFF' },
  tipsSection: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  tipItem: { marginBottom: 12 },
  tipLabel: { fontSize: 13, fontWeight: '600', color: '#1976D2', marginBottom: 4 },
  tipText: { fontSize: 12, color: COLORS.text, lineHeight: 18, marginLeft: 8, marginBottom: 2 },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  saveButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  errorText: { color: '#F44336', fontSize: 12, marginBottom: 12, fontWeight: '600', padding: 8, backgroundColor: '#FFEBEE', borderRadius: 4 },
  messageText: { color: '#4CAF50', fontSize: 12, marginBottom: 12, fontWeight: '600', padding: 8, backgroundColor: '#E8F5E9', borderRadius: 4 },
});
