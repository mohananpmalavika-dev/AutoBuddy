import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Switch
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useScheduledRides } from '../../hooks/useScheduledRides';

// ==================== SCHEDULE RIDE SCREEN ====================

export const ScheduleRideScreen: React.FC<{
  userId: string;
  authToken: string;
  pickupLocation: { latitude: number; longitude: number; address: string };
  dropoffLocation: { latitude: number; longitude: number; address: string };
  onSuccess: () => void;
}> = ({ userId, authToken, pickupLocation, dropoffLocation, onSuccess }) => {
  const { scheduleRide, isLoading } = useScheduledRides(userId, authToken);

  const [selectedDate, setSelectedDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [vehicleType, setVehicleType] = useState('economy');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringType, setRecurringType] = useState('never');
  const [recurringEndDate, setRecurringEndDate] = useState<Date | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleDateChange = (event: any, date?: Date) => {
    if (date) {setSelectedDate(date);}
    setShowDatePicker(false);
  };

  const handleTimeChange = (event: any, date?: Date) => {
    if (date) {setSelectedTime(date);}
    setShowTimePicker(false);
  };

  const handleSchedule = async () => {
    // Combine date and time
    const scheduledDateTime = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      selectedTime.getHours(),
      selectedTime.getMinutes()
    );

    const result = await scheduleRide({
      pickup_latitude: pickupLocation.latitude,
      pickup_longitude: pickupLocation.longitude,
      pickup_address: pickupLocation.address,
      dropoff_latitude: dropoffLocation.latitude,
      dropoff_longitude: dropoffLocation.longitude,
      dropoff_address: dropoffLocation.address,
      scheduled_at: scheduledDateTime,
      vehicle_type: vehicleType,
      recurring_type: isRecurring ? recurringType : 'never',
      recurring_end_date: recurringEndDate || undefined
    });

    if (result) {
      Alert.alert('Success', 'Ride scheduled successfully!', [
        { text: 'OK', onPress: onSuccess }
      ]);
    } else {
      Alert.alert('Error', 'Failed to schedule ride');
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Location Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ride Details</Text>
        <View style={styles.locationBox}>
          <Text style={styles.label}>From:</Text>
          <Text style={styles.address}>{pickupLocation.address}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>
            To:
          </Text>
          <Text style={styles.address}>{dropoffLocation.address}</Text>
        </View>
      </View>

      {/* Date and Time Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Schedule</Text>

        <TouchableOpacity
          style={styles.dateTimeButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.dateTimeLabel}>Date</Text>
          <Text style={styles.dateTimeValue}>{selectedDate.toDateString()}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateTimeButton}
          onPress={() => setShowTimePicker(true)}
        >
          <Text style={styles.dateTimeLabel}>Time</Text>
          <Text style={styles.dateTimeValue}>{selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="spinner"
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}

        {showTimePicker && (
          <DateTimePicker
            value={selectedTime}
            mode="time"
            display="spinner"
            onChange={handleTimeChange}
          />
        )}
      </View>

      {/* Vehicle Type */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vehicle Type</Text>
        <View style={styles.vehicleOptions}>
          {['economy', 'premium', 'xl'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.vehicleOption,
                vehicleType === type && styles.vehicleOptionActive
              ]}
              onPress={() => setVehicleType(type)}
            >
              <Text
                style={[
                  styles.vehicleText,
                  vehicleType === type && styles.vehicleTextActive
                ]}
              >
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Recurring */}
      <View style={styles.section}>
        <View style={styles.recurringToggle}>
          <Text style={styles.label}>Recurring Ride?</Text>
          <Switch value={isRecurring} onValueChange={setIsRecurring} />
        </View>

        {isRecurring && (
          <>
            <Text style={styles.label}>Repeat</Text>
            <View style={styles.recurringOptions}>
              {[
                { label: 'Daily', value: 'daily' },
                { label: 'Weekdays', value: 'weekdays' },
                { label: 'Weekly', value: 'weekly' }
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.recurringOption,
                    recurringType === option.value && styles.recurringOptionActive
                  ]}
                  onPress={() => setRecurringType(option.value)}
                >
                  <Text
                    style={[
                      styles.recurringText,
                      recurringType === option.value && styles.recurringTextActive
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.endDateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.label}>End Date (optional)</Text>
              <Text style={styles.endDateValue}>
                {recurringEndDate ? recurringEndDate.toDateString() : 'No end date'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Special Instructions */}
      <View style={styles.section}>
        <Text style={styles.label}>Special Instructions (optional)</Text>
        <TextInput
          style={styles.instructionsInput}
          placeholder="e.g., Please wait 5 minutes"
          value={specialInstructions}
          onChangeText={setSpecialInstructions}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Schedule Button */}
      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, styles.buttonLarge]}
        onPress={handleSchedule}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Schedule Ride</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

// ==================== SCHEDULED RIDES LIST SCREEN ====================

export const ScheduledRidesListScreen: React.FC<{ userId: string; authToken: string }> = ({
  userId,
  authToken
}) => {
  const { upcomingRides, isLoading, formatDate, formatTime, cancelRide } = useScheduledRides(
    userId,
    authToken
  );

  const handleCancel = (rideId: string) => {
    Alert.alert(
      'Cancel Ride?',
      'Are you sure? You will receive a refund.',
      [
        { text: 'No', onPress: () => {} },
        {
          text: 'Yes, Cancel',
          onPress: async () => {
            const success = await cancelRide(rideId, 'User cancelled');
            if (success) {
              Alert.alert('Success', 'Ride cancelled');
            }
          }
        }
      ]
    );
  };

  const renderRide = ({ item }: { item: any }) => (
    <View style={styles.rideCard}>
      <View style={styles.rideTime}>
        <Text style={styles.rideDate}>{formatDate(item.scheduled_at)}</Text>
        <Text style={styles.rideTimeValue}>{formatTime(item.scheduled_at)}</Text>
      </View>

      <View style={styles.rideInfo}>
        <Text style={styles.rideAddress} numberOfLines={1}>
          {item.pickup_address}
        </Text>
        <Text style={styles.rideArrow}>↓</Text>
        <Text style={styles.rideAddress} numberOfLines={1}>
          {item.dropoff_address}
        </Text>
      </View>

      <View style={styles.rideFare}>
        <Text style={styles.rideFareAmount}>₹{item.estimated_fare}</Text>
        <View
          style={[
            styles.statusBadge,
            item.status === 'confirmed' ? styles.statusConfirmed : styles.statusScheduled
          ]}
        >
          <Text
            style={[
              styles.statusText,
              item.status === 'confirmed' ? styles.statusTextConfirmed : styles.statusTextScheduled
            ]}
          >
            {item.status === 'confirmed' ? '✓ Driver' : 'Scheduled'}
          </Text>
        </View>
      </View>

      <View style={styles.rideActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
          <Text style={styles.actionButtonText}>Reschedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonDanger]}
          onPress={() => handleCancel(item.ride_id)}
        >
          <Text style={styles.actionButtonTextDanger}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading && !upcomingRides.length) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {upcomingRides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No scheduled rides</Text>
          <Text style={styles.emptySubtext}>Schedule a ride in advance for convenience</Text>
        </View>
      ) : (
        <FlatList
          data={upcomingRides}
          renderItem={renderRide}
          keyExtractor={(item) => item.ride_id}
          scrollEnabled={false}
        />
      )}
    </View>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999'
  },

  section: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },

  locationBox: {
    backgroundColor: '#F9F9F9',
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35'
  },
  address: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500'
  },

  dateTimeButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10
  },
  dateTimeLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500'
  },
  dateTimeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B35'
  },

  vehicleOptions: {
    flexDirection: 'row',
    gap: 10
  },
  vehicleOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center'
  },
  vehicleOptionActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35'
  },
  vehicleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  vehicleTextActive: {
    color: '#FFF'
  },

  recurringToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  recurringOptions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
  },
  recurringOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center'
  },
  recurringOptionActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35'
  },
  recurringText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  recurringTextActive: {
    color: '#FFF'
  },

  endDateButton: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    padding: 12
  },
  endDateValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B35',
    marginTop: 4
  },

  instructionsInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top'
  },

  button: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  buttonPrimary: {
    backgroundColor: '#FF6B35'
  },
  buttonLarge: {
    width: '100%'
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16
  },

  rideCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2
  },
  rideTime: {
    marginBottom: 12
  },
  rideDate: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500'
  },
  rideTimeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B35'
  },

  rideInfo: {
    backgroundColor: '#F9F9F9',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12
  },
  rideAddress: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500'
  },
  rideArrow: {
    fontSize: 12,
    color: '#CCC',
    marginVertical: 4,
    textAlign: 'center'
  },

  rideFare: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  rideFareAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333'
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4
  },
  statusScheduled: {
    backgroundColor: '#FFF3E0'
  },
  statusConfirmed: {
    backgroundColor: '#E8F5E9'
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600'
  },
  statusTextScheduled: {
    color: '#F57C00'
  },
  statusTextConfirmed: {
    color: '#2E7D32'
  },

  rideActions: {
    flexDirection: 'row',
    gap: 8
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#FF6B35',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center'
  },
  actionButtonDanger: {
    borderColor: '#E53E3E',
    backgroundColor: '#FEE'
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B35'
  },
  actionButtonTextDanger: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E53E3E'
  }
});
