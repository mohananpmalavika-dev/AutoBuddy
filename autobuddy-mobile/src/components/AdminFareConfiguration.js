/**
 * AdminFareConfiguration.js
 * Admin interface for managing global, district, and locality fares
 * Also manages individual driver fare overrides
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Text,
} from "react-native";
import { COLORS, SHADOWS, SPACING } from "../theme";
import { apiRequest } from "../lib/api";

const RIDE_TYPES = ["standard", "premium", "economy"];

const TAB_OPTIONS = {
  GLOBAL: "global",
  DISTRICT: "district",
  LOCALITY: "locality",
  DRIVER: "driver",
};

// Render fare form field
function FareFormField({ label, value, onChange, testID }) {
  return (
    <View style={styles.formField}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={label}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        testID={testID}
      />
    </View>
  );
}

// Render fare card
function FareCard({ fare, onDelete, deleteParams }) {
  return (
    <View style={styles.fareCard}>
      <View style={styles.fareCardHeader}>
        <Text style={styles.fareCardTitle}>{fare.ride_type}</Text>
        <TouchableOpacity onPress={() => onDelete(deleteParams)}>
          <Text style={styles.deleteButton}>Delete</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.fareDetails}>
        <Text style={styles.fareDetail}>Base: ₹{fare.base_fare.toFixed(2)}</Text>
        <Text style={styles.fareDetail}>Per km: ₹{fare.per_km.toFixed(2)}</Text>
        <Text style={styles.fareDetail}>Per min: ₹{fare.per_minute.toFixed(2)}</Text>
        <Text style={styles.fareDetail}>Min: ₹{fare.minimum_fare.toFixed(2)}</Text>
        <Text style={styles.fareDetail}>Surge: {fare.surge_multiplier.toFixed(2)}x</Text>
      </View>
    </View>
  );
}

// Render tab buttons
function TabButton({ tab, label, activeTab, onPress, loading }) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
      onPress={() => onPress(tab)}
      disabled={loading}
    >
      <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function AdminFareConfiguration({ onClose }) {
  const [activeTab, setActiveTab] = useState(TAB_OPTIONS.GLOBAL);
  const [loading, setLoading] = useState(false);

  // Global fare state
  const [globalFares, setGlobalFares] = useState([]);
  const [globalFormData, setGlobalFormData] = useState({
    ride_type: "standard",
    base_fare: "",
    per_km: "",
    per_minute: "",
    minimum_fare: "",
    surge_multiplier: "1.0",
  });

  // District state
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [districtFares, setDistrictFares] = useState([]);
  const [districtFormData, setDistrictFormData] = useState({
    ride_type: "standard",
    base_fare: "",
    per_km: "",
    per_minute: "",
    minimum_fare: "",
    surge_multiplier: "1.0",
  });

  // Locality state
  const [selectedDistrictLocality, setSelectedDistrictLocality] = useState("");
  const [localityFares, setLocalityFares] = useState([]);
  const [selectedLocality, setSelectedLocality] = useState("");
  const [localityFormData, setLocalityFormData] = useState({
    ride_type: "standard",
    base_fare: "",
    per_km: "",
    per_minute: "",
    minimum_fare: "",
    surge_multiplier: "1.0",
  });

  // Driver override state
  const [driverSearchId, setDriverSearchId] = useState("");
  const [driverFares, setDriverFares] = useState([]);
  const [driverFormData, setDriverFormData] = useState({
    ride_type: "standard",
    base_fare: "",
    per_km: "",
    per_minute: "",
    minimum_fare: "",
    surge_multiplier: "1.0",
  });

  // Fetch global fares
  const fetchGlobalFares = useCallback(async () => {
    try {
      const response = await apiRequest('/api/admin/fares/global', { method: 'GET' });
      setGlobalFares(response.fares || []);
    } catch (error) {
      console.error("Error fetching global fares:", error);
    }
  }, []);

  // Fetch district fares
  const fetchDistrictFares = useCallback(async () => {
    if (!selectedDistrict) {
      setDistrictFares([]);
      return;
    }
    try {
      const response = await apiRequest(`/api/admin/fares/district/${selectedDistrict}`, { method: 'GET' });
      setDistrictFares(response.fares || []);
    } catch (error) {
      console.error("Error fetching district fares:", error);
    }
  }, [selectedDistrict]);

  // Fetch locality fares
  const fetchLocalityFares = useCallback(async () => {
    if (!selectedDistrictLocality || !selectedLocality) {
      setLocalityFares([]);
      return;
    }
    try {
      const response = await apiRequest(
        `/api/admin/fares/locality/${selectedDistrictLocality}/${selectedLocality}`,
        { method: 'GET' }
      );
      setLocalityFares(response.fares || []);
    } catch (error) {
      console.error("Error fetching locality fares:", error);
    }
  }, [selectedDistrictLocality, selectedLocality]);

  // Fetch driver fares
  const fetchDriverFares = useCallback(async () => {
    if (!driverSearchId) {
      setDriverFares([]);
      return;
    }
    try {
      const response = await apiRequest(`/api/admin/drivers/${driverSearchId}/fares`, { method: 'GET' });
      setDriverFares(response.fares || []);
    } catch (error) {
      console.error("Error fetching driver fares:", error);
    }
  }, [driverSearchId]);

  // Initial loads
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted && activeTab === TAB_OPTIONS.GLOBAL) {
        await fetchGlobalFares();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTab, fetchGlobalFares]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted && activeTab === TAB_OPTIONS.DISTRICT) {
        await fetchDistrictFares();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTab, selectedDistrict, fetchDistrictFares]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted && activeTab === TAB_OPTIONS.LOCALITY) {
        await fetchLocalityFares();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTab, selectedDistrictLocality, selectedLocality, fetchLocalityFares]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted && activeTab === TAB_OPTIONS.DRIVER) {
        await fetchDriverFares();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTab, driverSearchId, fetchDriverFares]);

  // Save global fare
  const handleSaveGlobalFare = useCallback(async () => {
    if (!globalFormData.base_fare || !globalFormData.per_km || !globalFormData.per_minute || !globalFormData.minimum_fare) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/api/admin/fares/global', {
        method: 'POST',
        body: {
          ride_type: globalFormData.ride_type,
          base_fare: parseFloat(globalFormData.base_fare),
          per_km: parseFloat(globalFormData.per_km),
          per_minute: parseFloat(globalFormData.per_minute),
          minimum_fare: parseFloat(globalFormData.minimum_fare),
          surge_multiplier: parseFloat(globalFormData.surge_multiplier),
          enabled: true,
        },
      });

      Alert.alert("Success", "Global fare saved");
      setGlobalFormData({
        ride_type: "standard",
        base_fare: "",
        per_km: "",
        per_minute: "",
        minimum_fare: "",
        surge_multiplier: "1.0",
      });
      await fetchGlobalFares();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  }, [globalFormData, fetchGlobalFares]);

  // Save district fare
  const handleSaveDistrictFare = useCallback(async () => {
    if (!selectedDistrict || !districtFormData.base_fare || !districtFormData.per_km || !districtFormData.per_minute || !districtFormData.minimum_fare) {
      Alert.alert("Error", "Please select district and fill all fields");
      return;
    }

    setLoading(true);
    try {
      await apiRequest(`/api/admin/fares/district/${selectedDistrict}`, {
        method: 'POST',
        body: {
          district: selectedDistrict,
          ride_type: districtFormData.ride_type,
          base_fare: parseFloat(districtFormData.base_fare),
          per_km: parseFloat(districtFormData.per_km),
          per_minute: parseFloat(districtFormData.per_minute),
          minimum_fare: parseFloat(districtFormData.minimum_fare),
          surge_multiplier: parseFloat(districtFormData.surge_multiplier),
          enabled: true,
        },
      });

      Alert.alert("Success", "District fare saved");
      setDistrictFormData({
        ride_type: "standard",
        base_fare: "",
        per_km: "",
        per_minute: "",
        minimum_fare: "",
        surge_multiplier: "1.0",
      });
      await fetchDistrictFares();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDistrict, districtFormData, fetchDistrictFares]);

  // Save locality fare
  const handleSaveLocalityFare = useCallback(async () => {
    if (!selectedDistrictLocality || !selectedLocality || !localityFormData.base_fare || !localityFormData.per_km || !localityFormData.per_minute || !localityFormData.minimum_fare) {
      Alert.alert("Error", "Please select district/locality and fill all fields");
      return;
    }

    setLoading(true);
    try {
      await apiRequest(`/api/admin/fares/locality/${selectedDistrictLocality}/${selectedLocality}`, {
        method: 'POST',
        body: {
          district: selectedDistrictLocality,
          locality: selectedLocality,
          ride_type: localityFormData.ride_type,
          base_fare: parseFloat(localityFormData.base_fare),
          per_km: parseFloat(localityFormData.per_km),
          per_minute: parseFloat(localityFormData.per_minute),
          minimum_fare: parseFloat(localityFormData.minimum_fare),
          surge_multiplier: parseFloat(localityFormData.surge_multiplier),
          enabled: true,
        },
      });

      Alert.alert("Success", "Locality fare saved");
      setLocalityFormData({
        ride_type: "standard",
        base_fare: "",
        per_km: "",
        per_minute: "",
        minimum_fare: "",
        surge_multiplier: "1.0",
      });
      await fetchLocalityFares();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDistrictLocality, selectedLocality, localityFormData, fetchLocalityFares]);

  // Save driver override
  const handleSaveDriverOverride = useCallback(async () => {
    if (!driverSearchId || !driverFormData.base_fare || !driverFormData.per_km || !driverFormData.per_minute || !driverFormData.minimum_fare) {
      Alert.alert("Error", "Please select driver and fill all fields");
      return;
    }

    setLoading(true);
    try {
      await apiRequest(`/api/admin/drivers/${driverSearchId}/fares`, {
        method: 'POST',
        body: {
          ride_type: driverFormData.ride_type,
          base_fare: parseFloat(driverFormData.base_fare),
          per_km: parseFloat(driverFormData.per_km),
          per_minute: parseFloat(driverFormData.per_minute),
          minimum_fare: parseFloat(driverFormData.minimum_fare),
          surge_multiplier: parseFloat(driverFormData.surge_multiplier),
        },
      });

      Alert.alert("Success", "Driver fare override saved");
      setDriverFormData({
        ride_type: "standard",
        base_fare: "",
        per_km: "",
        per_minute: "",
        minimum_fare: "",
        surge_multiplier: "1.0",
      });
      await fetchDriverFares();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  }, [driverSearchId, driverFormData, fetchDriverFares]);

  // Delete fare
  const handleDeleteFare = useCallback(
    async (fareType, ...params) => {
      Alert.alert(
        "Confirm Delete",
        "Are you sure? This will remove the custom fare and fallback to default.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            onPress: async () => {
              setLoading(true);
              try {
                if (fareType === "global") {
                  await apiRequest(`/api/admin/fares/global/${params[0]}`, { method: 'DELETE' });
                  await fetchGlobalFares();
                } else if (fareType === "district") {
                  await apiRequest(`/api/admin/fares/district/${params[0]}/${params[1]}`, { method: 'DELETE' });
                  await fetchDistrictFares();
                } else if (fareType === "locality") {
                  await apiRequest(`/api/admin/fares/locality/${params[0]}/${params[1]}/${params[2]}`, { method: 'DELETE' });
                  await fetchLocalityFares();
                } else if (fareType === "driver") {
                  await apiRequest(`/api/admin/drivers/${params[0]}/fares/${params[1]}`, { method: 'DELETE' });
                  await fetchDriverFares();
                }
                Alert.alert("Success", "Fare deleted");
              } catch (error) {
                Alert.alert("Error", error.message);
              } finally {
                setLoading(false);
              }
            },
            style: "destructive",
          },
        ]
      );
    },
    [fetchGlobalFares, fetchDistrictFares, fetchLocalityFares, fetchDriverFares]
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Fare Configuration</Text>
        <TouchableOpacity onPress={onClose} disabled={loading}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TabButton tab={TAB_OPTIONS.GLOBAL} label="Global" activeTab={activeTab} onPress={setActiveTab} loading={loading} />
        <TabButton tab={TAB_OPTIONS.DISTRICT} label="District" activeTab={activeTab} onPress={setActiveTab} loading={loading} />
        <TabButton tab={TAB_OPTIONS.LOCALITY} label="Locality" activeTab={activeTab} onPress={setActiveTab} loading={loading} />
        <TabButton tab={TAB_OPTIONS.DRIVER} label="Driver" activeTab={activeTab} onPress={setActiveTab} loading={loading} />
      </View>

      {loading && <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />}

      {/* Global Tab */}
      {activeTab === TAB_OPTIONS.GLOBAL && (
        <View style={styles.tabContent}>
          <Text style={styles.sectionTitle}>Set Global Default Fares</Text>

          <View style={styles.formGroup}>
            <View style={styles.formField}>
              <Text style={styles.label}>Ride Type</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => {
                  Alert.alert(
                    'Select Ride Type',
                    '',
                    [
                      ...RIDE_TYPES.map(type => ({
                        text: type.charAt(0).toUpperCase() + type.slice(1),
                        onPress: () => setGlobalFormData({ ...globalFormData, ride_type: type }),
                      })),
                      { text: 'Cancel', onPress: () => {} },
                    ]
                  );
                }}
              >
                <Text style={styles.pickerButtonText}>
                  {globalFormData.ride_type ? globalFormData.ride_type.charAt(0).toUpperCase() + globalFormData.ride_type.slice(1) : 'Select Ride Type'}
                </Text>
              </TouchableOpacity>
            </View>

            <FareFormField
              label="Base Fare (₹)"
              value={globalFormData.base_fare}
              onChange={(value) => setGlobalFormData({ ...globalFormData, base_fare: value })}
              testID="globalBaseFare"
            />
            <FareFormField
              label="Per KM (₹)"
              value={globalFormData.per_km}
              onChange={(value) => setGlobalFormData({ ...globalFormData, per_km: value })}
              testID="globalPerKm"
            />
            <FareFormField
              label="Per Minute (₹)"
              value={globalFormData.per_minute}
              onChange={(value) => setGlobalFormData({ ...globalFormData, per_minute: value })}
              testID="globalPerMinute"
            />
            <FareFormField
              label="Minimum Fare (₹)"
              value={globalFormData.minimum_fare}
              onChange={(value) => setGlobalFormData({ ...globalFormData, minimum_fare: value })}
              testID="globalMinimumFare"
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveGlobalFare}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>Save Global Fare</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Current Global Fares</Text>
          {globalFares.map((fare) => (
            <FareCard
              key={fare.id}
              fare={fare}
              onDelete={handleDeleteFare}
              deleteParams={["global", fare.ride_type]}
            />
          ))}
        </View>
      )}

      {/* District Tab */}
      {activeTab === TAB_OPTIONS.DISTRICT && (
        <View style={styles.tabContent}>
          <Text style={styles.sectionTitle}>District Fare Configuration</Text>

          <View style={styles.formGroup}>
            <View style={styles.formField}>
              <Text style={styles.label}>District</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter district name"
                value={selectedDistrict}
                onChangeText={setSelectedDistrict}
                editable={!loading}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Ride Type</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => {
                  Alert.alert(
                    'Select Ride Type',
                    '',
                    [
                      ...RIDE_TYPES.map(type => ({
                        text: type.charAt(0).toUpperCase() + type.slice(1),
                        onPress: () => setDistrictFormData({ ...districtFormData, ride_type: type }),
                      })),
                      { text: 'Cancel', onPress: () => {} },
                    ]
                  );
                }}
              >
                <Text style={styles.pickerButtonText}>
                  {districtFormData.ride_type ? districtFormData.ride_type.charAt(0).toUpperCase() + districtFormData.ride_type.slice(1) : 'Select Ride Type'}
                </Text>
              </TouchableOpacity>
            </View>

            <FareFormField
              label="Base Fare (₹)"
              value={districtFormData.base_fare}
              onChange={(value) => setDistrictFormData({ ...districtFormData, base_fare: value })}
            />
            <FareFormField
              label="Per KM (₹)"
              value={districtFormData.per_km}
              onChange={(value) => setDistrictFormData({ ...districtFormData, per_km: value })}
            />
            <FareFormField
              label="Per Minute (₹)"
              value={districtFormData.per_minute}
              onChange={(value) => setDistrictFormData({ ...districtFormData, per_minute: value })}
            />
            <FareFormField
              label="Minimum Fare (₹)"
              value={districtFormData.minimum_fare}
              onChange={(value) => setDistrictFormData({ ...districtFormData, minimum_fare: value })}
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveDistrictFare}
              disabled={loading || !selectedDistrict}
            >
              <Text style={styles.saveButtonText}>Save District Fare</Text>
            </TouchableOpacity>
          </View>

          {selectedDistrict && (
            <>
              <Text style={styles.sectionTitle}>Current Fares for {selectedDistrict}</Text>
              {districtFares.map((fare) => (
                <FareCard
                  key={fare.id}
                  fare={fare}
                  onDelete={handleDeleteFare}
                  deleteParams={["district", selectedDistrict, fare.ride_type]}
                />
              ))}
            </>
          )}
        </View>
      )}

      {/* Locality Tab */}
      {activeTab === TAB_OPTIONS.LOCALITY && (
        <View style={styles.tabContent}>
          <Text style={styles.sectionTitle}>Locality Fare Configuration</Text>

          <View style={styles.formGroup}>
            <View style={styles.formField}>
              <Text style={styles.label}>District</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter district name"
                value={selectedDistrictLocality}
                onChangeText={setSelectedDistrictLocality}
                editable={!loading}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Locality</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter locality name"
                value={selectedLocality}
                onChangeText={setSelectedLocality}
                editable={!loading}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Ride Type</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => {
                  Alert.alert(
                    'Select Ride Type',
                    '',
                    [
                      ...RIDE_TYPES.map(type => ({
                        text: type.charAt(0).toUpperCase() + type.slice(1),
                        onPress: () => setLocalityFormData({ ...localityFormData, ride_type: type }),
                      })),
                      { text: 'Cancel', onPress: () => {} },
                    ]
                  );
                }}
              >
                <Text style={styles.pickerButtonText}>
                  {localityFormData.ride_type ? localityFormData.ride_type.charAt(0).toUpperCase() + localityFormData.ride_type.slice(1) : 'Select Ride Type'}
                </Text>
              </TouchableOpacity>
            </View>

            <FareFormField
              label="Base Fare (₹)"
              value={localityFormData.base_fare}
              onChange={(value) => setLocalityFormData({ ...localityFormData, base_fare: value })}
            />
            <FareFormField
              label="Per KM (₹)"
              value={localityFormData.per_km}
              onChange={(value) => setLocalityFormData({ ...localityFormData, per_km: value })}
            />
            <FareFormField
              label="Per Minute (₹)"
              value={localityFormData.per_minute}
              onChange={(value) => setLocalityFormData({ ...localityFormData, per_minute: value })}
            />
            <FareFormField
              label="Minimum Fare (₹)"
              value={localityFormData.minimum_fare}
              onChange={(value) => setLocalityFormData({ ...localityFormData, minimum_fare: value })}
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveLocalityFare}
              disabled={loading || !selectedDistrictLocality || !selectedLocality}
            >
              <Text style={styles.saveButtonText}>Save Locality Fare</Text>
            </TouchableOpacity>
          </View>

          {selectedDistrictLocality && selectedLocality && (
            <>
              <Text style={styles.sectionTitle}>
                Current Fares for {selectedDistrictLocality} / {selectedLocality}
              </Text>
              {localityFares.map((fare) => (
                <FareCard
                  key={fare.id}
                  fare={fare}
                  onDelete={handleDeleteFare}
                  deleteParams={["locality", selectedDistrictLocality, selectedLocality, fare.ride_type]}
                />
              ))}
            </>
          )}
        </View>
      )}

      {/* Driver Tab */}
      {activeTab === TAB_OPTIONS.DRIVER && (
        <View style={styles.tabContent}>
          <Text style={styles.sectionTitle}>Driver Fare Override</Text>

          <View style={styles.formGroup}>
            <View style={styles.formField}>
              <Text style={styles.label}>Driver ID</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter driver ID"
                value={driverSearchId}
                onChangeText={setDriverSearchId}
                editable={!loading}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Ride Type</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => {
                  Alert.alert(
                    'Select Ride Type',
                    '',
                    [
                      ...RIDE_TYPES.map(type => ({
                        text: type.charAt(0).toUpperCase() + type.slice(1),
                        onPress: () => setDriverFormData({ ...driverFormData, ride_type: type }),
                      })),
                      { text: 'Cancel', onPress: () => {} },
                    ]
                  );
                }}
              >
                <Text style={styles.pickerButtonText}>
                  {driverFormData.ride_type ? driverFormData.ride_type.charAt(0).toUpperCase() + driverFormData.ride_type.slice(1) : 'Select Ride Type'}
                </Text>
              </TouchableOpacity>
            </View>

            <FareFormField
              label="Base Fare (₹)"
              value={driverFormData.base_fare}
              onChange={(value) => setDriverFormData({ ...driverFormData, base_fare: value })}
            />
            <FareFormField
              label="Per KM (₹)"
              value={driverFormData.per_km}
              onChange={(value) => setDriverFormData({ ...driverFormData, per_km: value })}
            />
            <FareFormField
              label="Per Minute (₹)"
              value={driverFormData.per_minute}
              onChange={(value) => setDriverFormData({ ...driverFormData, per_minute: value })}
            />
            <FareFormField
              label="Minimum Fare (₹)"
              value={driverFormData.minimum_fare}
              onChange={(value) => setDriverFormData({ ...driverFormData, minimum_fare: value })}
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveDriverOverride}
              disabled={loading || !driverSearchId}
            >
              <Text style={styles.saveButtonText}>Save Driver Override</Text>
            </TouchableOpacity>
          </View>

          {driverSearchId && (
            <>
              <Text style={styles.sectionTitle}>Current Overrides for Driver {driverSearchId}</Text>
              {driverFares.length > 0 ? (
                driverFares.map((fare) => (
                  <FareCard
                    key={fare.id}
                    fare={fare}
                    onDelete={handleDeleteFare}
                    deleteParams={["driver", driverSearchId, fare.ride_type]}
                  />
                ))
              ) : (
                <Text style={styles.noDataText}>No custom fares for this driver</Text>
              )}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.large,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.large,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.text,
  },
  closeButton: {
    fontSize: 28,
    color: COLORS.textSecondary,
    fontWeight: "300",
  },
  tabsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.large,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: SPACING.medium,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    alignItems: "center",
  },
  tabButtonActive: {
    borderBottomColor: COLORS.primary,
  },
  tabButtonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: COLORS.primary,
  },
  tabContent: {
    marginBottom: SPACING.xlarge,
  },
  loader: {
    marginVertical: SPACING.large,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginVertical: SPACING.large,
  },
  formGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.large,
    ...SHADOWS.small,
  },
  formField: {
    marginBottom: SPACING.medium,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    fontSize: 14,
    color: COLORS.text,
  },
  picker: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    color: COLORS.text,
  },
  pickerButton: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    justifyContent: 'center',
  },
  pickerButtonText: {
    fontSize: 14,
    color: COLORS.text,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.medium,
    borderRadius: 8,
    alignItems: "center",
    marginTop: SPACING.large,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
  },
  fareCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.large,
    marginBottom: SPACING.medium,
    ...SHADOWS.small,
  },
  fareCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.medium,
  },
  fareCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    textTransform: "capitalize",
  },
  deleteButton: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  fareDetails: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.medium,
  },
  fareDetail: {
    fontSize: 13,
    color: COLORS.text,
    marginVertical: 4,
  },
  noDataText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginVertical: SPACING.large,
  },
};
