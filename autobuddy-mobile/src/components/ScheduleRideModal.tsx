import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface ScheduleData {
  date: string;
  time: string;
  rideType: string;
  destination: string;
}

interface ScheduleRideModalProps {
  visible: boolean;
  destination: string;
  rideType: string;
  onConfirm: (scheduleData: ScheduleData) => void;
  onCancel: () => void;
}

export function ScheduleRideModal({
  visible,
  destination,
  rideType,
  onConfirm,
  onCancel,
}: ScheduleRideModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [notes, setNotes] = useState('');

  const handleDateSelect = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };

  const handleConfirm = () => {
    if (!selectedDate || !selectedTime) {
      Alert.alert('Required', 'Please select both date and time');
      return;
    }

    onConfirm({
      date: selectedDate,
      time: selectedTime,
      rideType,
      destination,
    });
  };

  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateStr === today.toISOString().split('T')[0]) return 'Today';
    if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const timeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '14:00', '15:00', '16:00', '17:00', '18:00',
    '19:00', '20:00', '21:00', '22:00',
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Schedule Your Ride</Text>
            <Pressable onPress={onCancel}>
              <MaterialIcons name="close" size={24} color="#999" />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {/* Destination preview */}
            <View style={styles.previewBox}>
              <MaterialIcons name="location-on" size={20} color="#2196F3" />
              <View style={styles.previewContent}>
                <Text style={styles.previewLabel}>Destination</Text>
                <Text style={styles.previewValue} numberOfLines={2}>
                  {destination}
                </Text>
              </View>
            </View>

            {/* Date selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select Date</Text>
              <View style={styles.dateGrid}>
                {[0, 1, 2, 3, 4].map(offset => {
                  const date = new Date();
                  date.setDate(date.getDate() + offset);
                  const dateStr = date.toISOString().split('T')[0];
                  const isSelected = selectedDate === dateStr;

                  return (
                    <Pressable
                      key={offset}
                      style={[
                        styles.dateButton,
                        isSelected && styles.dateButtonSelected,
                      ]}
                      onPress={() => handleDateSelect(offset)}
                    >
                      <Text
                        style={[
                          styles.dateButtonText,
                          isSelected && styles.dateButtonTextSelected,
                        ]}
                      >
                        {formatDisplayDate(dateStr)}
                      </Text>
                      <Text
                        style={[
                          styles.dateButtonSubText,
                          isSelected && styles.dateButtonSubTextSelected,
                        ]}
                      >
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Time selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select Time</Text>
              <View style={styles.timeGrid}>
                {timeSlots.map(time => {
                  const isSelected = selectedTime === time;
                  return (
                    <Pressable
                      key={time}
                      style={[
                        styles.timeButton,
                        isSelected && styles.timeButtonSelected,
                      ]}
                      onPress={() => handleTimeSelect(time)}
                    >
                      <Text
                        style={[
                          styles.timeButtonText,
                          isSelected && styles.timeButtonTextSelected,
                        ]}
                      >
                        {time}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Special notes */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Add Notes (Optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="E.g., Please arrive by back gate"
                placeholderTextColor="#ccc"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Benefits */}
            <View style={styles.benefitsBox}>
              <View style={styles.benefitItem}>
                <MaterialIcons name="local-offer" size={16} color="#4CAF50" />
                <Text style={styles.benefitText}>Save 10% on scheduled rides</Text>
              </View>
              <View style={styles.benefitItem}>
                <MaterialIcons name="schedule" size={16} color="#2196F3" />
                <Text style={styles.benefitText}>
                  Guaranteed pickup at scheduled time
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </Pressable>

            <Pressable
              style={[
                styles.button,
                styles.confirmButton,
                (!selectedDate || !selectedTime) && styles.buttonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!selectedDate || !selectedTime}
            >
              <MaterialIcons name="check" size={20} color="#fff" />
              <Text style={styles.confirmButtonText}>SCHEDULE</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  previewContent: {
    marginLeft: 12,
    flex: 1,
  },
  previewLabel: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '500',
    marginBottom: 2,
  },
  previewValue: {
    fontSize: 13,
    color: '#000',
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  dateGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  dateButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  dateButtonSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  dateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  dateButtonTextSelected: {
    color: '#2196F3',
  },
  dateButtonSubText: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  dateButtonSubTextSelected: {
    color: '#2196F3',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeButton: {
    flex: 0.3,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  timeButtonSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  timeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  timeButtonTextSelected: {
    color: '#2196F3',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000',
    textAlignVertical: 'top',
  },
  benefitsBox: {
    backgroundColor: '#F1F8E9',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitText: {
    fontSize: 12,
    color: '#558B2F',
    flex: 1,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
