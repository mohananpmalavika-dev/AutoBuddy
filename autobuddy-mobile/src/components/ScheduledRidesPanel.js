import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, Modal, TextInput } from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { useScheduledRides } from '../contexts/ScheduledRidesContext';

/**
 * ScheduledRidesPanel - View and manage scheduled rides
 */
export default function ScheduledRidesPanel() {
  const { getUpcomingRides, cancelScheduledRide, rescheduleRide } = useScheduledRides();
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedRide, setSelectedRide] = useState(null);
  const [newDateTime, setNewDateTime] = useState('');

  const upcomingRides = getUpcomingRides();

  const handleCancel = (rideId) => {
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel this scheduled ride?', [
      { text: 'No', onPress: () => {} },
      {
        text: 'Yes',
        onPress: () => {
          cancelScheduledRide(rideId);
          Alert.alert('Success', 'Ride cancelled');
        },
      },
    ]);
  };

  const handleReschedule = () => {
    if (!newDateTime.trim()) {
      Alert.alert('Error', 'Please enter a date and time');
      return;
    }
    rescheduleRide(selectedRide.id, newDateTime);
    setShowRescheduleModal(false);
    Alert.alert('Success', 'Ride rescheduled');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scheduled Rides</Text>

      {upcomingRides.length === 0 ? (
        <Text style={styles.emptyText}>No scheduled rides</Text>
      ) : (
        <FlatList
          data={upcomingRides}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.rideItem}>
              <View style={styles.rideInfo}>
                <Text style={styles.rideTime}>
                  {new Date(item.scheduledAt).toLocaleString()}
                </Text>
                <Text style={styles.rideRoute}>
                  {item.from} → {item.to}
                </Text>
              </View>
              <View style={styles.rideActions}>
                <TouchableOpacity
                  style={styles.rescheduleBtn}
                  onPress={() => {
                    setSelectedRide(item);
                    setShowRescheduleModal(true);
                  }}
                >
                  <Text style={styles.actionText}>Reschedule</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => handleCancel(item.id)}
                >
                  <Text style={styles.actionText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          scrollEnabled={false}
        />
      )}

      {/* Reschedule Modal */}
      <Modal visible={showRescheduleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reschedule Ride</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter new date and time (YYYY-MM-DD HH:MM)"
              value={newDateTime}
              onChangeText={setNewDateTime}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowRescheduleModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleReschedule}
              >
                <Text style={[styles.modalButtonText, { color: 'white' }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  emptyText: {
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  rideItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  rideInfo: {
    flex: 1,
  },
  rideTime: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  rideRoute: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  rideActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rescheduleBtn: {
    paddingHorizontal: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    justifyContent: 'center',
  },
  cancelBtn: {
    paddingHorizontal: 8,
    backgroundColor: '#F44336',
    borderRadius: 6,
    justifyContent: 'center',
  },
  actionText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '85%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#EEE',
    alignItems: 'center',
  },
  modalConfirmButton: {
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    fontWeight: '600',
    color: COLORS.textMain,
  },
});
