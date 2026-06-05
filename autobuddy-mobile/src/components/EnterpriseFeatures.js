import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const COLORS = {
  primary: '#2D4A7B',
  secondary: '#FF8C42',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  light: '#F5F5F5',
  dark: '#333',
  mutedDark: '#666',
};

/**
 * FEATURE 1: AIRPORT BOOKING COMPONENT
 */
export const AirportBookingPanel = ({ token, onAirportBookingCreated }) => {
  const [airports, setAirports] = useState([]);
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [flightNumber, setFlightNumber] = useState('');
  const [scheduledArrival, setScheduledArrival] = useState('');
  const [meetAndGreet, setMeetAndGreet] = useState(false);
  const [luggageHelp, setLuggageHelp] = useState(false);
  const [luggageCount, setLuggageCount] = useState('0');
  const [loading, setLoading] = useState(false);
  const [showTerminalPicker, setShowTerminalPicker] = useState(false);

  const fetchAirports = useCallback(async () => {
    try {
      const response = await fetch('/api/enterprise/airports/list', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setAirports(data);
    } catch (error) {
      console.error('Error fetching airports:', error);
    }
  }, [token]);

  useEffect(() => {
    const timeout = setTimeout(fetchAirports, 0);
    return () => clearTimeout(timeout);
  }, [fetchAirports]);

  const handleBookAirportPickup = async () => {
    if (!selectedTerminal || !flightNumber) {
      alert('Please select terminal and enter flight number');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/enterprise/airport-booking/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          flight_number: flightNumber,
          scheduled_arrival: scheduledArrival || new Date().toISOString(),
          airport_code: selectedAirport.airport_code,
          terminal_id: selectedTerminal.id,
          pickup_zone: 'domestic',
          meet_and_greet: meetAndGreet,
          luggage_help: luggageHelp,
          luggage_count: parseInt(luggageCount)
        })
      });

      const data = await response.json();
      alert(`Booking confirmed! Total fare: INR ${data.total_fare}`);
      onAirportBookingCreated?.(data);
      
      // Reset form
      setFlightNumber('');
      setSelectedTerminal(null);
      setMeetAndGreet(false);
      setLuggageHelp(false);
      setLuggageCount('0');
    } catch (error) {
      alert('Error creating booking: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>✈️ Airport Pickup</Text>

      {/* Airport Selection */}
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={() => setShowTerminalPicker(!showTerminalPicker)}>
        <MaterialIcons name="flight-takeoff" size={20} color={COLORS.primary} />
        <Text style={styles.dropdownText}>
          {selectedAirport?.airport_code || 'Select Airport'}
        </Text>
      </TouchableOpacity>

      {showTerminalPicker && (
        <View style={styles.dropdownMenu}>
          {airports.map(airport => (
            <TouchableOpacity
              key={airport.airport_code}
              onPress={() => {
                setSelectedAirport(airport);
                setShowTerminalPicker(false);
              }}
              style={styles.dropdownItem}>
              <Text style={styles.dropdownItemText}>
                {airport.airport_code} - {airport.airport_name}
              </Text>
              {/* Sub-terminals */}
              {airport.terminals.map(terminal => (
                <TouchableOpacity
                  key={terminal.id}
                  onPress={() => {
                    setSelectedTerminal(terminal);
                    setSelectedAirport(airport);
                    setShowTerminalPicker(false);
                  }}
                  style={[styles.subItem, selectedTerminal?.id === terminal.id && styles.selectedSubItem]}>
                  <Text style={styles.subItemText}>
                    {terminal.terminal_name} ({terminal.terminal_code})
                  </Text>
                </TouchableOpacity>
              ))}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Flight Number */}
      <TextInput
        style={styles.input}
        placeholder="Flight Number (e.g., AI101)"
        value={flightNumber}
        onChangeText={setFlightNumber}
        placeholderTextColor={COLORS.mutedDark}
      />

      {/* Scheduled Arrival */}
      <TextInput
        style={styles.input}
        placeholder="Scheduled Arrival Time"
        value={scheduledArrival}
        onChangeText={setScheduledArrival}
        placeholderTextColor={COLORS.mutedDark}
      />

      {/* Service Options */}
      <View style={styles.optionRow}>
        <TouchableOpacity
          style={[styles.checkBox, meetAndGreet && styles.checkBoxSelected]}
          onPress={() => setMeetAndGreet(!meetAndGreet)}>
          {meetAndGreet && <MaterialIcons name="check" size={16} color={COLORS.light} />}
        </TouchableOpacity>
        <Text style={styles.optionText}>Meet & Greet (+INR 300)</Text>
      </View>

      <View style={styles.optionRow}>
        <TouchableOpacity
          style={[styles.checkBox, luggageHelp && styles.checkBoxSelected]}
          onPress={() => setLuggageHelp(!luggageHelp)}>
          {luggageHelp && <MaterialIcons name="check" size={16} color={COLORS.light} />}
        </TouchableOpacity>
        <Text style={styles.optionText}>Luggage Help</Text>
        {luggageHelp && (
          <TextInput
            style={[styles.input, styles.compactInput]}
            placeholder="# of bags"
            value={luggageCount}
            onChangeText={setLuggageCount}
            keyboardType="number-pad"
          />
        )}
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleBookAirportPickup}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color={COLORS.light} />
        ) : (
          <>
            <MaterialIcons name="check-circle" size={20} color={COLORS.light} />
            <Text style={styles.buttonText}>Book Airport Pickup</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};


/**
 * FEATURE 2: CORPORATE RIDE ACCOUNT COMPONENT
 */
export const CorporateRidePanel = ({ token, employeeData }) => {
  const [corporateName, setCorporateName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [totalSpent, setTotalSpent] = useState('0');
  const [monthlyBudget, setMonthlyBudget] = useState('10000');
  const [pendingApprovals] = useState([]);

  const fetchCorporateData = useCallback(async () => {
    try {
      // Fetch employee's corporate account details
      const response = await fetch('/api/enterprise/corporate/employee/info', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setCorporateName(data.corporate_name);
      setMonthlyBudget(data.monthly_budget);
      setTotalSpent(data.current_month_spent);
    } catch (error) {
      console.error('Error fetching corporate data:', error);
    }
  }, [token]);

  useEffect(() => {
    const timeout = setTimeout(fetchCorporateData, 0);
    return () => clearTimeout(timeout);
  }, [fetchCorporateData]);

  const spentPercent = (parseFloat(totalSpent) / parseFloat(monthlyBudget)) * 100;
  const remainingBudget = parseFloat(monthlyBudget) - parseFloat(totalSpent);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>🏢 Corporate Account</Text>

      <View style={styles.corporateCard}>
        <Text style={styles.corporateCompanyName}>{corporateName}</Text>
        
        {/* Budget Progress */}
        <View style={styles.budgetSection}>
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetLabel}>Monthly Budget: INR {monthlyBudget}</Text>
            <Text style={styles.budgetSpent}>Spent: INR {totalSpent}</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(spentPercent, 100)}%`,
                  backgroundColor: spentPercent > 80 ? COLORS.warning : COLORS.success
                }
              ]}
            />
          </View>
          <Text style={styles.remainingBudget}>
            Remaining: INR {remainingBudget.toFixed(2)}
          </Text>
        </View>

        {/* Cost Allocation */}
        <View style={styles.allocationSection}>
          <Text style={styles.allocationTitle}>Cost Allocation</Text>
          <View style={styles.allocationInputs}>
            <TextInput
              style={[styles.input, styles.compactInput]}
              placeholder="Department"
              value={departmentCode}
              onChangeText={setDepartmentCode}
            />
            <TextInput
              style={[styles.input, styles.compactInput]}
              placeholder="Project Code"
              value={projectCode}
              onChangeText={setProjectCode}
            />
          </View>
        </View>

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <View style={styles.approvalsSection}>
            <Text style={styles.approvalsTitle}>Pending Approvals: {pendingApprovals.length}</Text>
            {pendingApprovals.map(approval => (
              <View key={approval.id} style={styles.approvalCard}>
                <Text style={styles.approvalText}>{approval.reason}</Text>
                <Text style={styles.approvalAmount}>INR {approval.amount}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.button}>
        <MaterialIcons name="receipt" size={20} color={COLORS.light} />
        <Text style={styles.buttonText}>View Monthly Report</Text>
      </TouchableOpacity>
    </View>
  );
};


/**
 * FEATURE 3: MULTI-STOP BOOKING COMPONENT
 */
export const MultiStopBookingPanel = ({ token, onMultiStopCreated }) => {
  const [stops, setStops] = useState([
    { name: '', lat: 0, lon: 0, address: '' }
  ]);
  const [optimizeRoute, setOptimizeRoute] = useState(true);
  const [totalFare, setTotalFare] = useState('0');
  const [loading, setLoading] = useState(false);
  const [routeOptimizationDetails, setRouteOptimizationDetails] = useState(null);

  const handleAddStop = () => {
    if (stops.length < 10) {
      setStops([...stops, { name: '', lat: 0, lon: 0, address: '' }]);
    }
  };

  const handleRemoveStop = (index) => {
    if (stops.length > 2) {
      setStops(stops.filter((_, i) => i !== index));
    }
  };

  const handleCreateMultiStopBooking = async () => {
    if (stops.length < 2 || stops.length > 10) {
      alert('Please add between 2 and 10 stops');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/enterprise/multi-stop/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          stops: stops.map(s => ({
            name: s.name,
            lat: parseFloat(s.lat) || 0,
            lon: parseFloat(s.lon) || 0,
            address: s.address
          })),
          optimize_route: optimizeRoute
        })
      });

      const data = await response.json();
      setTotalFare(data.total_fare);
      setRouteOptimizationDetails(data);
      alert(`Multi-stop booking created! Total fare: INR ${data.total_fare}`);
      onMultiStopCreated?.(data);
    } catch (error) {
      alert('Error creating booking: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>🗺️ Multi-Stop Route</Text>

      {/* Stops List */}
      {stops.map((stop, index) => (
        <View key={index} style={styles.stopCard}>
          <Text style={styles.stopNumber}>Stop {index + 1}</Text>
          <TextInput
            style={styles.input}
            placeholder="Location Name"
            value={stop.name}
            onChangeText={(text) => {
              const newStops = [...stops];
              newStops[index].name = text;
              setStops(newStops);
            }}
          />
          <TextInput
            style={styles.input}
            placeholder="Latitude"
            value={stop.lat.toString()}
            onChangeText={(text) => {
              const newStops = [...stops];
              newStops[index].lat = parseFloat(text) || 0;
              setStops(newStops);
            }}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Longitude"
            value={stop.lon.toString()}
            onChangeText={(text) => {
              const newStops = [...stops];
              newStops[index].lon = parseFloat(text) || 0;
              setStops(newStops);
            }}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Address"
            value={stop.address}
            onChangeText={(text) => {
              const newStops = [...stops];
              newStops[index].address = text;
              setStops(newStops);
            }}
          />
          {stops.length > 2 && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveStop(index)}>
              <MaterialIcons name="close" size={20} color={COLORS.error} />
              <Text style={styles.removeButtonText}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Add Stop Button */}
      {stops.length < 10 && (
        <TouchableOpacity style={styles.addStopButton} onPress={handleAddStop}>
          <MaterialIcons name="add-circle" size={24} color={COLORS.primary} />
          <Text style={styles.addStopText}>Add Another Stop</Text>
        </TouchableOpacity>
      )}

      {/* Route Optimization */}
      <View style={styles.optionRow}>
        <TouchableOpacity
          style={[styles.checkBox, optimizeRoute && styles.checkBoxSelected]}
          onPress={() => setOptimizeRoute(!optimizeRoute)}>
          {optimizeRoute && <MaterialIcons name="check" size={16} color={COLORS.light} />}
        </TouchableOpacity>
        <Text style={styles.optionText}>Optimize Route for Shortest Path</Text>
      </View>

      {/* Optimization Details */}
      {routeOptimizationDetails && (
        <View style={styles.optimizationDetails}>
          <Text style={styles.detailsTitle}>Route Optimization Results</Text>
          <Text style={styles.detailsText}>
            Distance Saved: {routeOptimizationDetails.distance_saved || '0'} km
          </Text>
          <Text style={styles.detailsText}>
            Time Saved: {routeOptimizationDetails.time_saved || '0'} minutes
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleCreateMultiStopBooking}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color={COLORS.light} />
        ) : (
          <>
            <MaterialIcons name="route" size={20} color={COLORS.light} />
            <Text style={styles.buttonText}>Create Multi-Stop Booking - INR {totalFare}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};


/**
 * FEATURE 4: DRIVER HEATMAP COMPONENT
 */
export const LiveDriverHeatmapPanel = ({ token }) => {
  const [heatmapData, setHeatmapData] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHeatmapData = useCallback(async () => {
    setLoading(true);
    try {
      const [heatmapRes, hotspotsRes, recommendationsRes] = await Promise.all([
        fetch('/api/enterprise/heatmap/current', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/enterprise/hotspots/all'),
        fetch('/api/enterprise/positioning-recommendations', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const heatmap = await heatmapRes.json();
      const hotspotsList = await hotspotsRes.json();
      const recs = await recommendationsRes.json();

      setHeatmapData(heatmap.data_points || []);
      setHotspots(hotspotsList);
      setRecommendations(recs);
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timeout = setTimeout(fetchHeatmapData, 0);
    const interval = setInterval(fetchHeatmapData, 30000); // Update every 30 seconds
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchHeatmapData]);

  const getDemandColor = (demandLevel) => {
    switch (demandLevel) {
      case 'critical': return COLORS.error;
      case 'high': return COLORS.warning;
      case 'medium': return COLORS.secondary;
      default: return COLORS.success;
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>🗺️ Live Driver Heatmap</Text>

      {loading && <ActivityIndicator size="large" color={COLORS.primary} />}

      {/* Heatmap Data */}
      <View style={styles.heatmapContainer}>
        <Text style={styles.subTitle}>Current Driver Density</Text>
        {heatmapData.slice(0, 5).map((point, idx) => (
          <View
            key={idx}
            style={[
              styles.heatmapPoint,
              { borderLeftColor: getDemandColor(point.demand_level) }
            ]}>
            <View>
              <Text style={styles.heatmapLocation}>
                ({point.latitude.toFixed(3)}, {point.longitude.toFixed(3)})
              </Text>
              <Text style={styles.heatmapText}>Drivers: {point.drivers_count}</Text>
              <Text style={styles.heatmapText}>Demand: {point.demand_level.toUpperCase()}</Text>
              <Text style={styles.heatmapText}>Surge: {point.surge_multiplier}x</Text>
              <Text style={styles.heatmapText}>Avg Wait: {point.wait_time_seconds}s</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Hotspot Zones */}
      <View style={styles.hotspotsContainer}>
        <Text style={styles.subTitle}>High-Demand Hotspots</Text>
        {hotspots.slice(0, 5).map((hotspot, idx) => (
          <View key={idx} style={styles.hotspotCard}>
            <Text style={styles.hotspotName}>{hotspot.zone_name}</Text>
            <Text style={styles.hotspotType}>{hotspot.zone_type}</Text>
            <Text style={styles.hotspotDemand}>Peak Demand: {hotspot.avg_peak_demand} rides/hour</Text>
            <Text style={styles.hotspotSurge}>Typical Surge: {hotspot.typical_surge_multiplier}x</Text>
          </View>
        ))}
      </View>

      {/* Positioning Recommendations */}
      <View style={styles.recommendationsContainer}>
        <Text style={styles.subTitle}>Positioning Recommendations</Text>
        {recommendations.map((rec, idx) => (
          <View key={idx} style={styles.recommendationCard}>
            <Text style={styles.recReason}>{rec.reason}</Text>
            <Text style={styles.recZone}>{rec.zone_name || 'Unnamed Zone'}</Text>
            <Text style={styles.recText}>
              Expected Requests (next hour): {rec.estimated_requests_next_hour}
            </Text>
            <Text style={styles.recEarnings}>
              Earning Potential: INR {rec.earning_potential.toFixed(2)}
            </Text>
            {rec.instructions && (
              <Text style={styles.recInstructions}>{rec.instructions}</Text>
            )}
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, styles.refreshButton]}
        onPress={fetchHeatmapData}>
        <MaterialIcons name="refresh" size={20} color={COLORS.light} />
        <Text style={styles.buttonText}>Refresh Data</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};


/**
 * STYLES
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 16,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.light,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    backgroundColor: '#f9f9f9',
  },
  compactInput: {
    flex: 1,
    marginRight: 8,
    marginBottom: 0,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.light,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: COLORS.light,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownText: {
    marginLeft: 8,
    fontSize: 14,
    color: COLORS.dark,
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: COLORS.light,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    marginBottom: 12,
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.light,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  subItem: {
    marginLeft: 16,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 6,
  },
  selectedSubItem: {
    backgroundColor: COLORS.primary,
  },
  subItemText: {
    fontSize: 12,
    color: COLORS.mutedDark,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBoxSelected: {
    backgroundColor: COLORS.primary,
  },
  optionText: {
    fontSize: 14,
    color: COLORS.dark,
  },
  corporateCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  corporateCompanyName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 12,
  },
  budgetSection: {
    marginBottom: 16,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  budgetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.mutedDark,
  },
  budgetSpent: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.warning,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
  },
  remainingBudget: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '600',
  },
  allocationSection: {
    marginBottom: 16,
  },
  allocationTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: COLORS.dark,
  },
  allocationInputs: {
    flexDirection: 'row',
  },
  approvalsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  approvalsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: COLORS.warning,
  },
  approvalCard: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  approvalText: {
    fontSize: 12,
    color: COLORS.dark,
  },
  approvalAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  stopCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  stopNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 8,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  removeButtonText: {
    fontSize: 12,
    color: COLORS.error,
    fontWeight: '600',
    marginLeft: 4,
  },
  addStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  addStopText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 8,
  },
  optimizationDetails: {
    backgroundColor: COLORS.success,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  detailsText: {
    fontSize: 12,
    color: '#fff',
    marginBottom: 4,
  },
  refreshButton: {
    marginTop: 16,
  },
  heatmapContainer: {
    marginBottom: 20,
  },
  heatmapPoint: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  heatmapLocation: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginBottom: 4,
  },
  heatmapText: {
    fontSize: 12,
    color: COLORS.dark,
    marginBottom: 2,
  },
  hotspotsContainer: {
    marginBottom: 20,
  },
  hotspotCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  hotspotName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  hotspotType: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginBottom: 8,
  },
  hotspotDemand: {
    fontSize: 12,
    color: COLORS.dark,
    marginBottom: 4,
  },
  hotspotSurge: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.warning,
  },
  recommendationsContainer: {
    marginBottom: 20,
  },
  recommendationCard: {
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  recReason: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  recZone: {
    fontSize: 12,
    color: '#fff',
    marginBottom: 6,
  },
  recText: {
    fontSize: 11,
    color: '#fff',
    marginBottom: 2,
  },
  recEarnings: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  recInstructions: {
    fontSize: 11,
    color: '#fff',
    fontStyle: 'italic',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
});

export default {
  AirportBookingPanel,
  CorporateRidePanel,
  MultiStopBookingPanel,
  LiveDriverHeatmapPanel
};
