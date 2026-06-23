import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
 Text } from 'react-native';

import { useFamilyAssistant } from '../hooks/useFamilyAssistant';
import { FamilyAppointment } from '../services/familyAssistantService';

interface QuickActionBookingModalProps {
  visible: boolean;
  appointment: FamilyAppointment | null;
  memberName: string;
  onClose: () => void;
  onBookingSuccess: () => void;
  token?: string;
}

export const QuickActionBookingModal: React.FC<QuickActionBookingModalProps> = ({
  visible,
  appointment,
  memberName,
  onClose,
  onBookingSuccess,
  token,
}) => {
  const { quickBookRide, bookingLoading, bookingError } = useFamilyAssistant('');

  const [selectedVehicle, setSelectedVehicle] = useState<string>('economy');
  const [estimatedFare, setEstimatedFare] = useState<number | null>(null);
  const [showingDetails, setShowingDetails] = useState(false);

  const vehicles = [
    { id: 'economy', name: 'Economy', icon: '🚗', estimated: 250 },
    { id: 'premium', name: 'Premium', icon: '🚙', estimated: 350 },
    { id: 'xl', name: 'XL', icon: '🚐', estimated: 450 },
  ];

  useEffect(() => {
    if (selectedVehicle) {
      const vehicle = vehicles.find((v) => v.id === selectedVehicle);
      if (vehicle) {
        setEstimatedFare(vehicle.estimated);
      }
    }
  }, [selectedVehicle]);

  const handleBookRide = async () => {
    if (!appointment) {return;}

    try {
      const response = await quickBookRide({
        member_id: appointment.member_id,
        appointment_id: appointment.id,
        vehicle_type: selectedVehicle,
      });

      if (response.booking_status === 'confirmed') {
        Alert.alert(
          'Booking Confirmed!',
          `Ride booked for ${memberName}. Driver will arrive in approximately ${response.estimated_arrival_minutes} minutes.`,
          [
            {
              text: 'OK',
              onPress: () => {
                onBookingSuccess();
                onClose();
              },
            },
          ]
        );
      } else {
        Alert.alert('Booking Pending', 'Your ride booking is being processed.');
      }
    } catch (error) {
      Alert.alert('Booking Failed', bookingError || 'Failed to book ride. Please try again.');
    }
  };

  if (!appointment) {return null;}

  const appointmentTime = new Date(appointment.start_time);
  const travelTime = appointment.estimated_travel_time_minutes || 15;
  const pickupTime = new Date(appointmentTime.getTime() - travelTime * 60000);

  const getAppointmentIcon = (type: string) => {
    switch (type) {
      case 'medical':
        return '🏥';
      case 'education':
        return '🎓';
      case 'work':
        return '💼';
      case 'personal':
        return '📝';
      default:
        return '📅';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Book Ride</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Appointment Details */}
            <View style={styles.appointmentDetails}>
              <Text style={styles.sectionTitle}>Appointment Details</Text>
              <View style={styles.detailsCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>{getAppointmentIcon(appointment.appointment_type)}</Text>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Appointment</Text>
                    <Text style={styles.detailValue}>{appointment.title}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>👤</Text>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>For</Text>
                    <Text style={styles.detailValue}>{memberName}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>⏰</Text>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Appointment Time</Text>
                    <Text style={styles.detailValue}>
                      {appointmentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>📍</Text>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Location</Text>
                    <Text style={styles.detailValue}>{appointment.location}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>🚗</Text>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Pickup Time</Text>
                    <Text style={styles.detailValue}>
                      {pickupTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Vehicle Selection */}
            <View style={styles.vehicleSection}>
              <Text style={styles.sectionTitle}>Select Vehicle</Text>
              <View style={styles.vehicleGrid}>
                {vehicles.map((vehicle) => (
                  <TouchableOpacity
                    key={vehicle.id}
                    style={[
                      styles.vehicleCard,
                      selectedVehicle === vehicle.id && styles.vehicleCardActive,
                    ]}
                    onPress={() => setSelectedVehicle(vehicle.id)}
                  >
                    <Text style={styles.vehicleIcon}>{vehicle.icon}</Text>
                    <Text style={styles.vehicleName}>{vehicle.name}</Text>
                    <Text style={styles.vehiclePrice}>₹{vehicle.estimated}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Pricing Summary */}
            <View style={styles.pricingSection}>
              <Text style={styles.sectionTitle}>Pricing</Text>
              <View style={styles.pricingCard}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Base Fare</Text>
                  <Text style={styles.priceValue}>₹{estimatedFare}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Tax (18%)</Text>
                  <Text style={styles.priceValue}>₹{Math.round((estimatedFare || 0) * 0.18)}</Text>
                </View>
                <View style={[styles.priceRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalPrice}>
                    ₹{Math.round((estimatedFare || 0) * 1.18)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Additional Info */}
            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>Additional Information</Text>
              <TouchableOpacity
                style={styles.infoToggle}
                onPress={() => setShowingDetails(!showingDetails)}
              >
                <Text style={styles.infoToggleText}>
                  {showingDetails ? '▼' : '▶'} Show More Details
                </Text>
              </TouchableOpacity>

              {showingDetails && (
                <View style={styles.infoDetails}>
                  <View style={styles.infoBullet}>
                    <Text style={styles.infoBulletText}>
                      ✓ Ride will pick you up {travelTime} minutes before appointment
                    </Text>
                  </View>
                  <View style={styles.infoBullet}>
                    <Text style={styles.infoBulletText}>
                      ✓ Driver has access to appointment location details
                    </Text>
                  </View>
                  <View style={styles.infoBullet}>
                    <Text style={styles.infoBulletText}>
                      ✓ SMS reminder will be sent 30 minutes before pickup
                    </Text>
                  </View>
                  <View style={styles.infoBullet}>
                    <Text style={styles.infoBulletText}>
                      ✓ You can track the ride in real-time
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionContainer}>
            {bookingError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{bookingError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={bookingLoading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bookButton, bookingLoading && styles.bookButtonDisabled]}
              onPress={handleBookRide}
              disabled={bookingLoading}
            >
              {bookingLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.bookButtonText}>Confirm & Book Ride</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '95%',
    display: 'flex',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  closeButton: {
    fontSize: 24,
    color: '#999',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  appointmentDetails: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  detailsCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  detailIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 28,
    textAlign: 'center',
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#999',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginTop: 2,
  },
  vehicleSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  vehicleGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  vehicleCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  vehicleCardActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F4',
  },
  vehicleIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  vehicleName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  vehiclePrice: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginTop: 4,
  },
  pricingSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  pricingCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  totalRow: {
    borderBottomWidth: 0,
    paddingTop: 12,
  },
  priceLabel: {
    fontSize: 13,
    color: '#666',
  },
  priceValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  totalPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  infoToggle: {
    paddingVertical: 10,
  },
  infoToggleText: {
    color: '#2196F3',
    fontWeight: 'bold',
    fontSize: 13,
  },
  infoDetails: {
    marginTop: 10,
    paddingLeft: 4,
  },
  infoBullet: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoBulletText: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10,
  },
  errorBanner: {
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  errorText: {
    color: '#CC0000',
    fontSize: 12,
  },
  cancelButton: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#666',
  },
  bookButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  bookButtonDisabled: {
    opacity: 0.6,
  },
  bookButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
