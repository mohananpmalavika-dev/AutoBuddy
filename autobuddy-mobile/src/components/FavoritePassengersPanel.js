import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert } from 'react-native';
import { useFavoritePassengers } from '../hooks/useFavoritePassengers';
import { theme } from '../theme';

export function FavoritePassengersPanel({ isVisible, onClose, token, driverId }) {
  const { favorites, loadFavorites, addFavorite, removeFavorite } = useFavoritePassengers({ token, driverId });
  const [showAddForm, setShowAddForm] = useState(false);
  const [passengerId, setPassengerId] = useState('');
  const [rating, setRating] = useState(5);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isVisible) {
      loadFavorites();
    }
  }, [isVisible, loadFavorites]);

  const handleAddFavorite = () => {
    if (!passengerId.trim()) {
      Alert.alert('Error', 'Please enter passenger ID');
      return;
    }
    addFavorite(passengerId, rating, notes);
    setPassengerId('');
    setNotes('');
    setRating(5);
    setShowAddForm(false);
    Alert.alert('Success', 'Passenger added to favorites');
  };

  const handleRemoveFavorite = (passengerId) => {
    Alert.alert(
      'Remove Favorite',
      'Remove this passenger from your favorites?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeFavorite(passengerId) },
      ]
    );
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Favorite Passengers</Text>
          <TouchableOpacity onPress={() => setShowAddForm(true)} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {favorites.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No favorite passengers yet</Text>
              <Text style={styles.emptySubtext}>Add regular passengers you enjoy driving</Text>
              <TouchableOpacity
                style={styles.addFavoriteButton}
                onPress={() => setShowAddForm(true)}
              >
                <Text style={styles.addFavoriteButtonText}>Add Your First Favorite</Text>
              </TouchableOpacity>
            </View>
          ) : (
            favorites.map((passenger, index) => (
              <View key={index} style={styles.passengerCard}>
                <View style={styles.passengerHeader}>
                  <View>
                    <Text style={styles.passengerName}>{passenger.passenger_name}</Text>
                    <Text style={styles.passengerId}>ID: {passenger.passenger_id}</Text>
                  </View>
                  <View style={[styles.ratingBadge, { backgroundColor: passenger.rating >= 4.5 ? '#4CAF50' : passenger.rating >= 3.5 ? '#FF9800' : '#D32F2F' }]}>
                    <Text style={styles.ratingText}>Rating {passenger.rating}</Text>
                  </View>
                </View>

                <View style={styles.passengerStats}>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Rides Completed</Text>
                    <Text style={styles.statValue}>{passenger.rides_completed}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Total Earnings</Text>
                    <Text style={styles.statValue}>Rs. {passenger.total_earnings || 0}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Since</Text>
                    <Text style={styles.statValue}>{new Date(passenger.favorite_since).toLocaleDateString()}</Text>
                  </View>
                </View>

                {passenger.notes && (
                  <View style={styles.notesSection}>
                    <Text style={styles.notesLabel}>Notes:</Text>
                    <Text style={styles.notesText}>{passenger.notes}</Text>
                  </View>
                )}

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.editButton}>
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveFavorite(passenger.passenger_id)}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Add Favorite Modal */}
        <Modal visible={showAddForm} animationType="slide" transparent>
          <View style={styles.formContainer}>
            <View style={styles.formHeader}>
              <TouchableOpacity onPress={() => setShowAddForm(false)}>
                <Text style={styles.formBackText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.formTitle}>Add Favorite</Text>
              <TouchableOpacity onPress={handleAddFavorite}>
                <Text style={styles.formSaveText}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContent}>
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Passenger ID *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter passenger ID"
                  value={passengerId}
                  onChangeText={setPassengerId}
                  placeholderTextColor={theme.COLORS.TEXT_SECONDARY}
                />
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Rating</Text>
                <View style={styles.ratingSelector}>
                  {[1, 2, 3, 4, 5].map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.ratingButton, rating === r && styles.ratingButtonActive]}
                      onPress={() => setRating(r)}
                    >
                      <Text style={[styles.ratingButtonText, rating === r && styles.ratingButtonTextActive]}>
                        {`${r}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  placeholder="Add notes (optional)"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={4}
                  placeholderTextColor={theme.COLORS.TEXT_SECONDARY}
                />
              </View>
            </ScrollView>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.LIGHT_GRAY,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 14,
    color: theme.COLORS.PRIMARY,
    fontWeight: '500',
  },
  addButton: {
    padding: 8,
  },
  addButtonText: {
    fontSize: 14,
    color: theme.COLORS.PRIMARY,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 20,
  },
  addFavoriteButton: {
    backgroundColor: theme.COLORS.PRIMARY,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
  },
  addFavoriteButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  passengerCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    ...theme.SHADOWS.small,
  },
  passengerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  passengerName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
    marginBottom: 2,
  },
  passengerId: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  ratingBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  ratingText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  passengerStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.COLORS.LIGHT_GRAY,
    marginBottom: 12,
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  notesSection: {
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: theme.COLORS.TEXT,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    flex: 1,
    backgroundColor: theme.COLORS.BACKGROUND,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  removeButton: {
    flex: 1,
    backgroundColor: '#FFEBEE',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    color: theme.COLORS.PRIMARY,
    fontWeight: '600',
  },
  removeButtonText: {
    fontSize: 12,
    color: '#D32F2F',
    fontWeight: '600',
  },
  formContainer: {
    flex: 1,
    backgroundColor: theme.COLORS.BACKGROUND,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.LIGHT_GRAY,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  formBackText: {
    fontSize: 14,
    color: theme.COLORS.TEXT_SECONDARY,
    fontWeight: '500',
  },
  formSaveText: {
    fontSize: 14,
    color: theme.COLORS.PRIMARY,
    fontWeight: '600',
  },
  formContent: {
    flex: 1,
    padding: 16,
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: theme.COLORS.LIGHT_GRAY,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.COLORS.TEXT,
  },
  notesInput: {
    textAlignVertical: 'top',
  },
  ratingSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: theme.COLORS.LIGHT_GRAY,
    borderRadius: 6,
    alignItems: 'center',
  },
  ratingButtonActive: {
    backgroundColor: theme.COLORS.PRIMARY,
    borderColor: theme.COLORS.PRIMARY,
  },
  ratingButtonText: {
    fontSize: 14,
    color: theme.COLORS.TEXT,
    fontWeight: '600',
  },
  ratingButtonTextActive: {
    color: 'white',
  },
});
