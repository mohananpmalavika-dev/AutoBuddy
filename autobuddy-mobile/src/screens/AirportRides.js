/*
Airport Ride System Frontend Component
Location: autobuddy-mobile/src/screens/AirportRides.js
Real-time airport ride booking and flight tracking
*/

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, ScrollView, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Modal, RefreshControl, TextInput
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { airportAPI } from '../lib/api';
import { formatToIST } from '../utils/time';

const COLORS = {
  primary: '#2D4A7B',
  secondary: '#FF8C42',
  success: '#4CAF50',
  warning: '#FFC107',
  danger: '#F44336',
  white: '#FFFFFF',
  light_gray: '#F5F5F5',
  dark_gray: '#333333',
  text: '#555555'
};

const SHADOWS = {
  small: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  medium: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 5, elevation: 4 }
};

const DEFAULT_TERMINAL_ID = 'term_TRV';
const TERMINAL_OPTIONS = [
  { id: 'term_TRV', label: 'TRV' },
  { id: 'term_COK', label: 'COK' },
  { id: 'term_CCJ', label: 'CCJ' },
  { id: 'term_CNN', label: 'CNN' },
  { id: 'term_BLR', label: 'BLR' }
];
const VEHICLE_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: 'taxi', label: 'Taxi' },
  { id: 'xl', label: 'XL' },
  { id: 'traveller', label: 'Traveller' }
];
const PHASE_OPTIONS = [
  { id: 'pre_flight', label: 'To airport' },
  { id: 'post_flight', label: 'From airport' }
];
const FLIGHT_TYPE_OPTIONS = [
  { id: 'domestic', label: 'Domestic' },
  { id: 'international', label: 'International' }
];

const initialRideForm = {
  passenger_name: 'Airport Passenger',
  phone_number: '+919876543210',
  flight_number: 'AI967',
  ride_phase: 'pre_flight',
  pickup_location: 'Kollam',
  dropoff_location: 'TRV Terminal 1',
  terminal_id: DEFAULT_TERMINAL_ID,
  passengers_count: '2',
  luggage_count: '2',
  vehicle_type: 'taxi',
  flight_type: 'international',
  notes: ''
};

const responseData = (payload, fallback) => payload?.data ?? fallback;

// ============================================================================
// TERMINALS TAB
// ============================================================================

const TerminalsTab = ({ adminToken }) => {
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTerminals = useCallback(async () => {
    try {
      const data = await airportAPI.listTerminals(adminToken);
      setTerminals(responseData(data, []));
    } catch (e) {
      console.error('Error fetching terminals:', e);
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    const timeout = setTimeout(fetchTerminals, 0);
    const interval = setInterval(fetchTerminals, 30000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchTerminals]);

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <FlatList
      data={terminals}
      keyExtractor={(item) => item.terminal_id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchTerminals} />}
      renderItem={({ item }) => (
        <View style={[styles.terminalCard, SHADOWS.small]}>
          <View style={styles.terminalHeader}>
            <View>
              <Text style={styles.airportCode}>{item.airport_code}</Text>
              <Text style={styles.terminalName}>{item.terminal_name}</Text>
            </View>
            <MaterialCommunityIcons name="airplane" size={24} color={COLORS.primary} />
          </View>

          <View style={styles.terminalInfo}>
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="map-marker" size={16} color={COLORS.text} />
              <Text style={styles.infoText}>{item.city}</Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="door" size={16} color={COLORS.text} />
              <Text style={styles.infoText}>{item.gates_count} Gates</Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="parking" size={16} color={COLORS.text} />
              <Text style={styles.infoText}>{item.parking_spaces} Spots</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.actionButton, SHADOWS.small]}>
            <Text style={styles.actionButtonText}>View Details</Text>
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>No terminals</Text>}
    />
  );
};

// ============================================================================
// FLIGHTS TAB
// ============================================================================

const FlightsTab = ({ adminToken }) => {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerminal] = useState(DEFAULT_TERMINAL_ID);

  const fetchFlights = useCallback(async () => {
    try {
      const data = await airportAPI.listFlights(adminToken, selectedTerminal);
      setFlights(responseData(data, []));
    } catch (e) {
      console.error('Error fetching flights:', e);
    } finally {
      setLoading(false);
    }
  }, [adminToken, selectedTerminal]);

  useEffect(() => {
    const timeout = setTimeout(fetchFlights, 0);
    const interval = setInterval(fetchFlights, 10000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchFlights]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'departed':
      case 'landed':
        return COLORS.success;
      case 'delayed':
        return COLORS.danger;
      case 'boarding':
        return COLORS.warning;
      default:
        return COLORS.primary;
    }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <FlatList
      data={flights}
      keyExtractor={(item) => item.flight_id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFlights} />}
      renderItem={({ item }) => (
        <View style={[styles.flightCard, SHADOWS.small]}>
          <View style={styles.flightHeader}>
            <View style={styles.flightNumber}>
              <Text style={styles.flightNumberText}>{item.flight_number}</Text>
            </View>

            <View style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.flight_status) }
            ]}>
              <Text style={styles.statusText}>{item.flight_status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.routeRow}>
            <View style={styles.cityBox}>
              <Text style={styles.cityCode}>{item.departure_city.substring(0, 3)}</Text>
              <Text style={styles.cityName}>{item.departure_city}</Text>
            </View>

            <View style={styles.flightArrow}>
              <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.primary} />
            </View>

            <View style={styles.cityBox}>
              <Text style={styles.cityCode}>{item.arrival_city.substring(0, 3)}</Text>
              <Text style={styles.cityName}>{item.arrival_city}</Text>
            </View>
          </View>

          <View style={styles.flightDetails}>
            <View style={styles.detailItem}>
              <MaterialCommunityIcons name="clock" size={14} color={COLORS.text} />
              <Text style={styles.detailText}>{formatToIST(item.departure_time, { timeStyle: 'short' })}</Text>
            </View>

            <View style={styles.detailItem}>
              <MaterialCommunityIcons name="door" size={14} color={COLORS.text} />
              <Text style={styles.detailText}>Gate {item.gate_number}</Text>
            </View>

            <View style={styles.detailItem}>
              <MaterialCommunityIcons name="seat-passenger" size={14} color={COLORS.text} />
              <Text style={styles.detailText}>{item.expected_passengers} pax</Text>
            </View>
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>No flights</Text>}
    />
  );
};

// ============================================================================
// RIDES TAB
// ============================================================================

const RidesTab = ({ adminToken }) => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState(DEFAULT_TERMINAL_ID);
  const [rideForm, setRideForm] = useState(initialRideForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchRides = useCallback(async () => {
    try {
      const data = await airportAPI.listRides(adminToken, selectedTerminal);
      setRides(responseData(data, []));
    } catch (e) {
      console.error('Error fetching rides:', e);
    } finally {
      setLoading(false);
    }
  }, [adminToken, selectedTerminal]);

  useEffect(() => {
    const timeout = setTimeout(fetchRides, 0);
    const interval = setInterval(fetchRides, 15000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchRides]);

  const getPhaseIcon = (phase) => {
    return phase === 'pre_flight' ? 'airplane-takeoff' : 'airplane-landing';
  };

  const getRideStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return COLORS.success;
      case 'cancelled':
        return COLORS.danger;
      case 'driver_assigned':
      case 'accepted':
        return COLORS.primary;
      case 'rescheduled_due_to_flight_delay':
        return COLORS.secondary;
      default:
        return COLORS.warning;
    }
  };

  const updateRideForm = (field, value) => {
    setRideForm((prev) => ({ ...prev, [field]: value }));
  };

  const openRequestModal = () => {
    setRideForm((prev) => ({ ...prev, terminal_id: selectedTerminal }));
    setShowRequestModal(true);
  };

  const setPhaseDefaults = (phase) => {
    setRideForm((prev) => ({
      ...prev,
      ride_phase: phase,
      pickup_location: phase === 'pre_flight' ? prev.pickup_location || 'Kollam' : 'TRV Arrivals',
      dropoff_location: phase === 'pre_flight' ? prev.dropoff_location || 'TRV Terminal 1' : 'Kollam'
    }));
  };

  const submitAirportRide = async () => {
    const requiredFields = [
      'passenger_name',
      'phone_number',
      'flight_number',
      'pickup_location',
      'dropoff_location',
      'terminal_id'
    ];
    const missingField = requiredFields.find((field) => !String(rideForm[field] || '').trim());
    if (missingField) {
      Alert.alert('Missing details', 'Please complete the airport ride form.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...rideForm,
        flight_number: rideForm.flight_number.trim().toUpperCase(),
        passengers_count: Math.max(1, parseInt(rideForm.passengers_count, 10) || 1),
        luggage_count: Math.max(0, parseInt(rideForm.luggage_count, 10) || 0),
        notes: rideForm.notes?.trim() || undefined
      };
      const result = await airportAPI.requestRide(adminToken, payload);
      const createdRide = responseData(result, null);
      if (createdRide?.ride_id) {
        setRides((prev) => [createdRide, ...prev.filter((ride) => ride.ride_id !== createdRide.ride_id)]);
        setSelectedTerminal(createdRide.terminal_id || payload.terminal_id);
      }
      setShowRequestModal(false);
      Alert.alert(
        'Airport ride created',
        createdRide?.driver_id ? 'Airport-permit driver assigned.' : 'Ride is queued for an airport-permit driver.'
      );
    } catch (e) {
      Alert.alert('Airport ride failed', e?.message || 'Unable to request airport ride.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderChoiceGroup = (options, value, field) => (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = value === option.id;
        return (
          <TouchableOpacity
            key={option.id}
            style={[styles.choiceChip, active && styles.choiceChipActive]}
            onPress={() => updateRideForm(field, option.id)}
          >
            <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderTerminalFilter = () => (
    <View style={styles.terminalFilter}>
      {TERMINAL_OPTIONS.map((terminal) => {
        const active = selectedTerminal === terminal.id;
        return (
          <TouchableOpacity
            key={terminal.id}
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={() => setSelectedTerminal(terminal.id)}
          >
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
              {terminal.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const formatStatus = (status) => String(status || 'requested').replace(/_/g, ' ').toUpperCase();
  const formatFare = (value) => `Rs. ${Number(value || 0).toFixed(0)}`;
  const formatPickupTime = (value) => (
    value ? formatToIST(value, { dateStyle: 'medium', timeStyle: 'short' }) : 'TBD'
  );

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <>
      <FlatList
        data={rides}
        keyExtractor={(item) => item.ride_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchRides} />}
        ListHeaderComponent={renderTerminalFilter}
        renderItem={({ item }) => (
          <View style={[styles.rideCard, SHADOWS.small]}>
            <View style={styles.rideHeader}>
              <View style={styles.rideLeft}>
                <View style={[styles.phaseBadge, {
                  backgroundColor: item.ride_phase === 'pre_flight' ? COLORS.primary : COLORS.secondary
                }]}>
                  <MaterialCommunityIcons
                    name={getPhaseIcon(item.ride_phase)}
                    size={16}
                    color={COLORS.white}
                  />
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.passengeName}>{item.passenger_name}</Text>
                  <Text style={styles.flightNum}>{item.flight_number}</Text>
                </View>
              </View>

              <View style={[
                styles.statusBadge,
                { backgroundColor: getRideStatusColor(item.ride_status) }
              ]}>
                <Text style={styles.statusText}>{formatStatus(item.ride_status)}</Text>
              </View>
            </View>

            <View style={styles.routeInfo}>
              <Text style={styles.locationLabel}>{item.pickup_location}</Text>
              <MaterialCommunityIcons name="arrow-down" size={16} color={COLORS.primary} />
              <Text style={styles.locationLabel}>{item.dropoff_location}</Text>
            </View>

            <View style={styles.rideMetaGrid}>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="clock-outline" size={14} color={COLORS.text} />
                <Text style={styles.metaText}>{formatPickupTime(item.scheduled_pickup_time)}</Text>
              </View>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="bag-suitcase" size={14} color={COLORS.text} />
                <Text style={styles.metaText}>{item.luggage_count || 0} bags</Text>
              </View>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="account-group" size={14} color={COLORS.text} />
                <Text style={styles.metaText}>{item.passengers_count || 1} pax</Text>
              </View>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="car-side" size={14} color={COLORS.text} />
                <Text style={styles.metaText}>{item.vehicle_type || 'taxi'}</Text>
              </View>
            </View>

            {!!item.driver_name && (
              <View style={styles.driverAssignedRow}>
                <MaterialCommunityIcons name="shield-check" size={14} color={COLORS.success} />
                <Text style={styles.driverAssignedText}>{item.driver_name} assigned</Text>
              </View>
            )}

            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Est. Fare:</Text>
              <Text style={styles.fareValue}>{formatFare(item.estimated_fare)}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No rides</Text>}
      />

      <TouchableOpacity
        style={[styles.fab, SHADOWS.medium]}
        onPress={openRequestModal}
      >
        <MaterialCommunityIcons name="plus" size={24} color={COLORS.white} />
      </TouchableOpacity>

      <Modal visible={showRequestModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Request Airport Ride</Text>

              <Text style={styles.fieldLabel}>Ride phase</Text>
              <View style={styles.choiceRow}>
                {PHASE_OPTIONS.map((option) => {
                  const active = rideForm.ride_phase === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.choiceChip, active && styles.choiceChipActive]}
                      onPress={() => setPhaseDefaults(option.id)}
                    >
                      <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Terminal</Text>
              {renderChoiceGroup(TERMINAL_OPTIONS, rideForm.terminal_id, 'terminal_id')}

              <Text style={styles.fieldLabel}>Flight number</Text>
              <TextInput
                placeholder="AI967"
                value={rideForm.flight_number}
                onChangeText={(value) => updateRideForm('flight_number', value)}
                autoCapitalize="characters"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Flight type</Text>
              {renderChoiceGroup(FLIGHT_TYPE_OPTIONS, rideForm.flight_type, 'flight_type')}

              <Text style={styles.fieldLabel}>Passenger</Text>
              <TextInput
                placeholder="Passenger name"
                value={rideForm.passenger_name}
                onChangeText={(value) => updateRideForm('passenger_name', value)}
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                placeholder="+919876543210"
                value={rideForm.phone_number}
                onChangeText={(value) => updateRideForm('phone_number', value)}
                keyboardType="phone-pad"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Pickup</Text>
              <TextInput
                placeholder="Pickup location"
                value={rideForm.pickup_location}
                onChangeText={(value) => updateRideForm('pickup_location', value)}
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Dropoff</Text>
              <TextInput
                placeholder="Dropoff location"
                value={rideForm.dropoff_location}
                onChangeText={(value) => updateRideForm('dropoff_location', value)}
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Vehicle</Text>
              {renderChoiceGroup(VEHICLE_OPTIONS, rideForm.vehicle_type, 'vehicle_type')}

              <View style={styles.inlineFields}>
                <View style={styles.inlineField}>
                  <Text style={styles.fieldLabel}>Passengers</Text>
                  <TextInput
                    value={rideForm.passengers_count}
                    onChangeText={(value) => updateRideForm('passengers_count', value.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
                <View style={styles.inlineField}>
                  <Text style={styles.fieldLabel}>Luggage</Text>
                  <TextInput
                    value={rideForm.luggage_count}
                    onChangeText={(value) => updateRideForm('luggage_count', value.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                placeholder="Arrival gate, special luggage, waiting request"
                value={rideForm.notes}
                onChangeText={(value) => updateRideForm('notes', value)}
                style={[styles.input, styles.notesInput]}
                multiline
              />

              <TouchableOpacity
                style={[styles.button, { backgroundColor: COLORS.primary }, submitting && styles.buttonDisabled]}
                onPress={submitAirportRide}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.buttonText}>Request Ride</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, { backgroundColor: COLORS.light_gray }]}
                onPress={() => setShowRequestModal(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

// ============================================================================
// PARKING TAB
// ============================================================================

const ParkingTab = ({ adminToken }) => {
  const [parking, setParking] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchParking = useCallback(async () => {
    try {
      const data = await airportAPI.getParkingAvailability(adminToken, DEFAULT_TERMINAL_ID);
      setParking(responseData(data, null));
    } catch (e) {
      console.error('Error fetching parking:', e);
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    const timeout = setTimeout(fetchParking, 0);
    const interval = setInterval(fetchParking, 20000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchParking]);

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;
  if (!parking) return <Text style={styles.emptyText}>No parking data</Text>;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchParking} />}
    >
      {/* Summary */}
      <View style={[styles.summaryCard, SHADOWS.small]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Spaces</Text>
            <Text style={styles.summaryValue}>{parking.total_spaces}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Available</Text>
            <Text style={[styles.summaryValue, { color: COLORS.success }]}>{parking.available_spaces}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Occupied</Text>
            <Text style={[styles.summaryValue, { color: COLORS.danger }]}>{parking.occupied_spaces}</Text>
          </View>
        </View>

        <View style={[styles.occupancyBar, SHADOWS.small]}>
          <View
            style={{
              height: '100%',
              backgroundColor: COLORS.primary,
              width: `${parking.occupancy_rate}%`,
              borderRadius: 4
            }}
          />
        </View>

        <Text style={styles.occupancyText}>
          Occupancy: {parking.occupancy_rate}%
        </Text>
      </View>

      {/* By Level */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>By Level</Text>
        {parking.by_level?.map((level, idx) => (
          <View key={idx} style={[styles.levelCard, SHADOWS.small]}>
            <Text style={styles.levelTitle}>Level {level.level}</Text>
            <View style={styles.levelStats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Available</Text>
                <Text style={styles.statValue}>{level.available}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Occupied</Text>
                <Text style={styles.statValue}>{level.occupied}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

// ============================================================================
// DEMAND TAB
// ============================================================================

const DemandTab = ({ adminToken }) => {
  const [demand, setDemand] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDemand = useCallback(async () => {
    try {
      const data = await airportAPI.getDemand(adminToken, DEFAULT_TERMINAL_ID);
      setDemand(responseData(data, []));
    } catch (e) {
      console.error('Error fetching demand:', e);
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    const timeout = setTimeout(fetchDemand, 0);
    const interval = setInterval(fetchDemand, 10000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchDemand]);

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <FlatList
      data={demand}
      keyExtractor={(item) => item.metric_id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDemand} />}
      renderItem={({ item }) => (
        <View style={[styles.demandCard, SHADOWS.small]}>
          <View style={styles.demandHeader}>
            <Text style={styles.phaseLabel}>{item.ride_phase.toUpperCase()}</Text>
            <View style={[
              styles.demandBadge,
              { backgroundColor: item.peak_hour ? COLORS.danger : COLORS.success }
            ]}>
              <Text style={styles.demandBadgeText}>
                {item.peak_hour ? 'PEAK' : 'NORMAL'}
              </Text>
            </View>
          </View>

          <View style={styles.demandMetrics}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Waiting</Text>
              <Text style={styles.metricValue}>{item.waiting_requests}</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Available</Text>
              <Text style={styles.metricValue}>{item.available_drivers}</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Surge</Text>
              <Text style={styles.metricValue}>{item.surge_multiplier}x</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Wait Time</Text>
              <Text style={styles.metricValue}>{item.estimated_wait_minutes}m</Text>
            </View>
          </View>

          <View style={styles.demandBar}>
            <View
              style={{
                height: '100%',
                backgroundColor: item.demand_score > 75 ? COLORS.danger : COLORS.primary,
                width: `${item.demand_score}%`,
                borderRadius: 4
              }}
            />
          </View>
          <Text style={styles.demandScore}>Demand Score: {item.demand_score}/100</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>No demand data</Text>}
    />
  );
};

// ============================================================================
// MAIN AIRPORT RIDES SCREEN
// ============================================================================

export const AirportRidesScreen = ({ route, navigation }) => {
  const { adminToken } = route.params || { adminToken: 'test-token' };
  const [activeTab, setActiveTab] = useState('terminals');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'terminals':
        return <TerminalsTab adminToken={adminToken} />;
      case 'flights':
        return <FlightsTab adminToken={adminToken} />;
      case 'rides':
        return <RidesTab adminToken={adminToken} />;
      case 'parking':
        return <ParkingTab adminToken={adminToken} />;
      case 'demand':
        return <DemandTab adminToken={adminToken} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, SHADOWS.medium]}>
        <MaterialCommunityIcons name="airplane" size={28} color={COLORS.secondary} />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Airport Rides</Text>
          <Text style={styles.headerSubtitle}>Real-time flight tracking</Text>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        {[
          { id: 'terminals', label: 'Terminals', icon: 'airport' },
          { id: 'flights', label: 'Flights', icon: 'airplane' },
          { id: 'rides', label: 'Rides', icon: 'car' },
          { id: 'parking', label: 'Parking', icon: 'parking' },
          { id: 'demand', label: 'Demand', icon: 'chart-line' }
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            style={[styles.tab, activeTab === tab.id && styles.activeTab]}
          >
            <MaterialCommunityIcons
              name={tab.icon}
              size={18}
              color={activeTab === tab.id ? COLORS.secondary : COLORS.text}
            />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.activeTabLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {renderTabContent()}
      </View>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.light_gray },
  header: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#B0C4DE',
    marginTop: 2
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
    paddingHorizontal: 0
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  activeTab: {
    borderBottomColor: COLORS.secondary
  },
  tabLabel: {
    fontSize: 10,
    color: COLORS.text,
    marginTop: 2,
    fontWeight: '500'
  },
  activeTabLabel: {
    color: COLORS.secondary,
    fontWeight: 'bold'
  },
  tabContent: { flex: 1, padding: 12 },
  container: { flex: 1 },
  terminalCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  terminalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  airportCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary
  },
  terminalName: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 2
  },
  terminalInfo: {
    backgroundColor: COLORS.light_gray,
    padding: 8,
    borderRadius: 6,
    marginBottom: 10
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  infoText: {
    fontSize: 11,
    color: COLORS.text,
    marginLeft: 6
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center'
  },
  actionButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 12
  },
  flightCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  flightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  flightNumber: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4
  },
  flightNumberText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 12
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 10
  },
  cityBox: {
    alignItems: 'center'
  },
  cityCode: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primary
  },
  cityName: {
    fontSize: 10,
    color: COLORS.text,
    marginTop: 2
  },
  flightArrow: {
    paddingHorizontal: 12
  },
  flightDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ECECEC'
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  detailText: {
    fontSize: 10,
    color: COLORS.text,
    marginLeft: 4
  },
  rideCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  rideLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  phaseBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  passengeName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.dark_gray
  },
  flightNum: {
    fontSize: 11,
    color: COLORS.text,
    marginTop: 2
  },
  routeInfo: {
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ECECEC',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
    marginVertical: 8
  },
  locationLabel: {
    fontSize: 11,
    color: COLORS.text,
    marginVertical: 2
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  fareLabel: {
    fontSize: 11,
    color: COLORS.text
  },
  fareValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primary
  },
  terminalFilter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  filterChip: {
    minWidth: 52,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#D8DEE8',
    alignItems: 'center'
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary
  },
  filterChipTextActive: {
    color: COLORS.white
  },
  rideMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.light_gray,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  metaText: {
    fontSize: 10,
    color: COLORS.text,
    marginLeft: 4,
    textTransform: 'capitalize'
  },
  driverAssignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  driverAssignedText: {
    fontSize: 11,
    color: COLORS.success,
    marginLeft: 4,
    fontWeight: '700'
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '88%'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: COLORS.dark_gray
  },
  input: {
    borderWidth: 1,
    borderColor: '#ECECEC',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 14
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top'
  },
  fieldLabel: {
    fontSize: 11,
    color: COLORS.dark_gray,
    fontWeight: '700',
    marginBottom: 6
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  choiceChip: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D8DEE8',
    justifyContent: 'center',
    backgroundColor: COLORS.white
  },
  choiceChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary
  },
  choiceChipText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700'
  },
  choiceChipTextActive: {
    color: COLORS.white
  },
  inlineFields: {
    flexDirection: 'row',
    gap: 10
  },
  inlineField: {
    flex: 1
  },
  button: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8
  },
  buttonDisabled: {
    opacity: 0.65
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: 'bold'
  },
  secondaryButtonText: {
    color: COLORS.dark_gray,
    fontWeight: 'bold'
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 12
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.text
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 4
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: '#ECECEC'
  },
  occupancyBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden'
  },
  occupancyText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: 'bold'
  },
  section: {
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.dark_gray,
    marginBottom: 8
  },
  levelCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  levelTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.dark_gray,
    marginBottom: 8
  },
  levelStats: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  stat: {
    alignItems: 'center'
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.text
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 4
  },
  demandCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  demandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  phaseLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.dark_gray
  },
  demandBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  demandBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white
  },
  demandMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12
  },
  metricBox: {
    alignItems: 'center'
  },
  metricLabel: {
    fontSize: 10,
    color: COLORS.text
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 4
  },
  demandBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden'
  },
  demandScore: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: 'bold'
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.text,
    marginTop: 40,
    fontSize: 14
  }
});

export default AirportRidesScreen;
