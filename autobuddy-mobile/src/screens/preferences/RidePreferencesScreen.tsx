import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRidePreferences } from '../../hooks/useRidePreferences';

interface RidePreferencesScreenProps {
  passengerId: string;
  authToken: string;
}

export function RidePreferencesScreen({ passengerId, authToken }: RidePreferencesScreenProps) {
  const { preferences, isLoading, isSaving, error, updatePreferences, resetToDefaults } = 
    useRidePreferences(passengerId, authToken);
  const [tempPrefs, setTempPrefs] = useState<any>(null);

  if (isLoading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#2196F3" /></View>;
  }

  if (!preferences) {
    return <View style={styles.errorContainer}><Text style={styles.errorText}>Unable to load preferences</Text></View>;
  }

  const handleSave = async () => {
    if (tempPrefs) {
      try {
        await updatePreferences({ ...preferences, ...tempPrefs });
        setTempPrefs(null);
        Alert.alert('Success', 'Preferences saved');
      } catch (err) {
        Alert.alert('Error', 'Failed to save preferences');
      }
    }
  };

  const currentPrefs = tempPrefs ? { ...preferences, ...tempPrefs } : preferences;
  const hasChanges = tempPrefs && Object.keys(tempPrefs).length > 0;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ride Preferences</Text>
        <Text style={styles.headerSubtitle}>Customize your ride experience</Text>
      </View>

      {/* Music */}
      <Section title="🎵 Music Preference">
        {['no_preference', 'neutral', 'preferred'].map((option) => (
          <RadioButton
            key={option}
            label={option === 'no_preference' ? 'No Music' : option === 'neutral' ? 'Neutral' : 'Music Preferred'}
            selected={currentPrefs.music_preference === option}
            onPress={() => setTempPrefs({ ...tempPrefs, music_preference: option })}
          />
        ))}
      </Section>

      {/* Temperature */}
      <Section title="🌡️ Temperature Preference">
        <View style={styles.tempButtons}>
          {['cold', 'cool', 'warm', 'hot'].map((temp) => (
            <Pressable
              key={temp}
              style={[styles.tempButton, currentPrefs.ac_preference === temp && styles.tempButtonActive]}
              onPress={() => setTempPrefs({ ...tempPrefs, ac_preference: temp })}
            >
              <Text style={styles.tempButtonText}>{temp.charAt(0).toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      {/* Communication */}
      <Section title="💬 Communication Level">
        {['quiet', 'normal', 'chatty'].map((option) => (
          <RadioButton
            key={option}
            label={option === 'quiet' ? 'Quiet' : option === 'normal' ? 'Normal' : 'Chatty'}
            selected={currentPrefs.communication_level === option}
            onPress={() => setTempPrefs({ ...tempPrefs, communication_level: option })}
          />
        ))}
      </Section>

      {/* Vehicles */}
      <Section title="🚖 Vehicle Type Preference">
        <View style={styles.vehicleGrid}>
          {['auto', 'taxi', 'xl'].map((type) => (
            <Pressable
              key={type}
              style={[styles.vehicleBtn, currentPrefs.vehicle_type_preference?.includes(type) && styles.vehicleBtnActive]}
              onPress={() => {
                const current = currentPrefs.vehicle_type_preference || [];
                const updated = current.includes(type) ? current.filter((v: string) => v !== type) : [...current, type];
                setTempPrefs({ ...tempPrefs, vehicle_type_preference: updated.length > 0 ? updated : null });
              }}
            >
              <Text style={styles.vehicleBtnText}>{type.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        {hasChanges && (
          <Pressable style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
            <MaterialIcons name="save" size={20} color="#fff" />
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        )}
        <Pressable style={styles.resetButton} onPress={() => setTempPrefs({})}>
          <MaterialIcons name="refresh" size={20} color="#2196F3" />
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
      </View>

      <View style={styles.spacing} />
    </ScrollView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function RadioButton({ label, selected, onPress }: any) {
  return (
    <Pressable style={styles.radioButton} onPress={onPress}>
      <View style={[styles.radioCircle, selected && styles.radioCircleActive]}>
        {selected && <View style={styles.radioCircleDot} />}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  errorText: { color: '#F44336', fontSize: 14 },
  header: { backgroundColor: '#2196F3', paddingHorizontal: 16, paddingVertical: 24 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#e3f2fd', marginTop: 4 },
  section: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 12 },
  radioButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#2196F3', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  radioCircleActive: { borderColor: '#2196F3', backgroundColor: '#e3f2fd' },
  radioCircleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2196F3' },
  radioLabel: { fontSize: 14, color: '#333' },
  tempButtons: { flexDirection: 'row', gap: 8 },
  tempButton: { flex: 1, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center' },
  tempButtonActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  tempButtonText: { fontSize: 12, fontWeight: '600', color: '#666' },
  vehicleGrid: { flexDirection: 'row', gap: 12 },
  vehicleBtn: { flex: 1, paddingVertical: 12, borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center' },
  vehicleBtnActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  vehicleBtnText: { fontSize: 12, fontWeight: '600', color: '#333' },
  buttonContainer: { marginHorizontal: 16, marginTop: 20, gap: 12 },
  saveButton: { backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
