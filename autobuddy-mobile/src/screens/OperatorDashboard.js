import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import AutoBuddyBrand from '../components/AutoBuddyBrand';
import {
  FleetDashboardAdvanced,
  FleetWalletPanel,
  IncentiveManagementPanel,
  LiveFleetMapPanel,
  PerformanceRankingsPanel,
} from '../components/FleetAdvancedFeatures';
import VoiceTextInput from '../components/VoiceTextInput';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

const OPERATOR_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'profile', label: 'Profile' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'fleet', label: 'Fleet KPIs' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'performance', label: 'Performance' },
  { key: 'map', label: 'Live Map' },
  { key: 'incentives', label: 'Incentives' },
];

const emptyProfileForm = {
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  gst_number: '',
  service_regions_text: 'all',
};

const emptyVehicleForm = {
  make: '',
  model: '',
  year: String(new Date().getFullYear()),
  color: '',
  license_plate: '',
  registration_number: '',
  seating_capacity: '',
  vehicle_type_id: '',
  vehicle_subtype_id: '',
  service_regions_text: 'all',
};

function extractList(payload, keys = []) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }
  if (payload.data && typeof payload.data === 'object') {
    for (const key of keys) {
      if (Array.isArray(payload.data[key])) {
        return payload.data[key];
      }
    }
  }
  return [];
}

function parseCsv(value) {
  const parts = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length > 0 ? Array.from(new Set(parts)) : ['all'];
}

function joinRegions(value) {
  return Array.isArray(value) && value.length > 0 ? value.join(', ') : 'all';
}

function formatCurrency(value) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function normalizeProfileForm(profile) {
  return {
    company_name: String(profile?.company_name || ''),
    contact_name: String(profile?.contact_name || ''),
    contact_email: String(profile?.contact_email || ''),
    contact_phone: String(profile?.contact_phone || ''),
    gst_number: String(profile?.gst_number || ''),
    service_regions_text: joinRegions(profile?.service_regions),
  };
}

function titleForRole(value) {
  const raw = String(value || '').replace(/_/g, ' ').trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Vehicle';
}

export default function OperatorDashboard({ token, user, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState({});
  const [recentBookings, setRecentBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [editingVehicleId, setEditingVehicleId] = useState('');
  const [assignmentInputs, setAssignmentInputs] = useState({});

  const selectedVehicleType = useMemo(
    () => vehicleTypes.find((item) => item.vehicle_type_id === vehicleForm.vehicle_type_id) || null,
    [vehicleForm.vehicle_type_id, vehicleTypes],
  );

  const selectedSubtypes = Array.isArray(selectedVehicleType?.subtypes) ? selectedVehicleType.subtypes : [];
  const operatorFleetId = String(profile?.operator_id || user?.id || '').trim();

  const loadPortal = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [profilePayload, dashboardPayload, vehiclesPayload, vehicleCatalogPayload] = await Promise.all([
        apiRequest('/api/operators/profile', { token }),
        apiRequest('/api/operators/dashboard', { token }),
        apiRequest('/api/operators/vehicles', { token }),
        apiRequest('/api/vehicles/public/all', { token }).catch(() => []),
      ]);

      const nextProfile = profilePayload?.profile || profilePayload || {};
      const nextVehicles = extractList(vehiclesPayload, ['vehicles', 'items']);
      const nextTypes = extractList(vehicleCatalogPayload, ['vehicles', 'vehicle_types', 'items']);

      setProfile(nextProfile);
      setProfileForm(normalizeProfileForm(nextProfile));
      setSummary(dashboardPayload?.summary || {});
      setRecentBookings(extractList(dashboardPayload, ['recent_bookings', 'bookings', 'items']));
      setVehicles(nextVehicles);
      setVehicleTypes(nextTypes);
      setVehicleForm((prev) => {
        if (prev.vehicle_type_id || nextTypes.length === 0) {
          return prev;
        }
        const firstType = nextTypes[0];
        const firstSubtype = Array.isArray(firstType.subtypes) && firstType.subtypes.length > 0
          ? String(firstType.subtypes[0].id || '')
          : '';
        return {
          ...prev,
          vehicle_type_id: String(firstType.vehicle_type_id || ''),
          vehicle_subtype_id: firstSubtype,
        };
      });
    } catch (err) {
      setError(err?.message || 'Could not load operator portal.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleAdvancedTabChange = useCallback((nextTab) => {
    const mappedTab = nextTab === 'assignments' ? 'vehicles' : nextTab;
    setActiveTab(OPERATOR_TABS.some((tab) => tab.key === mappedTab) ? mappedTab : 'overview');
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPortal();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [loadPortal]);

  const updateProfileField = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateVehicleField = (field, value) => {
    setVehicleForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveProfile = async () => {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = await apiRequest('/api/operators/profile', {
        method: 'PUT',
        token,
        body: {
          company_name: profileForm.company_name.trim(),
          contact_name: profileForm.contact_name.trim(),
          contact_email: profileForm.contact_email.trim().toLowerCase(),
          contact_phone: profileForm.contact_phone.trim(),
          gst_number: profileForm.gst_number.trim() || null,
          service_regions: parseCsv(profileForm.service_regions_text),
        },
      });
      const updatedProfile = response?.profile || {};
      setProfile(updatedProfile);
      setProfileForm(normalizeProfileForm(updatedProfile));
      setMessage('Operator profile saved.');
    } catch (err) {
      setError(err?.message || 'Could not save operator profile.');
    } finally {
      setSaving(false);
    }
  };

  const resetVehicleForm = () => {
    const firstType = vehicleTypes[0] || {};
    const firstSubtype = Array.isArray(firstType.subtypes) && firstType.subtypes.length > 0
      ? String(firstType.subtypes[0].id || '')
      : '';
    setEditingVehicleId('');
    setVehicleForm({
      ...emptyVehicleForm,
      vehicle_type_id: String(firstType.vehicle_type_id || ''),
      vehicle_subtype_id: firstSubtype,
    });
  };

  const saveVehicle = async () => {
    const year = Number(vehicleForm.year || 0);
    const seatingCapacity = vehicleForm.seating_capacity ? Number(vehicleForm.seating_capacity) : undefined;
    if (!vehicleForm.vehicle_type_id) {
      setError('Select a vehicle type before saving.');
      return;
    }
    if (!Number.isFinite(year) || year < 2000) {
      setError('Enter a valid vehicle year.');
      return;
    }
    if (vehicleForm.seating_capacity && (!Number.isFinite(seatingCapacity) || seatingCapacity < 1)) {
      setError('Enter a valid seating capacity.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');
      const payload = {
        make: vehicleForm.make.trim(),
        model: vehicleForm.model.trim(),
        year,
        color: vehicleForm.color.trim(),
        license_plate: vehicleForm.license_plate.trim().toUpperCase(),
        registration_number: vehicleForm.registration_number.trim().toUpperCase() || null,
        seating_capacity: seatingCapacity,
        vehicle_type_id: vehicleForm.vehicle_type_id,
        vehicle_subtype_id: vehicleForm.vehicle_subtype_id || null,
        service_regions: parseCsv(vehicleForm.service_regions_text),
      };
      const path = editingVehicleId
        ? `/api/operators/vehicles/${editingVehicleId}`
        : '/api/operators/vehicles';
      await apiRequest(path, {
        method: editingVehicleId ? 'PUT' : 'POST',
        token,
        body: payload,
      });
      resetVehicleForm();
      setMessage(editingVehicleId ? 'Fleet vehicle updated.' : 'Fleet vehicle added.');
      await loadPortal();
    } catch (err) {
      setError(err?.message || 'Could not save fleet vehicle.');
    } finally {
      setSaving(false);
    }
  };

  const editVehicle = (vehicle) => {
    setEditingVehicleId(String(vehicle.id || ''));
    setVehicleForm({
      make: String(vehicle.make || ''),
      model: String(vehicle.model || ''),
      year: String(vehicle.year || new Date().getFullYear()),
      color: String(vehicle.color || ''),
      license_plate: String(vehicle.license_plate || ''),
      registration_number: String(vehicle.registration_number || ''),
      seating_capacity: String(vehicle.seating_capacity || vehicle.capacity || ''),
      vehicle_type_id: String(vehicle.vehicle_type_id || ''),
      vehicle_subtype_id: String(vehicle.vehicle_subtype_id || ''),
      service_regions_text: joinRegions(vehicle.service_regions),
    });
  };

  const assignDriver = async (vehicleId) => {
    const rawInput = String(assignmentInputs[vehicleId] || '').trim();
    if (!rawInput) {
      setError('Enter driver email, phone, or ID to assign.');
      return;
    }
    const body = rawInput.includes('@')
      ? { driver_email: rawInput.toLowerCase() }
      : /^[0-9]{10}$/.test(rawInput)
        ? { driver_phone: rawInput }
        : { driver_id: rawInput };
    try {
      setSaving(true);
      setError('');
      setMessage('');
      await apiRequest(`/api/operators/vehicles/${vehicleId}/assign-driver`, {
        method: 'PUT',
        token,
        body,
      });
      setAssignmentInputs((prev) => ({ ...prev, [vehicleId]: '' }));
      setMessage('Driver assigned and synced to driver vehicles.');
      await loadPortal();
    } catch (err) {
      setError(err?.message || 'Could not assign driver.');
    } finally {
      setSaving(false);
    }
  };

  const unassignDriver = async (vehicleId) => {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      await apiRequest(`/api/operators/vehicles/${vehicleId}/assign-driver`, {
        method: 'DELETE',
        token,
      });
      setMessage('Driver unassigned.');
      await loadPortal();
    } catch (err) {
      setError(err?.message || 'Could not unassign driver.');
    } finally {
      setSaving(false);
    }
  };

  const disableVehicle = async (vehicleId) => {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      await apiRequest(`/api/operators/vehicles/${vehicleId}`, {
        method: 'DELETE',
        token,
      });
      setMessage('Vehicle disabled.');
      await loadPortal();
    } catch (err) {
      setError(err?.message || 'Could not disable vehicle.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <AutoBuddyBrand subtitle="Loading operator portal..." />
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <AutoBuddyBrand subtitle="Owner / Operator Portal" />
            <Text style={styles.headerText}>{profile?.company_name || `${user?.name || 'Operator'} Fleet`}</Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!message && <Text style={styles.success}>{message}</Text>}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
          style={styles.tabScroller}>
          {OPERATOR_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key)}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {activeTab === 'overview' && (
          <>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Fleet Vehicles</Text>
                <Text style={styles.summaryValue}>{Number(summary.total_vehicles || 0)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Assigned</Text>
                <Text style={styles.summaryValue}>{Number(summary.assigned_vehicles || 0)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Drivers</Text>
                <Text style={styles.summaryValue}>{Number(summary.drivers || 0)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Completed Rides</Text>
                <Text style={styles.summaryValue}>{Number(summary.completed_rides || 0)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Gross Earnings</Text>
                <Text style={styles.summaryValueSmall}>{formatCurrency(summary.gross_earnings)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Verification</Text>
                <Text style={styles.summaryValueSmall}>{titleForRole(profile?.verification_status || 'pending')}</Text>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Recent Completed Rides</Text>
              {recentBookings.length === 0 ? (
                <Text style={styles.emptyText}>No completed rides yet.</Text>
              ) : (
                recentBookings.slice(0, 8).map((booking) => (
                  <View key={booking.id || booking._id || `${booking.driver_id}-${booking.created_at}`} style={styles.rideRow}>
                    <View>
                      <Text style={styles.rideTitle}>
                        {booking.pickup_address || booking.pickup_location?.address || 'Pickup'}
                        {' -> '}
                        {booking.drop_address || booking.drop_location?.address || 'Drop'}
                      </Text>
                      <Text style={styles.vehicleMeta}>
                        Driver {booking.driver_name || booking.driver_id || '-'} | {formatDateTime(booking.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.rideFare}>{formatCurrency(booking.final_fare || booking.estimated_fare)}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {activeTab === 'profile' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Business Profile</Text>
          <View style={styles.formGrid}>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Company Name</Text>
              <VoiceTextInput style={styles.input} value={profileForm.company_name} onChangeText={(value) => updateProfileField('company_name', value)} placeholder="Fleet company name" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Contact Name</Text>
              <VoiceTextInput style={styles.input} value={profileForm.contact_name} onChangeText={(value) => updateProfileField('contact_name', value)} placeholder="Owner or manager" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Contact Email</Text>
              <VoiceTextInput style={styles.input} value={profileForm.contact_email} onChangeText={(value) => updateProfileField('contact_email', value)} keyboardType="email-address" autoCapitalize="none" placeholder="email@example.com" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Contact Phone</Text>
              <VoiceTextInput style={styles.input} value={profileForm.contact_phone} onChangeText={(value) => updateProfileField('contact_phone', value)} keyboardType="phone-pad" placeholder="10 digit phone" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>GST Number</Text>
              <VoiceTextInput style={styles.input} value={profileForm.gst_number} onChangeText={(value) => updateProfileField('gst_number', value)} autoCapitalize="characters" placeholder="Optional" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Service Regions</Text>
              <VoiceTextInput style={styles.input} value={profileForm.service_regions_text} onChangeText={(value) => updateProfileField('service_regions_text', value)} placeholder="all, Ernakulam, Kochi" placeholderTextColor={COLORS.textMuted} />
            </View>
          </View>
          <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={saveProfile} disabled={saving}>
            <Text style={styles.primaryText}>Save Profile</Text>
          </TouchableOpacity>
        </View>
        )}

        {activeTab === 'vehicles' && (
          <>
        <View style={styles.panel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{editingVehicleId ? 'Edit Fleet Vehicle' : 'Add Fleet Vehicle'}</Text>
            {editingVehicleId ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={resetVehicleForm}>
                <Text style={styles.secondaryText}>Cancel Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.inputLabel}>Vehicle Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {vehicleTypes.map((vehicleType) => {
              const typeId = String(vehicleType.vehicle_type_id || '');
              const active = vehicleForm.vehicle_type_id === typeId;
              return (
                <TouchableOpacity
                  key={typeId}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                  onPress={() => {
                    const firstSubtype = Array.isArray(vehicleType.subtypes) && vehicleType.subtypes.length > 0
                      ? String(vehicleType.subtypes[0].id || '')
                      : '';
                    setVehicleForm((prev) => ({
                      ...prev,
                      vehicle_type_id: typeId,
                      vehicle_subtype_id: firstSubtype,
                    }));
                  }}>
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                    {vehicleType.icon ? `${vehicleType.icon} ` : ''}{vehicleType.name || titleForRole(typeId)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedSubtypes.length > 0 && (
            <>
              <Text style={styles.inputLabel}>Subtype</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {selectedSubtypes.map((subtype) => {
                  const subtypeId = String(subtype.id || '');
                  const active = vehicleForm.vehicle_subtype_id === subtypeId;
                  return (
                    <TouchableOpacity
                      key={subtypeId}
                      style={[styles.choiceChip, active && styles.choiceChipActive]}
                      onPress={() => updateVehicleField('vehicle_subtype_id', subtypeId)}>
                      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                        {subtype.name || titleForRole(subtypeId)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          <View style={styles.formGrid}>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Make</Text>
              <VoiceTextInput style={styles.input} value={vehicleForm.make} onChangeText={(value) => updateVehicleField('make', value)} placeholder="Tata, Maruti, Mahindra" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Model</Text>
              <VoiceTextInput style={styles.input} value={vehicleForm.model} onChangeText={(value) => updateVehicleField('model', value)} placeholder="Vehicle model" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Year</Text>
              <VoiceTextInput style={styles.input} value={vehicleForm.year} onChangeText={(value) => updateVehicleField('year', value)} keyboardType="number-pad" placeholder="2026" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Color</Text>
              <VoiceTextInput style={styles.input} value={vehicleForm.color} onChangeText={(value) => updateVehicleField('color', value)} placeholder="White" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>License Plate</Text>
              <VoiceTextInput style={styles.input} value={vehicleForm.license_plate} onChangeText={(value) => updateVehicleField('license_plate', value)} autoCapitalize="characters" placeholder="KL07AB1234" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Registration Number</Text>
              <VoiceTextInput style={styles.input} value={vehicleForm.registration_number} onChangeText={(value) => updateVehicleField('registration_number', value)} autoCapitalize="characters" placeholder="Optional" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Capacity</Text>
              <VoiceTextInput style={styles.input} value={vehicleForm.seating_capacity} onChangeText={(value) => updateVehicleField('seating_capacity', value)} keyboardType="number-pad" placeholder="Auto-filled from subtype" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.inputLabel}>Service Regions</Text>
              <VoiceTextInput style={styles.input} value={vehicleForm.service_regions_text} onChangeText={(value) => updateVehicleField('service_regions_text', value)} placeholder="all, Kochi" placeholderTextColor={COLORS.textMuted} />
            </View>
          </View>
          <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={saveVehicle} disabled={saving}>
            <Text style={styles.primaryText}>{editingVehicleId ? 'Update Vehicle' : 'Add Vehicle'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Fleet Vehicles</Text>
          {vehicles.length === 0 ? (
            <Text style={styles.emptyText}>No fleet vehicles added yet.</Text>
          ) : (
            vehicles.map((vehicle) => (
              <View key={vehicle.id} style={styles.vehicleCard}>
                <View style={styles.vehicleHeader}>
                  <View>
                    <Text style={styles.vehicleTitle}>
                      {vehicle.make} {vehicle.model}
                    </Text>
                    <Text style={styles.vehicleMeta}>
                      {vehicle.license_plate} | {vehicle.vehicle_type_name || vehicle.vehicle_type_id}
                      {vehicle.vehicle_subtype_name ? ` / ${vehicle.vehicle_subtype_name}` : ''}
                    </Text>
                    <Text style={styles.vehicleMeta}>
                      Capacity {vehicle.seating_capacity || vehicle.capacity || '-'} | Status {vehicle.verification_status || 'pending'}
                    </Text>
                    <Text style={styles.vehicleMeta}>
                      Driver: {vehicle.assigned_driver_name || vehicle.assigned_driver_id || 'Unassigned'}
                    </Text>
                  </View>
                  <View style={styles.vehicleActions}>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => editVehicle(vehicle)}>
                      <Text style={styles.secondaryText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.dangerButton} onPress={() => disableVehicle(vehicle.id)} disabled={saving}>
                      <Text style={styles.dangerText}>Disable</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.assignRow}>
                  <VoiceTextInput
                    style={[styles.input, styles.assignInput]}
                    value={assignmentInputs[vehicle.id] || ''}
                    onChangeText={(value) => setAssignmentInputs((prev) => ({ ...prev, [vehicle.id]: value }))}
                    placeholder="Driver email, phone, or ID"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TouchableOpacity style={styles.primarySmallButton} onPress={() => assignDriver(vehicle.id)} disabled={saving}>
                    <Text style={styles.primaryText}>Assign</Text>
                  </TouchableOpacity>
                  {vehicle.assigned_driver_id ? (
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => unassignDriver(vehicle.id)} disabled={saving}>
                      <Text style={styles.secondaryText}>Unassign</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
          </>
        )}

        {activeTab === 'fleet' && (
          operatorFleetId ? (
            <FleetDashboardAdvanced token={token} fleetId={operatorFleetId} onTabChange={handleAdvancedTabChange} />
          ) : (
            <View style={styles.panel}>
              <Text style={styles.emptyText}>Operator profile is still loading.</Text>
            </View>
          )
        )}

        {activeTab === 'wallet' && (
          operatorFleetId ? (
            <FleetWalletPanel token={token} fleetId={operatorFleetId} />
          ) : (
            <View style={styles.panel}>
              <Text style={styles.emptyText}>Operator profile is still loading.</Text>
            </View>
          )
        )}

        {activeTab === 'performance' && (
          operatorFleetId ? (
            <PerformanceRankingsPanel token={token} fleetId={operatorFleetId} />
          ) : (
            <View style={styles.panel}>
              <Text style={styles.emptyText}>Operator profile is still loading.</Text>
            </View>
          )
        )}

        {activeTab === 'map' && (
          operatorFleetId ? (
            <LiveFleetMapPanel token={token} fleetId={operatorFleetId} />
          ) : (
            <View style={styles.panel}>
              <Text style={styles.emptyText}>Operator profile is still loading.</Text>
            </View>
          )
        )}

        {activeTab === 'incentives' && (
          operatorFleetId ? (
            <IncentiveManagementPanel token={token} fleetId={operatorFleetId} />
          ) : (
            <View style={styles.panel}>
              <Text style={styles.emptyText}>Operator profile is still loading.</Text>
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  container: {
    padding: 18,
    paddingBottom: 40,
    maxWidth: 1160,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headerText: {
    color: COLORS.textMuted,
    fontWeight: '700',
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutText: {
    color: COLORS.textMain,
    fontWeight: '800',
  },
  error: {
    color: COLORS.danger,
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F4B5B5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontWeight: '700',
  },
  success: {
    color: COLORS.success,
    backgroundColor: '#EAF7EF',
    borderWidth: 1,
    borderColor: '#B8E3C8',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontWeight: '700',
  },
  tabScroller: {
    marginBottom: 14,
  },
  tabRow: {
    gap: 8,
    paddingRight: 8,
  },
  tabButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabText: {
    color: COLORS.textMain,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 180,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    ...SHADOWS.soft,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontWeight: '700',
    marginBottom: 8,
  },
  summaryValue: {
    color: COLORS.textMain,
    fontSize: 28,
    fontWeight: '900',
  },
  summaryValueSmall: {
    color: COLORS.textMain,
    fontSize: 20,
    fontWeight: '900',
  },
  panel: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    ...SHADOWS.soft,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: COLORS.textMain,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 12,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  formField: {
    flexGrow: 1,
    flexBasis: 260,
  },
  inputLabel: {
    color: COLORS.textMain,
    fontWeight: '800',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    color: COLORS.textMain,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 10,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: COLORS.bg,
  },
  choiceChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  choiceText: {
    color: COLORS.textMain,
    fontWeight: '800',
  },
  choiceTextActive: {
    color: '#FFFFFF',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primarySmallButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minWidth: 86,
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
  },
  secondaryText: {
    color: COLORS.textMain,
    fontWeight: '800',
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: '#F4B5B5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FDECEC',
  },
  dangerText: {
    color: COLORS.danger,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  rideRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rideTitle: {
    color: COLORS.textMain,
    fontWeight: '900',
  },
  rideFare: {
    color: COLORS.primary,
    fontWeight: '900',
  },
  vehicleCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: COLORS.bg,
    marginBottom: 12,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  vehicleTitle: {
    color: COLORS.textMain,
    fontSize: 17,
    fontWeight: '900',
  },
  vehicleMeta: {
    color: COLORS.textMuted,
    marginTop: 4,
    fontWeight: '700',
  },
  vehicleActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  assignRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  assignInput: {
    flexGrow: 1,
    minWidth: 220,
  },
});
