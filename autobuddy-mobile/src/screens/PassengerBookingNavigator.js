import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import ServiceSelectionScreen from './ServiceSelectionScreen';
import BookingDetailsScreen from './BookingDetailsScreen';

/**
 * PassengerBookingNavigator
 * Keeps the passenger booking screens feeling like one guided flow.
 */

const FLOW_STEPS = ['Route', 'Service', 'Confirm'];

function titleFromId(value, fallback) {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeBookingLocation(booking, kind) {
  const rawLocation =
    kind === 'pickup'
      ? booking?.pickup_location || booking?.pickup
      : booking?.drop_location || booking?.dropoff_location || booking?.dropoff || booking?.drop;
  const latitude =
    rawLocation?.latitude ??
    rawLocation?.lat ??
    (kind === 'pickup' ? booking?.pickup_latitude : booking?.dropoff_latitude ?? booking?.drop_latitude);
  const longitude =
    rawLocation?.longitude ??
    rawLocation?.lng ??
    rawLocation?.lon ??
    (kind === 'pickup' ? booking?.pickup_longitude : booking?.dropoff_longitude ?? booking?.drop_longitude);
  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);

  if (!Number.isFinite(numericLatitude) || !Number.isFinite(numericLongitude)) {
    return null;
  }

  const address =
    typeof rawLocation === 'string'
      ? rawLocation
      : rawLocation?.address || rawLocation?.description || rawLocation?.name || '';

  return {
    address: String(address || (kind === 'pickup' ? 'Pickup' : 'Dropoff')).trim(),
    latitude: numericLatitude,
    longitude: numericLongitude,
  };
}

function isRepeatableBooking(booking) {
  return Boolean(
    booking &&
      normalizeBookingLocation(booking, 'pickup') &&
      normalizeBookingLocation(booking, 'dropoff'),
  );
}

function getBookingTime(booking) {
  const timestamp = Date.parse(
    booking?.created_at || booking?.updated_at || booking?.scheduled_datetime || booking?.completed_at || '',
  );
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLastRepeatableBooking(bookings) {
  const repeatable = (Array.isArray(bookings) ? bookings : [])
    .filter(isRepeatableBooking)
    .sort((a, b) => getBookingTime(b) - getBookingTime(a));

  return (
    repeatable.find((booking) => String(booking?.status || '').toLowerCase() === 'completed') ||
    repeatable[0] ||
    null
  );
}

function buildServiceFromBooking(booking) {
  const vehicleTypeId =
    booking?.vehicle_type_id || booking?.vehicle_type || booking?.vehicle_id || booking?.service?.vehicle_type_id || 'auto';
  const rideType = booking?.ride_type || booking?.ride_product || booking?.service?.ride_type || 'instant';

  return {
    vehicle_type_id: vehicleTypeId,
    vehicle_subtype_id:
      booking?.vehicle_subtype_id || booking?.vehicle_variant_id || booking?.service?.vehicle_subtype_id || null,
    vehicle_subtype_name:
      booking?.vehicle_subtype_name || booking?.vehicle_variant_name || booking?.service?.vehicle_subtype_name || null,
    vehicle_name:
      booking?.vehicle_name ||
      booking?.vehicle_type_name ||
      booking?.service?.vehicle_name ||
      titleFromId(vehicleTypeId, 'Vehicle'),
    vehicle_icon: booking?.vehicle_icon || booking?.service?.vehicle_icon || '',
    vehicle_capacity: Number(booking?.vehicle_capacity || booking?.passenger_count || 1),
    capacity_unit: booking?.capacity_unit || booking?.service?.capacity_unit || 'passengers',
    ride_type: rideType,
    ride_type_name: booking?.ride_type_name || booking?.service?.ride_type_name || titleFromId(rideType, 'Instant Ride'),
    ride_type_icon: booking?.ride_type_icon || booking?.service?.ride_type_icon || '',
    special_fields: booking?.service?.special_fields || [],
    pickup_region: booking?.pickup_region || booking?.service?.pickup_region || null,
    pickup_district: booking?.pickup_district || booking?.service?.pickup_district || null,
    pickup_pincode: booking?.pickup_pincode || booking?.service?.pickup_pincode || null,
  };
}

function shortAddress(location, fallback) {
  const address = String(location?.address || fallback || '').trim();
  if (!address) {
    return fallback;
  }
  return address.length > 42 ? `${address.slice(0, 39)}...` : address;
}

const PassengerBookingNavigator = ({
  onBookingComplete,
  onCancel,
  initialPickup = null,
  initialDropoff = null,
  recentBookings = [],
}) => {
  const [currentScreen, setCurrentScreen] = useState('service-selection');
  const [selectedService, setSelectedService] = useState(null);
  const [bookingLocations, setBookingLocations] = useState({
    pickup: initialPickup,
    dropoff: initialDropoff,
  });

  const lastRepeatableBooking = useMemo(
    () => getLastRepeatableBooking(recentBookings),
    [recentBookings],
  );

  const currentStepNumber = currentScreen === 'booking-details' ? 3 : 2;
  const selectedServiceData = selectedService?.service || null;

  const handleServiceSelected = (serviceData) => {
    setSelectedService(serviceData);
    setCurrentScreen('booking-details');
  };

  const handleBookingComplete = (bookingData) => {
    if (onBookingComplete) {
      onBookingComplete(bookingData);
    }
  };

  const handleGoBack = () => {
    if (currentScreen === 'booking-details') {
      setCurrentScreen('service-selection');
    } else {
      if (onCancel) {
        onCancel();
      }
    }
  };

  const handleEditRoute = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const handleBookLastRide = () => {
    if (!lastRepeatableBooking) {
      return;
    }
    setSelectedService({ service: buildServiceFromBooking(lastRepeatableBooking) });
    setBookingLocations({
      pickup: normalizeBookingLocation(lastRepeatableBooking, 'pickup'),
      dropoff: normalizeBookingLocation(lastRepeatableBooking, 'dropoff'),
    });
    setCurrentScreen('booking-details');
  };

  return (
    <View style={styles.container}>
      <View style={styles.flowHeader}>
        <View style={styles.flowTitleRow}>
          <View>
            <Text style={styles.flowEyebrow}>Booking flow</Text>
            <Text style={styles.flowTitle}>Book a ride</Text>
          </View>
          <TouchableOpacity style={styles.editRouteButton} onPress={handleEditRoute}>
            <Text style={styles.editRouteText}>Edit route</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.progressRow}>
          {FLOW_STEPS.map((step, index) => {
            const stepNumber = index + 1;
            const isDone = stepNumber < currentStepNumber;
            const isActive = stepNumber === currentStepNumber;
            return (
              <View key={step} style={styles.progressItem}>
                <View
                  style={[
                    styles.progressDot,
                    isDone && styles.progressDotDone,
                    isActive && styles.progressDotActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.progressNumber,
                      (isDone || isActive) && styles.progressNumberActive,
                    ]}
                  >
                    {stepNumber}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.progressLabel,
                    (isDone || isActive) && styles.progressLabelActive,
                  ]}
                >
                  {step}
                </Text>
              </View>
            );
          })}
        </View>

        {!!selectedServiceData && (
          <Text style={styles.selectionLine} numberOfLines={1}>
            {selectedServiceData.vehicle_name || titleFromId(selectedServiceData.vehicle_type_id, 'Vehicle')}
            {selectedServiceData.vehicle_subtype_name ? ` / ${selectedServiceData.vehicle_subtype_name}` : ''}
            {' - '}
            {selectedServiceData.ride_type_name || titleFromId(selectedServiceData.ride_type, 'Ride')}
          </Text>
        )}
      </View>

      {currentScreen === 'service-selection' && lastRepeatableBooking && (
        <TouchableOpacity style={styles.repeatRideCard} onPress={handleBookLastRide}>
          <View style={styles.repeatRideTextWrap}>
            <Text style={styles.repeatRideTitle}>Book last ride again</Text>
            <Text style={styles.repeatRideRoute} numberOfLines={1}>
              {shortAddress(normalizeBookingLocation(lastRepeatableBooking, 'pickup'), 'Pickup')}
              {' -> '}
              {shortAddress(normalizeBookingLocation(lastRepeatableBooking, 'dropoff'), 'Dropoff')}
            </Text>
          </View>
          <Text style={styles.repeatRideAction}>Use</Text>
        </TouchableOpacity>
      )}

      <View style={styles.screenBody}>
      {currentScreen === 'service-selection' && (
        <ServiceSelectionScreen
          navigation={{
            navigate: (screen, params) => {
              if (screen === 'BookingDetails') {
                handleServiceSelected(params);
              }
            },
            goBack: handleGoBack,
          }}
          route={{
            params: {
              initialService: selectedServiceData,
            },
          }}
        />
      )}

      {currentScreen === 'booking-details' && selectedService && (
        <BookingDetailsScreen
          navigation={{
            navigate: (screen, params) => {
              if (screen === 'RideDetails') {
                handleBookingComplete(params);
              }
              if (screen === 'ServiceSelection') {
                setCurrentScreen('service-selection');
              }
              if (screen === 'EditRoute' && onCancel) {
                onCancel();
              }
            },
            goBack: handleGoBack,
          }}
          route={{
            params: {
              ...selectedService,
              initialPickup: bookingLocations.pickup,
              initialDropoff: bookingLocations.dropoff,
            },
          }}
        />
      )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  flowHeader: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },

  flowTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  flowEyebrow: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  flowTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
  },

  editRouteButton: {
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  editRouteText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  progressRow: {
    flexDirection: 'row',
    gap: 8,
  },

  progressItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },

  progressDot: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },

  progressDotDone: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  progressDotActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },

  progressNumber: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '900',
  },

  progressNumberActive: {
    color: '#fff',
  },

  progressLabel: {
    color: COLORS.textSecondary,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
  },

  progressLabelActive: {
    color: COLORS.text,
  },

  selectionLine: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },

  repeatRideCard: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    margin: 16,
    marginBottom: 0,
    padding: 14,
    ...SHADOWS.soft,
  },

  repeatRideTextWrap: {
    flex: 1,
    gap: 4,
  },

  repeatRideTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
  },

  repeatRideRoute: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },

  repeatRideAction: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '900',
  },

  screenBody: {
    flex: 1,
  },
});

export default PassengerBookingNavigator;
