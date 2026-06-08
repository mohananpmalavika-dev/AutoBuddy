import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import ScheduledPickupPicker from '../components/ScheduledPickupPicker';
import { apiRequest } from '../lib/api';
import { validateScheduledPickup } from '../lib/scheduling';
import { getSocket } from '../services/socketClient';
import { formatToIST } from '../utils/time';

const DEFAULT_DRIVER_RADIUS_KM = 2;
const SCHEDULED_MIN_ADVANCE_MINUTES = 30;
const DEFAULT_PASSENGER_CAPACITY_BY_VEHICLE = {
  auto: 3,
  taxi: 4,
  xl: 6,
  traveller: 8,
  bus: 40,
};
const DRIVER_GENDER_OPTIONS = [
  { label: 'Any', value: 'any' },
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
];
const RIDE_PRODUCT_ALIASES = {
  instant: 'normal',
  rental: 'rental_hourly',
  goods: 'normal',
};
const RENTAL_PACKAGE_HOURS_MAX = 12;

function normalizeInitialLocation(location) {
  if (!location) {
    return { address: '', coords: null };
  }

  if (typeof location === 'string') {
    return { address: location, coords: null };
  }

  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng);
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);

  return {
    address: String(location.address || location.name || '').trim(),
    coords: hasCoords ? { latitude, longitude } : null,
  };
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.max(min, Math.min(max, numeric));
}

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function getServicePassengerCapacity(service) {
  const vehicleTypeId = String(service?.vehicle_type_id || service?.vehicle_type || '').toLowerCase();
  const defaultCapacity = DEFAULT_PASSENGER_CAPACITY_BY_VEHICLE[vehicleTypeId] || 6;
  const explicitCapacity =
    positiveNumber(service?.vehicle_subtype_capacity) ||
    positiveNumber(service?.vehicle_capacity) ||
    positiveNumber(service?.capacity_passengers) ||
    positiveNumber(service?.passenger_capacity) ||
    positiveNumber(service?.max_passengers);

  return Math.max(explicitCapacity || 0, defaultCapacity);
}

function money(value) {
  const numeric = Number(value || 0);
  return `INR ${numeric.toFixed(2)}`;
}

function km(value) {
  const numeric = Number(value || 0);
  return `${numeric.toFixed(2)} km`;
}

function compactAddress(location, fallback) {
  const text = String(location?.address || fallback || '').trim();
  if (!text) {
    return fallback;
  }
  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

function normalizeRideProduct(value) {
  const raw = String(value || 'normal').trim().toLowerCase();
  return RIDE_PRODUCT_ALIASES[raw] || raw || 'normal';
}

function normalizeDriverGenderPreference(value) {
  const raw = String(value || 'any').trim().toLowerCase();
  return DRIVER_GENDER_OPTIONS.some((option) => option.value === raw) ? raw : 'any';
}

function driverGenderPreferenceLabel(value) {
  const normalized = normalizeDriverGenderPreference(value);
  return DRIVER_GENDER_OPTIONS.find((option) => option.value === normalized)?.label || 'Any';
}

function bookingLocationPayload(location, fallbackAddress, extras = {}) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    address: location.address || fallbackAddress,
    ...extras,
  };
}

function normalizePromo(promo, code) {
  const source = promo?.data || promo || null;
  if (!source) {
    return null;
  }

  return {
    code: String(code || source.code || '').trim().toUpperCase(),
    discountType: String(source.discount_type || '').toLowerCase(),
    discountValue: Number(source.discount_value || source.discount || 0),
    maxDiscount:
      source.max_discount === undefined || source.max_discount === null
        ? null
        : Number(source.max_discount),
  };
}

function getDiscountAmount(fareAmount, promo) {
  if (!promo || !Number.isFinite(fareAmount) || fareAmount <= 0) {
    return 0;
  }

  let discount = 0;
  if (promo.discountType === 'percentage') {
    discount = fareAmount * (promo.discountValue / 100);
  } else {
    discount = promo.discountValue;
  }

  if (Number.isFinite(promo.maxDiscount) && promo.maxDiscount > 0) {
    discount = Math.min(discount, promo.maxDiscount);
  }

  return Math.max(0, Math.min(fareAmount, discount));
}

/**
 * BookingDetailsScreen
 * Final step in the two-screen passenger booking flow.
 * Pickup, dropoff, vehicle, and ride type are selected before this screen.
 */
const BookingDetailsScreen = ({ navigation, route }) => {
  const service = route.params?.service || {};
  const {
    vehicle_type_id,
    vehicle_subtype_id,
    vehicle_name,
    vehicle_subtype_name,
    capacity_unit,
    ride_type,
    ride_type_name,
  } = service;

  const initialPickup = useMemo(
    () => normalizeInitialLocation(route.params?.initialPickup),
    [route.params?.initialPickup],
  );
  const initialDropoff = useMemo(
    () => normalizeInitialLocation(route.params?.initialDropoff),
    [route.params?.initialDropoff],
  );

  const maxPassengerCount =
    String(capacity_unit || '').toLowerCase() !== 'kg' ? getServicePassengerCapacity(service) : 6;
  const hasRoute = Boolean(initialPickup.coords && initialDropoff.coords);

  const [passengerCount, setPassengerCount] = useState(1);
  const [passengerCountInput, setPassengerCountInput] = useState('1');
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoMessage, setPromoMessage] = useState('');
  const [fareEstimate, setFareEstimate] = useState(null);
  const [fareLoading, setFareLoading] = useState(false);
  const [fareError, setFareError] = useState('');
  const [driverRadiusKm, setDriverRadiusKm] = useState(DEFAULT_DRIVER_RADIUS_KM);
  const [driverRadiusInput, setDriverRadiusInput] = useState(String(DEFAULT_DRIVER_RADIUS_KM));
  const [showRadiusEditor, setShowRadiusEditor] = useState(false);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driversError, setDriversError] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [scheduledTimeZone, setScheduledTimeZone] = useState('local');
  const [driverGenderPreference, setDriverGenderPreference] = useState('any');
  const [rentalHoursInput, setRentalHoursInput] = useState('4');
  const [corporateCode, setCorporateCode] = useState('');
  const [corporatePurpose, setCorporatePurpose] = useState('');
  const [airportTerminal, setAirportTerminal] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [intercityReturnTrip, setIntercityReturnTrip] = useState(false);
  const [intercityWaitHoursInput, setIntercityWaitHoursInput] = useState('0');
  const [womenOnlyGuardianName, setWomenOnlyGuardianName] = useState('');
  const [womenOnlyGuardianPhone, setWomenOnlyGuardianPhone] = useState('');
  const [womenOnlyFemaleDriverRequired, setWomenOnlyFemaleDriverRequired] = useState(true);
  const [petType, setPetType] = useState('');
  const [petCountInput, setPetCountInput] = useState('1');

  const fareAmount = Number(fareEstimate?.total_fare || fareEstimate?.estimated_fare || 0);
  const discountAmount = getDiscountAmount(fareAmount, appliedPromo);
  const payableFare = Math.max(0, fareAmount - discountAmount);
  const rideProduct = normalizeRideProduct(ride_type);
  const isScheduledRide = rideProduct === 'scheduled';
  const isRentalRide = rideProduct === 'rental_hourly';
  const isCorporateRide = rideProduct === 'corporate';
  const isAirportRide = rideProduct === 'airport';
  const isIntercityRide = rideProduct === 'intercity';
  const isTourismRide = rideProduct === 'tourism';
  const isWomenOnlyRide = rideProduct === 'women_only';
  const isPetRide = rideProduct === 'pet';
  const normalizedDriverGenderPreference = normalizeDriverGenderPreference(driverGenderPreference);
  const rentalHours = clampNumber(Math.round(Number(rentalHoursInput || 0)), 1, RENTAL_PACKAGE_HOURS_MAX);
  const intercityWaitHours = clampNumber(Math.round(Number(intercityWaitHoursInput || 0)), 0, 72);
  const petCount = clampNumber(Math.round(Number(petCountInput || 1)), 1, 4);
  const scheduledPreview = isScheduledRide
    ? validateScheduledPickup(
        scheduledAtInput,
        scheduledTimeZone,
        {
          required: 'Select pickup time for scheduled ride.',
          invalid: 'Enter pickup time as YYYY-MM-DD HH:mm.',
          future: `Scheduled rides must be booked at least ${SCHEDULED_MIN_ADVANCE_MINUTES} minutes in advance.`,
        },
        new Date(),
        SCHEDULED_MIN_ADVANCE_MINUTES,
      )
    : null;
  const serviceLabel = [
    vehicle_name || vehicle_type_id || 'Vehicle',
    vehicle_subtype_name,
    ride_type_name || ride_type || 'Ride',
  ].filter(Boolean).join(' - ');

  const updatePassengerCount = (nextValue) => {
    const next = clampNumber(Math.round(nextValue), 1, maxPassengerCount);
    setPassengerCount(next);
    setPassengerCountInput(String(next));
  };

  const handlePassengerInputChange = (value) => {
    const cleaned = String(value || '').replace(/[^0-9]/g, '');
    setPassengerCountInput(cleaned);
    if (cleaned) {
      setPassengerCount(clampNumber(Math.round(Number(cleaned)), 1, maxPassengerCount));
    }
  };

  const commitPassengerInput = () => {
    updatePassengerCount(passengerCountInput || 1);
  };

  const loadFareEstimate = useCallback(async () => {
    if (!hasRoute) {
      setFareEstimate(null);
      return;
    }

    try {
      setFareLoading(true);
      setFareError('');
      const estimate = await apiRequest('/fare/estimate', {
        method: 'POST',
        body: {
          pickup_location: {
            latitude: initialPickup.coords.latitude,
            longitude: initialPickup.coords.longitude,
            address: initialPickup.address,
          },
          drop_location: {
            latitude: initialDropoff.coords.latitude,
            longitude: initialDropoff.coords.longitude,
            address: initialDropoff.address,
          },
          vehicle_type_id: vehicle_type_id || undefined,
          vehicle_subtype_id: vehicle_subtype_id || undefined,
          ride_type: rideProduct,
          rental_hours: isRentalRide ? rentalHours : undefined,
        },
      });
      setFareEstimate(estimate);
    } catch (error) {
      setFareEstimate(null);
      setFareError(error.message || 'Could not calculate fare estimate.');
    } finally {
      setFareLoading(false);
    }
  }, [hasRoute, initialDropoff, initialPickup, isRentalRide, rentalHours, rideProduct, vehicle_subtype_id, vehicle_type_id]);

  const loadNearbyDrivers = useCallback(async () => {
    if (!hasRoute) {
      setNearbyDrivers([]);
      return;
    }

    try {
      setDriversLoading(true);
      setDriversError('');
      const drivers = await apiRequest('/drivers/nearby', {
        query: {
          latitude: initialPickup.coords.latitude,
          longitude: initialPickup.coords.longitude,
          drop_latitude: initialDropoff.coords.latitude,
          drop_longitude: initialDropoff.coords.longitude,
          radius_km: driverRadiusKm,
          vehicle_type_id,
          vehicle_subtype_id,
          ride_type,
        },
      });
      const visibleDrivers = (Array.isArray(drivers) ? drivers : [])
        .filter((driver) => Number(driver?.distance_km || 0) <= driverRadiusKm)
        .sort((a, b) => Number(a?.distance_km || 0) - Number(b?.distance_km || 0));
      setNearbyDrivers(visibleDrivers);
    } catch (error) {
      setNearbyDrivers([]);
      setDriversError(error.message || 'Could not load nearby drivers.');
    } finally {
      setDriversLoading(false);
    }
  }, [driverRadiusKm, hasRoute, initialDropoff, initialPickup, ride_type, vehicle_subtype_id, vehicle_type_id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadFareEstimate();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadFareEstimate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadNearbyDrivers();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadNearbyDrivers]);

  const validatePromoCode = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) {
      setPromoMessage('Enter a promo code.');
      setAppliedPromo(null);
      return;
    }
    if (!fareAmount) {
      setPromoMessage('Fare estimate is needed before checking promo code.');
      setAppliedPromo(null);
      return;
    }

    try {
      setPromoMessage('Checking promo...');
      const response = await apiRequest('/v1/passengers/promo-codes/validate', {
        method: 'POST',
        body: {
          code,
          ride_fare: Math.max(1, fareAmount),
        },
      });
      const promo = normalizePromo(response, code);
      setAppliedPromo(promo);
      setPromoMessage(promo ? `${promo.code} applied.` : 'Promo applied.');
    } catch (error) {
      setAppliedPromo(null);
      setPromoMessage(error.message || 'Invalid or expired promo code.');
    }
  };

  const clearPromo = () => {
    setPromoCode('');
    setAppliedPromo(null);
    setPromoMessage('');
  };

  const handleEditService = () => {
    navigation.navigate?.('ServiceSelection');
  };

  const handleEditRoute = () => {
    navigation.navigate?.('EditRoute');
  };

  const applyRadiusInput = () => {
    const nextRadius = clampNumber(Number(driverRadiusInput), 0.5, 50);
    setDriverRadiusKm(nextRadius);
    setDriverRadiusInput(String(nextRadius));
    setShowRadiusEditor(false);
  };

  const getDriverFare = (driver) => {
    const projectedFare = Number(driver?.projected_fare);
    if (Number.isFinite(projectedFare) && projectedFare > 0) {
      return projectedFare;
    }
    const multiplier = Number(driver?.fare_multiplier || 1);
    const pickupSurcharge = Number(driver?.pickup_surcharge || 0);
    return Number(((fareAmount || 0) * multiplier + pickupSurcharge).toFixed(2));
  };

  const handleBookRide = async () => {
    if (!hasRoute) {
      Alert.alert(
        'Locations Required',
        'Please go back and select both pickup and dropoff locations.',
      );
      return;
    }

    if (passengerCount > maxPassengerCount) {
      Alert.alert(
        'Capacity Exceeded',
        `Selected vehicle seats up to ${maxPassengerCount} passengers.`,
      );
      return;
    }

    if (isRentalRide && (!Number.isFinite(rentalHours) || rentalHours < 1)) {
      Alert.alert('Rental Package', 'Enter rental package hours from 1 to 12.');
      return;
    }

    if (isCorporateRide && !corporateCode.trim()) {
      Alert.alert('Corporate Code', 'Enter the corporate booking code.');
      return;
    }

    if (isAirportRide && (!airportTerminal.trim() || !flightNumber.trim())) {
      Alert.alert('Flight Details', 'Enter terminal and flight number for airport booking.');
      return;
    }

    let scheduledForIso;
    if (isScheduledRide) {
      const validation = validateScheduledPickup(
        scheduledAtInput,
        scheduledTimeZone,
        {
          required: 'Select pickup time for scheduled ride.',
          invalid: 'Enter pickup time as YYYY-MM-DD HH:mm.',
          future: `Scheduled rides must be booked at least ${SCHEDULED_MIN_ADVANCE_MINUTES} minutes in advance.`,
        },
        new Date(),
        SCHEDULED_MIN_ADVANCE_MINUTES,
      );
      if (!validation.valid) {
        Alert.alert('Scheduled Pickup', validation.message);
        return;
      }
      scheduledForIso = validation.iso;
    }

    try {
      setBookingLoading(true);
      const pickupLocation = bookingLocationPayload(initialPickup, 'Pickup', {
        region: service.pickup_region || undefined,
        district: service.pickup_district || undefined,
        pincode: service.pickup_pincode || undefined,
      });
      const dropLocation = bookingLocationPayload(initialDropoff, 'Dropoff', {
        distance_km: Number(fareEstimate?.distance_km || 0) > 0 ? Number(fareEstimate.distance_km) : undefined,
      });

      const bookingData = {
        pickup_location: pickupLocation,
        drop_location: dropLocation,
        ride_product: rideProduct,
        passenger_count: passengerCount,
        scheduled_for: scheduledForIso,
        driver_gender_preference:
          isScheduledRide || isWomenOnlyRide ? normalizedDriverGenderPreference : 'any',
        payment_method: 'cash',
        promo_code: appliedPromo?.code || promoCode.trim() || undefined,
        corporate_code: isCorporateRide ? corporateCode.trim() : undefined,
        corporate_purpose: isCorporateRide && corporatePurpose.trim() ? corporatePurpose.trim() : undefined,
        airport_terminal: isAirportRide ? airportTerminal.trim() : undefined,
        flight_number: isAirportRide ? flightNumber.trim() : undefined,
        intercity_return_trip: isIntercityRide ? intercityReturnTrip : false,
        intercity_wait_hours: isIntercityRide ? intercityWaitHours : undefined,
        tourism_city:
          isTourismRide ? service.pickup_district || service.pickup_region || pickupLocation.address : undefined,
        tourism_package_type: isTourismRide ? 'full_day' : undefined,
        women_only_required: isWomenOnlyRide,
        passenger_gender: isWomenOnlyRide ? 'female' : undefined,
        women_only_female_driver_required: isWomenOnlyRide ? womenOnlyFemaleDriverRequired : undefined,
        women_only_allow_trusted_male_driver: isWomenOnlyRide ? !womenOnlyFemaleDriverRequired : undefined,
        women_only_guardian_name:
          isWomenOnlyRide && womenOnlyGuardianName.trim() ? womenOnlyGuardianName.trim() : undefined,
        women_only_guardian_phone:
          isWomenOnlyRide && womenOnlyGuardianPhone.trim() ? womenOnlyGuardianPhone.trim() : undefined,
        rental_hours: isRentalRide ? rentalHours : undefined,
        pet_type: isPetRide && petType.trim() ? petType.trim() : undefined,
        pet_count: isPetRide ? petCount : undefined,
        vehicle_type_id: vehicle_type_id || undefined,
        vehicle_subtype_id: vehicle_subtype_id || undefined,
        vehicle_model: vehicle_subtype_name || vehicle_name || undefined,
      };

      const bookingResponse = await apiRequest('/bookings/advanced', {
        method: 'POST',
        body: bookingData,
      });
      const bookingId = bookingResponse?.booking_id || bookingResponse?.id;

      if (bookingId) {
        try {
          getSocket()?.emit?.('booking_created', { booking_id: bookingId });
        } catch {
          // Socket notification is best-effort; booking success should continue.
        }

        navigation.navigate('RideDetails', {
          ...(bookingResponse || {}),
          booking: bookingResponse,
          bookingId,
          booking_id: bookingId,
          id: bookingResponse?.id || bookingId,
          status: bookingResponse?.status || (isScheduledRide ? 'scheduled' : 'pending'),
        });
      }
    } catch (error) {
      Alert.alert('Booking Failed', error.message || 'Unable to create booking');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>{'<- Service'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.tripSetupCard}>
          <View style={styles.tripSetupHeader}>
            <View style={styles.tripSetupCopy}>
              <Text style={styles.tripSetupEyebrow}>Ready to confirm</Text>
              <Text style={styles.tripSetupTitle} numberOfLines={1}>{serviceLabel}</Text>
            </View>
            <TouchableOpacity style={styles.tripEditButton} onPress={handleEditService}>
              <Text style={styles.tripEditButtonText}>Edit service</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.routeLine}>
            <Text style={styles.routeLabel}>Pickup</Text>
            <Text style={styles.routeValue} numberOfLines={1}>
              {compactAddress(initialPickup, 'Pickup not selected')}
            </Text>
          </View>
          <View style={styles.routeLine}>
            <Text style={styles.routeLabel}>Dropoff</Text>
            <Text style={styles.routeValue} numberOfLines={1}>
              {compactAddress(initialDropoff, 'Dropoff not selected')}
            </Text>
          </View>
          <TouchableOpacity style={styles.routeEditLink} onPress={handleEditRoute}>
            <Text style={styles.routeEditLinkText}>Edit route</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Number of Passengers</Text>
          <View style={styles.counterContainer}>
            <TouchableOpacity
              style={[styles.counterButton, passengerCount <= 1 && styles.counterButtonDisabled]}
              onPress={() => updatePassengerCount(passengerCount - 1)}
              disabled={passengerCount <= 1}
            >
              <Text style={styles.counterButtonText}>-</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.counterInput}
              value={passengerCountInput}
              onChangeText={handlePassengerInputChange}
              onBlur={commitPassengerInput}
              onSubmitEditing={commitPassengerInput}
              keyboardType="numeric"
              inputMode="numeric"
              maxLength={Math.max(2, String(maxPassengerCount).length)}
              selectTextOnFocus
              accessibilityLabel="Passenger count"
            />
            <TouchableOpacity
              style={[
                styles.counterButton,
                passengerCount >= maxPassengerCount && styles.counterButtonDisabled,
              ]}
              onPress={() => updatePassengerCount(passengerCount + 1)}
              disabled={passengerCount >= maxPassengerCount}
            >
              <Text style={styles.counterButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          {maxPassengerCount > 1 && (
            <Text style={styles.hint}>
              Maximum {maxPassengerCount} passengers for this vehicle
            </Text>
          )}
        </View>

        {isScheduledRide && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Scheduled Pickup</Text>
            <ScheduledPickupPicker
              value={scheduledAtInput}
              onChangeText={setScheduledAtInput}
              timezone={scheduledTimeZone}
              onTimezoneChange={setScheduledTimeZone}
              inputStyle={styles.textInput}
              minAdvanceMinutes={SCHEDULED_MIN_ADVANCE_MINUTES}
              messages={{
                required: 'Select pickup time for scheduled ride.',
                invalid: 'Enter pickup time as YYYY-MM-DD HH:mm.',
                future: `Scheduled rides must be booked at least ${SCHEDULED_MIN_ADVANCE_MINUTES} minutes in advance.`,
              }}
            />
            <View style={styles.preferenceBlock}>
              <Text style={styles.preferenceTitle}>Driver Gender Preference</Text>
              <View style={styles.preferenceRow}>
                {DRIVER_GENDER_OPTIONS.map((option) => {
                  const selected = normalizedDriverGenderPreference === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.preferenceChip, selected && styles.preferenceChipActive]}
                      onPress={() => setDriverGenderPreference(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.preferenceChipText, selected && styles.preferenceChipTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {isRentalRide && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rental Package</Text>
            <TextInput
              style={styles.textInput}
              value={rentalHoursInput}
              onChangeText={setRentalHoursInput}
              keyboardType="number-pad"
              placeholder="Package hours (1 to 12)"
              placeholderTextColor={COLORS.textSecondary}
            />
            <Text style={styles.hint}>Selected package: {rentalHours} hour{rentalHours === 1 ? '' : 's'}</Text>
          </View>
        )}

        {isCorporateRide && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Corporate Details</Text>
            <TextInput
              style={styles.textInput}
              value={corporateCode}
              onChangeText={setCorporateCode}
              autoCapitalize="characters"
              placeholder="Corporate code"
              placeholderTextColor={COLORS.textSecondary}
            />
            <TextInput
              style={[styles.textInput, styles.stackedInput]}
              value={corporatePurpose}
              onChangeText={setCorporatePurpose}
              placeholder="Purpose or cost note"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
        )}

        {isAirportRide && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Flight Details</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={airportTerminal}
                onChangeText={setAirportTerminal}
                placeholder="Terminal"
                placeholderTextColor={COLORS.textSecondary}
              />
              <TextInput
                style={styles.textInput}
                value={flightNumber}
                onChangeText={setFlightNumber}
                autoCapitalize="characters"
                placeholder="Flight no."
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          </View>
        )}

        {isIntercityRide && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Intercity Options</Text>
            <View style={styles.preferenceRow}>
              <TouchableOpacity
                style={[styles.preferenceChip, intercityReturnTrip && styles.preferenceChipSelected]}
                onPress={() => setIntercityReturnTrip((value) => !value)}
              >
                <Text style={[styles.preferenceChipText, intercityReturnTrip && styles.preferenceChipTextSelected]}>
                  Return trip
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.textInput, styles.stackedInput]}
              value={intercityWaitHoursInput}
              onChangeText={setIntercityWaitHoursInput}
              keyboardType="number-pad"
              placeholder="Wait hours (0 to 72)"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
        )}

        {isWomenOnlyRide && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Women Only Safety</Text>
            <View style={styles.preferenceRow}>
              <TouchableOpacity
                style={[styles.preferenceChip, womenOnlyFemaleDriverRequired && styles.preferenceChipSelected]}
                onPress={() => setWomenOnlyFemaleDriverRequired(true)}
              >
                <Text
                  style={[
                    styles.preferenceChipText,
                    womenOnlyFemaleDriverRequired && styles.preferenceChipTextSelected,
                  ]}
                >
                  Female driver
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.preferenceChip, !womenOnlyFemaleDriverRequired && styles.preferenceChipSelected]}
                onPress={() => setWomenOnlyFemaleDriverRequired(false)}
              >
                <Text
                  style={[
                    styles.preferenceChipText,
                    !womenOnlyFemaleDriverRequired && styles.preferenceChipTextSelected,
                  ]}
                >
                  Trusted fallback
                </Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.inputRow, styles.stackedInput]}>
              <TextInput
                style={styles.textInput}
                value={womenOnlyGuardianName}
                onChangeText={setWomenOnlyGuardianName}
                placeholder="Guardian name"
                placeholderTextColor={COLORS.textSecondary}
              />
              <TextInput
                style={styles.textInput}
                value={womenOnlyGuardianPhone}
                onChangeText={setWomenOnlyGuardianPhone}
                keyboardType="phone-pad"
                placeholder="Guardian phone"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          </View>
        )}

        {isTourismRide && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tourism Package</Text>
            <Text style={styles.hint}>
              A full-day package will be selected from {service.pickup_district || service.pickup_region || 'your pickup area'}.
            </Text>
          </View>
        )}

        {isPetRide && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pet Details</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                value={petType}
                onChangeText={setPetType}
                placeholder="Pet type"
                placeholderTextColor={COLORS.textSecondary}
              />
              <TextInput
                style={styles.textInput}
                value={petCountInput}
                onChangeText={setPetCountInput}
                keyboardType="number-pad"
                placeholder="Count"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promo Code</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={promoCode}
              onChangeText={(value) => {
                setPromoCode(value.toUpperCase());
                setAppliedPromo(null);
                setPromoMessage('');
              }}
              placeholder="Enter promo code"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
            />
            {appliedPromo ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={clearPromo}>
                <Text style={styles.secondaryButtonText}>Clear</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.secondaryButton} onPress={validatePromoCode}>
                <Text style={styles.secondaryButtonText}>Check</Text>
              </TouchableOpacity>
            )}
          </View>
          {!!promoMessage && <Text style={styles.hint}>{promoMessage}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fare Estimate</Text>
          <View style={styles.summaryCard}>
            {fareLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : fareEstimate ? (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Distance</Text>
                  <Text style={styles.summaryValue}>{km(fareEstimate.distance_km)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Estimated fare</Text>
                  <Text style={styles.summaryValue}>{money(fareAmount)}</Text>
                </View>
                {isScheduledRide && (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Pickup time</Text>
                      <Text style={styles.summaryValue}>
                        {scheduledPreview?.valid
                          ? formatToIST(scheduledPreview.iso, { dateStyle: 'medium', timeStyle: 'short' })
                          : 'Select time'}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Driver preference</Text>
                      <Text style={styles.summaryValue}>
                        {driverGenderPreferenceLabel(normalizedDriverGenderPreference)}
                      </Text>
                    </View>
                  </>
                )}
                {discountAmount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Promo discount</Text>
                    <Text style={styles.discountValue}>- {money(discountAmount)}</Text>
                  </View>
                )}
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.totalLabel}>Payable estimate</Text>
                  <Text style={styles.totalValue}>{money(payableFare || fareAmount)}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.hint}>
                {fareError || 'Fare estimate will appear when pickup and dropoff are ready.'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Drivers within {km(driverRadiusKm)}</Text>
              <Text style={styles.hint}>
                Matching {vehicle_name || vehicle_type_id || 'selected vehicle'} and {ride_type_name || ride_type || 'ride'}.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setShowRadiusEditor((value) => !value)}
            >
              <Text style={styles.linkButtonText}>Show others</Text>
            </TouchableOpacity>
          </View>

          {showRadiusEditor && (
            <View style={styles.radiusEditor}>
              <TextInput
                style={styles.radiusInput}
                value={driverRadiusInput}
                onChangeText={setDriverRadiusInput}
                keyboardType="decimal-pad"
                placeholder="KM"
                placeholderTextColor={COLORS.textSecondary}
              />
              <TouchableOpacity style={styles.secondaryButton} onPress={applyRadiusInput}>
                <Text style={styles.secondaryButtonText}>Apply km</Text>
              </TouchableOpacity>
            </View>
          )}

          {driversLoading ? (
            <View style={styles.driverStatusCard}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.hint}>Loading nearby drivers...</Text>
            </View>
          ) : nearbyDrivers.length > 0 ? (
            nearbyDrivers.map((driver) => (
              <View key={driver.driver_id} style={styles.driverCard}>
                <View style={styles.driverInfo}>
                  <Text style={styles.driverName}>{driver.name || 'Driver'}</Text>
                  <Text style={styles.driverMeta}>
                    {km(driver.distance_km)} from pickup | Rating {Number(driver.rating || 0).toFixed(1)}
                  </Text>
                  <Text style={styles.driverMeta}>
                    Projected fare {money(getDriverFare(driver))}
                  </Text>
                </View>
                <Text style={styles.driverDistance}>{km(driver.distance_km)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.driverStatusCard}>
              <Text style={styles.hint}>
                {driversError || `No drivers found within ${km(driverRadiusKm)}. Use Show others to enter more km.`}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.bookButton, bookingLoading && styles.bookButtonDisabled]}
          onPress={handleBookRide}
          disabled={bookingLoading}
        >
          {bookingLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.bookButtonText}>{isScheduledRide ? 'Schedule Ride' : 'Book Ride'}</Text>
              <Text style={styles.bookButtonArrow}>{'->'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 108,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },

  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  backButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
  },

  title: {
    color: COLORS.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },

  headerSpacer: {
    width: 74,
  },

  tripSetupCard: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 22,
    padding: 14,
    ...SHADOWS.soft,
  },

  tripSetupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },

  tripSetupCopy: {
    flex: 1,
    gap: 2,
  },

  tripSetupEyebrow: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  tripSetupTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
  },

  tripEditButton: {
    borderColor: COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  tripEditButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  routeLine: {
    flexDirection: 'row',
    gap: 10,
  },

  routeLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    width: 62,
  },

  routeValue: {
    color: COLORS.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },

  routeEditLink: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },

  routeEditLinkText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  section: {
    marginBottom: 24,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 10,
  },

  hint: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },

  preferenceBlock: {
    marginTop: 16,
  },

  preferenceTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },

  preferenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  preferenceChip: {
    minHeight: 42,
    minWidth: 86,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  preferenceChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.overlaySoft,
  },

  preferenceChipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },

  preferenceChipTextActive: {
    color: COLORS.primary,
  },

  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  counterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.soft,
  },

  counterButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },

  counterButtonText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 28,
  },

  counterInput: {
    width: 92,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    fontSize: 26,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    textAlign: 'center',
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  textInput: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    fontSize: 16,
    paddingHorizontal: 14,
  },

  stackedInput: {
    marginTop: 10,
  },

  secondaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  secondaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },

  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 16,
    ...SHADOWS.soft,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },

  summaryLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },

  summaryValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },

  discountValue: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: '900',
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },

  totalLabel: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
  },

  totalValue: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '900',
  },

  linkButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },

  linkButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  radiusEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },

  radiusInput: {
    width: 92,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 14,
    textAlign: 'center',
  },

  driverStatusCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 16,
    gap: 8,
  },

  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    ...SHADOWS.soft,
  },

  driverInfo: {
    flex: 1,
    gap: 4,
  },

  driverName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
  },

  driverMeta: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },

  driverDistance: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  bookButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOWS.medium,
  },

  bookButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.7,
  },

  bookButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
  },

  bookButtonArrow: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
});

export default BookingDetailsScreen;
