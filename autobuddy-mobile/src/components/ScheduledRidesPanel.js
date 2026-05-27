import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { formatScheduleInputFromDate, validateScheduledPickup } from '../lib/scheduling';
import { COLORS, SHADOWS } from '../theme';
import ScheduledPickupPicker from './ScheduledPickupPicker';

const RECURRENCE_OPTIONS = ['none', 'daily', 'weekly', 'monthly'];
const REMINDER_OPTIONS = [
  { label: 'None', value: null },
  { label: '15 mins before', value: 15 },
  { label: '30 mins before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '2 hours before', value: 120 },
];
const FILTER_OPTIONS = ['upcoming', 'past', 'cancelled', 'all'];

export default function ScheduledRidesPanel({ token }) {
  const [loading, setLoading] = useState(false);
  const [rides, setRides] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRideId, setEditingRideId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('upcoming');
  const [formData, setFormData] = useState({
    pickup_location: '',
    dropoff_location: '',
    scheduled_time: '',
    scheduled_timezone: 'local',
    recurrence_pattern: 'none',
    reminder_minutes: 30,
    ride_notes: '',
  });
  const [error, setError] = useState('');

  const fetchScheduledRides = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/scheduled-rides', { token });
      setRides(Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load scheduled rides');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchScheduledRides().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchScheduledRides]);

  const scheduleRide = useCallback(async () => {
    if (!formData.pickup_location.trim() || !formData.dropoff_location.trim() || !formData.scheduled_time.trim()) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    const scheduleValidation = validateScheduledPickup(formData.scheduled_time, formData.scheduled_timezone);
    if (!scheduleValidation.valid) {
      Alert.alert('Error', scheduleValidation.message);
      return;
    }
    try {
      await apiRequest('/v1/passengers/scheduled-rides', {
        method: 'POST',
        token,
        body: {
          pickup_location: formData.pickup_location.trim(),
          dropoff_location: formData.dropoff_location.trim(),
          scheduled_time: scheduleValidation.iso,
          ride_type: 'normal',
          recurring: formData.recurrence_pattern !== 'none',
          recurrence_pattern: formData.recurrence_pattern === 'none' ? null : formData.recurrence_pattern,
          reminder_minutes: formData.reminder_minutes,
          ride_notes: formData.ride_notes.trim() || null,
        },
      });
      setFormData({
        pickup_location: '',
        dropoff_location: '',
        scheduled_time: '',
        scheduled_timezone: 'local',
        recurrence_pattern: 'none',
        reminder_minutes: 30,
        ride_notes: '',
      });
      setShowForm(false);
      setEditingRideId(null);
      await fetchScheduledRides();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to schedule ride');
    }
  }, [token, formData, fetchScheduledRides]);

  const updateRide = useCallback(async () => {
    if (!editingRideId) {
      return;
    }
    if (!formData.pickup_location.trim() || !formData.dropoff_location.trim() || !formData.scheduled_time.trim()) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    const scheduleValidation = validateScheduledPickup(formData.scheduled_time, formData.scheduled_timezone);
    if (!scheduleValidation.valid) {
      Alert.alert('Error', scheduleValidation.message);
      return;
    }
    try {
      await apiRequest(`/v1/passengers/scheduled-rides/${editingRideId}`, {
        method: 'PATCH',
        token,
        body: {
          pickup_location: formData.pickup_location.trim(),
          dropoff_location: formData.dropoff_location.trim(),
          scheduled_time: scheduleValidation.iso,
          ride_type: 'normal',
          recurring: formData.recurrence_pattern !== 'none',
          recurrence_pattern: formData.recurrence_pattern === 'none' ? null : formData.recurrence_pattern,
          reminder_minutes: formData.reminder_minutes,
          ride_notes: formData.ride_notes.trim() || null,
        },
      });
      setFormData({
        pickup_location: '',
        dropoff_location: '',
        scheduled_time: '',
        scheduled_timezone: 'local',
        recurrence_pattern: 'none',
        reminder_minutes: 30,
        ride_notes: '',
      });
      setShowForm(false);
      setEditingRideId(null);
      await fetchScheduledRides();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to reschedule ride');
    }
  }, [editingRideId, fetchScheduledRides, formData, token]);

  const cancelRide = useCallback(
    async (rideId) => {
      Alert.alert('Cancel Ride', 'Cancel this scheduled ride?', [
        { text: 'No' },
        {
          text: 'Yes',
          onPress: async () => {
            try {
              await apiRequest(`/v1/passengers/scheduled-rides/${rideId}`, { method: 'DELETE', token });
              await fetchScheduledRides();
            } catch (_err) {
              Alert.alert('Error', 'Failed to cancel ride');
            }
          },
          style: 'destructive',
        },
      ]);
    },
    [token, fetchScheduledRides],
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return '#2196F3';
      case 'completed':
        return '#4CAF50';
      case 'cancelled':
        return '#F44336';
      default:
        return COLORS.textMuted;
    }
  };

  const getRecurringLabel = (recurrencePattern, recurring) => {
    if (!recurring || !recurrencePattern) {
      return 'One-time';
    }
    const labels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
    return labels[recurrencePattern] || recurrencePattern;
  };

  const getReminderLabel = (minutes) => {
    if (!minutes) return 'No reminder';
    if (minutes === 15) return '15 mins before';
    if (minutes === 30) return '30 mins before';
    if (minutes === 60) return '1 hour before';
    if (minutes === 120) return '2 hours before';
    return `${minutes} mins before`;
  };

  const getFilteredRides = useCallback(() => {
    const now = new Date();
    return rides.filter((ride) => {
      const rideTime = new Date(ride.scheduled_time);
      switch (filterStatus) {
        case 'upcoming':
          return ride.status === 'scheduled' && rideTime > now;
        case 'past':
          return (ride.status === 'completed' || (ride.status === 'scheduled' && rideTime <= now));
        case 'cancelled':
          return ride.status === 'cancelled';
        case 'all':
        default:
          return true;
      }
    });
  }, [rides, filterStatus]);

  if (loading && rides.length === 0) {
    return <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />;
  }

  const filteredRides = getFilteredRides();

  return (
    <View style={styles.container}>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.filterChip, filterStatus === option && styles.filterChipActive]}
            onPress={() => setFilterStatus(option)}>
            <Text style={[styles.filterChipText, filterStatus === option && styles.filterChipTextActive]}>
              {option === 'all' ? 'All' : option.charAt(0).toUpperCase() + option.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredRides.length === 0 && !showForm ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>Later</Text>
          <Text style={styles.emptyTitle}>No {filterStatus === 'all' ? 'Scheduled Rides' : filterStatus + ' Rides'}</Text>
          <Text style={styles.emptyText}>
            {filterStatus === 'upcoming' ? 'Plan ahead by scheduling your rides in advance' : 'Nothing to show for this filter'}
          </Text>
          {filterStatus === 'upcoming' && (
            <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
              <Text style={styles.addButtonText}>Schedule a Ride</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <FlatList
            data={filteredRides}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.rideCard}>
                <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}20`, borderColor: getStatusColor(item.status) }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{String(item.status || '').toUpperCase()}</Text>
                </View>

                <View style={styles.rideDetails}>
                  <View style={styles.locationRow}>
                    <Text style={styles.locationLabel}>From</Text>
                    <Text style={styles.location}>{item.pickup_location}</Text>
                  </View>
                  <View style={styles.locationRow}>
                    <Text style={styles.locationLabel}>To</Text>
                    <Text style={styles.location}>{item.dropoff_location}</Text>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Time</Text>
                      <Text style={styles.metaValue}>{new Date(item.scheduled_time).toLocaleString()}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Recurring</Text>
                      <Text style={styles.metaValue}>{getRecurringLabel(item.recurrence_pattern, item.recurring)}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Reminder</Text>
                      <Text style={styles.metaValue}>{getReminderLabel(item.reminder_minutes)}</Text>
                    </View>
                  </View>

                  {item.ride_notes && (
                    <View style={styles.notesBlock}>
                      <Text style={styles.notesLabel}>Notes</Text>
                      <Text style={styles.notesText}>{item.ride_notes}</Text>
                    </View>
                  )}
                </View>

                {item.status === 'scheduled' && (
                  <View style={styles.scheduledActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingRideId(item.id);
                        setFormData({
                          pickup_location: String(item.pickup_location || ''),
                          dropoff_location: String(item.dropoff_location || ''),
                          scheduled_time: formatScheduleInputFromDate(new Date(item.scheduled_time), 'local'),
                          scheduled_timezone: 'local',
                          recurrence_pattern: item.recurring ? String(item.recurrence_pattern || 'weekly') : 'none',
                          reminder_minutes: item.reminder_minutes || 30,
                          ride_notes: String(item.ride_notes || ''),
                        });
                        setShowForm(true);
                      }}
                      style={styles.rescheduleBtn}>
                      <Text style={styles.rescheduleBtnText}>Reschedule</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => cancelRide(item.id)} style={styles.cancelBtn}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
            ListFooterComponent={
              !showForm && (
                <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
                  <Text style={styles.addButtonText}>+ Schedule Another Ride</Text>
                </TouchableOpacity>
              )
            }
          />

          {showForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{editingRideId ? 'Reschedule Ride' : 'Schedule a Ride'}</Text>
              <TextInput
                style={styles.input}
                placeholder="Pickup location"
                value={formData.pickup_location}
                onChangeText={(text) => setFormData({ ...formData, pickup_location: text })}
                placeholderTextColor="#AAA"
              />
              <TextInput
                style={styles.input}
                placeholder="Dropoff location"
                value={formData.dropoff_location}
                onChangeText={(text) => setFormData({ ...formData, dropoff_location: text })}
                placeholderTextColor="#AAA"
              />
              <ScheduledPickupPicker
                value={formData.scheduled_time}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, scheduled_time: text }))}
                timezone={formData.scheduled_timezone}
                onTimezoneChange={(timezone) => setFormData((prev) => ({ ...prev, scheduled_timezone: timezone }))}
                inputStyle={styles.input}
              />

              <Text style={styles.label}>Recurring</Text>
              <View style={styles.recurringOptions}>
                {RECURRENCE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.optionChip, formData.recurrence_pattern === option && styles.optionChipActive]}
                    onPress={() => setFormData({ ...formData, recurrence_pattern: option })}>
                    <Text style={[styles.optionChipText, formData.recurrence_pattern === option && styles.optionChipTextActive]}>
                      {option === 'none' ? 'One-time' : option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Reminder</Text>
              <View style={styles.reminderOptions}>
                {REMINDER_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={String(option.value)}
                    style={[styles.optionChip, formData.reminder_minutes === option.value && styles.optionChipActive]}
                    onPress={() => setFormData({ ...formData, reminder_minutes: option.value })}>
                    <Text style={[styles.optionChipText, formData.reminder_minutes === option.value && styles.optionChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Add special instructions or notes (optional)"
                value={formData.ride_notes}
                onChangeText={(text) => setFormData({ ...formData, ride_notes: text })}
                placeholderTextColor="#AAA"
                multiline
                numberOfLines={3}
              />

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn2}
                  onPress={() => {
                    setShowForm(false);
                    setEditingRideId(null);
                  }}>
                  <Text style={styles.cancelBtnText2}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={editingRideId ? updateRide : scheduleRide}>
                  <Text style={styles.saveBtnText}>{editingRideId ? 'Update' : 'Schedule'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  loader: { flex: 1, justifyContent: 'center' },
  errorText: { color: '#D32F2F', fontSize: 12, marginBottom: 10 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  emptyIcon: { fontSize: 20, fontWeight: '800', color: COLORS.primary, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: 20 },
  rideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 8,
  },
  statusText: { fontSize: 10, fontWeight: '700' },
  rideDetails: { marginBottom: 10 },
  locationRow: { marginBottom: 8 },
  locationLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 2 },
  location: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EFEFEF' },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  metaValue: { fontSize: 12, fontWeight: '600', color: COLORS.textMain, marginTop: 2 },
  scheduledActions: { flexDirection: 'row', gap: 8 },
  rescheduleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
  },
  rescheduleBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  cancelBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#F44336', alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: '#F44336' },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    ...SHADOWS.soft,
  },
  formTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textMain, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    fontSize: 13,
    color: COLORS.textMain,
  },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textMain, marginBottom: 8 },
  recurringOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  optionChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  optionChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionChipText: { fontSize: 12, color: COLORS.textMain, fontWeight: '600', textTransform: 'capitalize' },
  optionChipTextActive: { color: '#FFFFFF' },
  formActions: { flexDirection: 'row', gap: 8 },
  cancelBtn2: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelBtnText2: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  saveBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  addButton: {
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    ...SHADOWS.soft,
  },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 12, paddingHorizontal: 4 },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 12, color: COLORS.textMain, fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF' },
  notesBlock: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EFEFEF' },
  notesLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 },
  notesText: { fontSize: 12, color: COLORS.textMain, lineHeight: 18 },
  notesInput: { minHeight: 80, paddingTop: 10, textAlignVertical: 'top' },
  reminderOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
});
