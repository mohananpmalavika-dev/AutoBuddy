import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { useShiftSchedule } from '../hooks/useShiftSchedule';
import { theme } from '../theme';

export function ShiftScheduleCalendar({ isVisible, onClose, token, driverId }) {
  const { schedules, loadSchedules, createSchedule, deleteSchedule, getTotalWeeklyHours } = useShiftSchedule({ token, driverId });
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('22:00');

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  useEffect(() => {
    if (isVisible) {
      loadSchedules();
    }
  }, [isVisible, loadSchedules]);

  const handleAddSchedule = () => {
    createSchedule(selectedDay, startTime, endTime, true);
    setShowScheduleForm(false);
    Alert.alert('Success', 'Shift schedule added');
  };

  const handleDeleteSchedule = (scheduleId) => {
    Alert.alert(
      'Delete Schedule',
      'Remove this shift schedule?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteSchedule(scheduleId) },
      ]
    );
  };

  const totalWeeklyHours = getTotalWeeklyHours();

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Shift Schedule</Text>
          <TouchableOpacity onPress={() => setShowScheduleForm(true)} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Weekly Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>📅 Weekly Summary</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Hours</Text>
                <Text style={styles.summaryValue}>{totalWeeklyHours.toFixed(1)} hrs</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Scheduled Days</Text>
                <Text style={styles.summaryValue}>{schedules.length}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Avg Daily</Text>
                <Text style={styles.summaryValue}>{schedules.length > 0 ? (totalWeeklyHours / schedules.length).toFixed(1) : 0} hrs</Text>
              </View>
            </View>
          </View>

          {/* Weekly Calendar */}
          <View style={styles.calendarSection}>
            <Text style={styles.sectionTitle}>📋 Weekly Schedule</Text>
            {DAYS.map((day, index) => {
              const daySchedule = schedules.find(s => s.day_of_week === index);
              return (
                <View key={day} style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <View>
                      <Text style={styles.dayName}>{day}</Text>
                      {daySchedule && (
                        <Text style={styles.dayTime}>
                          {daySchedule.start_time} - {daySchedule.end_time}
                        </Text>
                      )}
                    </View>
                    <View style={styles.dayStatus}>
                      {daySchedule ? (
                        <View style={[styles.statusBadge, daySchedule.is_active ? styles.statusActive : styles.statusInactive]}>
                          <Text style={styles.statusText}>{daySchedule.is_active ? 'Active' : 'Off'}</Text>
                        </View>
                      ) : (
                        <Text style={styles.offText}>Off</Text>
                      )}
                    </View>
                  </View>

                  {daySchedule && (
                    <View style={styles.dayActions}>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => {
                          setSelectedDay(index);
                          setStartTime(daySchedule.start_time);
                          setEndTime(daySchedule.end_time);
                          setShowScheduleForm(true);
                        }}
                      >
                        <Text style={styles.editButtonText}>✏️ Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteSchedule(daySchedule.id)}
                      >
                        <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Tips */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>💡 Pro Tips</Text>
            <Text style={styles.tipsText}>• Set consistent schedules to maximize earnings</Text>
            <Text style={styles.tipsText}>• Peak hours (7-9am, 5-7pm) offer better rates</Text>
            <Text style={styles.tipsText}>• Update your schedule weekly for best results</Text>
          </View>
        </ScrollView>

        {/* Add/Edit Schedule Modal */}
        <Modal visible={showScheduleForm} animationType="slide" transparent>
          <View style={styles.formContainer}>
            <View style={styles.formHeader}>
              <TouchableOpacity onPress={() => setShowScheduleForm(false)}>
                <Text style={styles.formBackText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.formTitle}>Set Shift</Text>
              <TouchableOpacity onPress={handleAddSchedule}>
                <Text style={styles.formSaveText}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContent}>
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Day of Week</Text>
                <View style={styles.daySelector}>
                  {DAYS.map((day, index) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayButton, selectedDay === index && styles.dayButtonActive]}
                      onPress={() => setSelectedDay(index)}
                    >
                      <Text style={[styles.dayButtonText, selectedDay === index && styles.dayButtonTextActive]}>
                        {day.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Start Time</Text>
                <View style={styles.timeInputContainer}>
                  <Text style={styles.timeDisplay}>{startTime}</Text>
                  <TouchableOpacity
                    style={styles.timeButton}
                    onPress={() => {
                      const [h, m] = startTime.split(':').map(Number);
                      const newH = (h + 1) % 24;
                      setStartTime(`${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }}
                  >
                    <Text style={styles.timeButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>End Time</Text>
                <View style={styles.timeInputContainer}>
                  <Text style={styles.timeDisplay}>{endTime}</Text>
                  <TouchableOpacity
                    style={styles.timeButton}
                    onPress={() => {
                      const [h, m] = endTime.split(':').map(Number);
                      const newH = (h + 1) % 24;
                      setEndTime(`${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }}
                  >
                    <Text style={styles.timeButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.shiftSummary}>
                <Text style={styles.shiftLabel}>Shift Duration</Text>
                <Text style={styles.shiftDuration}>
                  {(() => {
                    const [startH, startM] = startTime.split(':').map(Number);
                    const [endH, endM] = endTime.split(':').map(Number);
                    const duration = ((endH - startH) * 60 + (endM - startM)) / 60;
                    return `${duration.toFixed(1)} hours`;
                  })()}
                </Text>
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
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    ...theme.SHADOWS.small,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: theme.COLORS.TEXT,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.COLORS.PRIMARY,
  },
  calendarSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: theme.COLORS.TEXT,
  },
  dayCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    ...theme.SHADOWS.small,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
    marginBottom: 2,
  },
  dayTime: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  dayStatus: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: '#E8F5E9',
  },
  statusInactive: {
    backgroundColor: '#FFF3E0',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
  },
  offText: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
    fontWeight: '500',
  },
  dayActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  editButton: {
    flex: 1,
    backgroundColor: theme.COLORS.BACKGROUND,
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 11,
    color: theme.COLORS.PRIMARY,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#FFEBEE',
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 11,
    color: '#D32F2F',
    fontWeight: '600',
  },
  tipsCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFB800',
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
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
  daySelector: {
    flexDirection: 'row',
    gap: 4,
  },
  dayButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: theme.COLORS.LIGHT_GRAY,
    borderRadius: 6,
    alignItems: 'center',
  },
  dayButtonActive: {
    backgroundColor: theme.COLORS.PRIMARY,
    borderColor: theme.COLORS.PRIMARY,
  },
  dayButtonText: {
    fontSize: 11,
    color: theme.COLORS.TEXT,
    fontWeight: '600',
  },
  dayButtonTextActive: {
    color: 'white',
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeDisplay: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: theme.COLORS.LIGHT_GRAY,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  timeButton: {
    backgroundColor: theme.COLORS.PRIMARY,
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  shiftSummary: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  shiftLabel: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  shiftDuration: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.COLORS.PRIMARY,
  },
});
