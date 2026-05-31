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
import { apiRequest } from '../lib/api';
import { bookingAPI } from '../services/apiClient';
import { getSocket } from '../services/socketClient';

const DEFAULT_DRIVER_RADIUS_KM = 2;

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

function money(value) {
  const numeric = Number(value || 0);
  return `INR ${numeric.toFixed(2)}`;
}

function km(value) {
  const numeric = Number(value || 0);
  return `${numeric.toFixed(2)} km`;
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
    vehicle_subtype_capacity,
    vehicle_capacity,
    capacity_unit,
    ride_type,
  } = service;

  const initialPickup = useMemo(
    () => normalizeInitialLocation(route.params?.initialPickup),
    [route.params?.initialPickup],
  );
  const initialDropoff = useMemo(
    () => normalizeInitialLocation(route.params?.initialDropoff),
    [route.params?.initialDropoff],
  );

  const selectedCapacity = Number(vehicle_subtype_capacity || vehicle_capacity || 0);
  const maxPassengerCount =
    capacity_unit !== 'kg' && selectedCapacity > 0 ? selectedCapacity : 6;
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

  const fareAmount = Number(fareEstimate?.total_fare || fareEstimate?.estimated_fare || 0);
  const discountAmount = getDiscountAmount(fareAmount, appliedPromo);
  const payableFare = Math.max(0, fareAmount - discountAmount);

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
        },
      });
      setFareEstimate(estimate);
    } catch (error) {
      setFareEstimate(null);
      setFareError(error.message || 'Could not calculate fare estimate.');
    } finally {
      setFareLoading(false);
    }
  }, [hasRoute, initialDropoff, initialPickup]);

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
  }, [driverRadiusKm, hasRoute, initialDropoff, initialPickup]);

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

    try {
      setBookingLoading(true);

      const bookingData = {
        pickup_latitude: initialPickup.coords.latitude,
        pickup_longitude: initialPickup.coords.longitude,
        pickup_location: initialPickup.address,
        dropoff_latitude: initialDropoff.coords.latitude,
        dropoff_longitude: initialDropoff.coords.longitude,
        dropoff_location: initialDropoff.address,
        vehicle_type_id,
        vehicle_subtype_id: vehicle_subtype_id || null,
        ride_type,
        passenger_count: passengerCount,
        scheduled_datetime: null,
        promo_code: appliedPromo?.code || promoCode.trim() || null,
        pickup_region: service.pickup_region || null,
        pickup_district: service.pickup_district || null,
        pickup_pincode: service.pickup_pincode || null,
      };

      const bookingResponse = await bookingAPI.createBooking(bookingData);
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
          status: bookingResponse?.status || 'pending',
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
            <Text style={styles.backButtonText}>{'<- Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
          <View style={styles.headerSpacer} />
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
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
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
              <Text style={styles.hint}>Drivers load automatically from pickup location.</Text>
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
              <Text style={styles.bookButtonText}>Book Ride</Text>
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
