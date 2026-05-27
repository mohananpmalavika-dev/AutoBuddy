import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, Alert } from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { useSavedPlaces } from '../contexts/SavedPlacesContext';

/**
 * SavedPlacesPanel - View and manage saved locations
 */
export default function SavedPlacesPanel() {
  const { savedPlaces, addPlace, removePlace } = useSavedPlaces();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlace, setNewPlace] = useState({ name: '', address: '' });

  const handleAddPlace = () => {
    if (!newPlace.name || !newPlace.address) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    addPlace(newPlace.name, newPlace.address, null, 'custom');
    setNewPlace({ name: '', address: '' });
    setShowAddForm(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Saved Places</Text>

      <FlatList
        data={savedPlaces}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.placeItem}>
            <View style={styles.placeInfo}>
              <Text style={styles.placeName}>{item.name}</Text>
              <Text style={styles.placeAddress}>{item.address}</Text>
            </View>
            <TouchableOpacity onPress={() => removePlace(item.id)}>
              <Text style={styles.deleteButton}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        scrollEnabled={false}
      />

      {showAddForm ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Place name (Home, Work, etc.)"
            value={newPlace.name}
            onChangeText={(text) => setNewPlace({ ...newPlace, name: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Full address"
            value={newPlace.address}
            onChangeText={(text) => setNewPlace({ ...newPlace, address: text })}
            multiline
          />
          <View style={styles.formActions}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setShowAddForm(false)}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleAddPlace}>
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddForm(true)}>
          <Text style={styles.addButtonText}>+ Add Saved Place</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    ...SHADOWS.soft,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  placeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  placeAddress: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  deleteButton: {
    fontSize: 18,
    color: '#F44336',
  },
  addButton: {
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  form: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#EEE',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    fontWeight: '600',
    color: 'white',
  },
});
