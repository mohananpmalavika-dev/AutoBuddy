import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import apiClient from '../services/apiClient';

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  name?: string;
}

export interface RideType {
  id: string;
  name: string;
  icon: string;
  capacity: number;
  basePrice: number;
  perKmPrice: number;
}

export interface FareEstimate {
  minFare: number;
  maxFare: number;
  estimatedTime: number;
  distance: number;
  surgeMultiplier?: number;
}

interface SingleScreenBookingProps {
  savedLocations?: Location[];
  onBookRide: (rideData: {
    destination: string;
    rideType: string;
    fare?: number;
    scheduledFor?: Date;
  }) => void;
  onScheduleClick?: () => void;
  loading?: boolean;
}

const RIDE_TYPES: RideType[] = [
  {
    id: 'bike',
    name: 'BIKE',
    icon: 'two-wheeler',
    capacity: 1,
    basePrice: 30,
    perKmPrice: 8,
  },
  {
    id: 'economy',
    name: 'ECONOMY',
    icon: 'directions-car',
    capacity: 4,
    basePrice: 50,
    perKmPrice: 10,
  },
  {
    id: 'premium',
    name: 'PREMIUM',
    icon: 'directions-car',
    capacity: 4,
    basePrice: 80,
    perKmPrice: 15,
  },
  {
    id: 'xl',
    name: 'XL',
    icon: 'domain',
    capacity: 5,
    basePrice: 100,
    perKmPrice: 18,
  },
];

export function SingleScreenBooking({
  savedLocations = [],
  onBookRide,
  onScheduleClick,
  loading = false,
}: SingleScreenBookingProps) {
  const [destination, setDestination] = useState('');
  const [selectedRideType, setSelectedRideType] = useState<string>('economy');
  const [fareEstimate, setFareEstimate] = useState<FareEstimate | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isVoiceInput, setIsVoiceInput] = useState(false);
  const [suggestedLocations, setSuggestedLocations] = useState<Location[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showRideDetailsModal, setShowRideDetailsModal] = useState(false);
  const [selectedVehicleType, setSelectedVehicleType] = useState('economy');
  const [selectedVehicleModel, setSelectedVehicleModel] = useState('sedan');
  const [selectedRideCategory, setSelectedRideCategory] = useState('normal');
  const [selectedPassengers, setSelectedPassengers] = useState(1);
  const [isEstimatingFare, setIsEstimatingFare] = useState(false);
  const [selectedDestinationLocation, setSelectedDestinationLocation] = useState<Location | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<any | null>(null);
  const [showAIPreviewModal, setShowAIPreviewModal] = useState(false);

  // Get pickup location from saved locations (first one is usually current)
  const pickupLocation = savedLocations?.[0];

  // Sync modal state when ride type is selected or modal opens
  useEffect(() => {
    if (showRideDetailsModal && selectedRideType) {
      // Initialize modal selections based on the selected ride type
      setSelectedVehicleType(selectedRideType);
    }
  }, [showRideDetailsModal, selectedRideType]);

  // Call real fare estimation endpoint
  useEffect(() => {
    if (!selectedDestinationLocation || !pickupLocation) {
      setFareEstimate(null);
      return;
    }

    const estimateFareFromApi = async () => {
      try {
        setIsEstimatingFare(true);
        
        const response = await fetch(
          'https://autobuddy-z1vx.onrender.com/api/passengers/rides/estimate-fare',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              pickup_latitude: pickupLocation.latitude,
              pickup_longitude: pickupLocation.longitude,
              dropoff_latitude: selectedDestinationLocation.latitude,
              dropoff_longitude: selectedDestinationLocation.longitude,
              ride_type: selectedRideType,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Fare estimation failed: ${response.status}`);
        }

        const data = await response.json();
        
        setFareEstimate({
          minFare: Math.round(data.estimated_fare * 0.95),
          maxFare: Math.round(data.estimated_fare * 1.05),
          estimatedTime: data.estimated_time_minutes || 15,
          distance: data.distance || 0,
          surgeMultiplier: (data.surge_multiplier && data.surge_multiplier > 1) ? data.surge_multiplier : undefined,
        });
      } catch (error) {
        console.error('Fare estimation error:', error);
        // Show fallback estimate on error
        if (!pickupLocation || !selectedDestinationLocation) {
          setFareEstimate(null);
          return;
        }
        
        const distance = (selectedDestinationLocation.latitude && selectedDestinationLocation.longitude && pickupLocation.latitude && pickupLocation.longitude)
          ? estimateDistanceKm(pickupLocation.latitude, pickupLocation.longitude, 
                              selectedDestinationLocation.latitude, selectedDestinationLocation.longitude)
          : 5;
        
        const rideType = RIDE_TYPES.find(rt => rt.id === selectedRideType);
        if (rideType) {
          const baseFare = rideType.basePrice;
          const distanceFare = rideType.perKmPrice * distance;
          const minFare = baseFare + distanceFare;
          const maxFare = minFare * 1.2;

          setFareEstimate({
            minFare: Math.round(minFare),
            maxFare: Math.round(maxFare),
            estimatedTime: Math.round(distance * 2.5),
            distance: parseFloat(distance.toFixed(1)),
          });
        }
      } finally {
        setIsEstimatingFare(false);
      }
    };

    estimateFareFromApi();
  }, [selectedDestinationLocation, selectedRideType, pickupLocation]);

  // Helper function to estimate distance (fallback haversine)
  function estimateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Fetch location suggestions from backend API
  useEffect(() => {
    if (destination.length >= 3) {
      setIsLoadingSuggestions(true);
      
      const controller = new AbortController();
      
      // Call backend autocomplete endpoint
      fetch(`https://autobuddy-z1vx.onrender.com/api/places/autocomplete?input=${encodeURIComponent(destination)}&language=en`, {
        signal: controller.signal,
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Autocomplete API error: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (Array.isArray(data)) {
            const locations: Location[] = data.map(item => ({
              latitude: item.latitude || 0,
              longitude: item.longitude || 0,
              address: item.address || item.name || '',
              name: item.name || item.address || '',
            }));
            setSuggestedLocations(locations);
            setShowSuggestions(locations.length > 0);
          } else {
            setSuggestedLocations([]);
            setShowSuggestions(false);
          }
        })
        .catch(error => {
          if (error.name === 'AbortError') {
            return; // Request was cancelled, don't update state
          }
          console.error('Autocomplete error:', error);
          // Fallback to savedLocations if API fails
          const filtered = savedLocations.filter(loc =>
            loc.address.toLowerCase().includes(destination.toLowerCase())
          );
          setSuggestedLocations(filtered);
          setShowSuggestions(filtered.length > 0);
        })
        .finally(() => setIsLoadingSuggestions(false));
      
      return () => controller.abort();
    } else {
      setShowSuggestions(false);
      setSuggestedLocations([]);
    }
  }, [destination, savedLocations]);

  const handleSelectLocation = (location: Location) => {
    setDestination(location.address);
    setSelectedDestinationLocation(location);
    setShowSuggestions(false);
  };

  const handleVoiceInput = async () => {
    // In a real app, integrate voice recognition
    // For now, just show placeholder
    Alert.alert('Voice Input', 'Say your destination...');
    setIsVoiceInput(true);
  };

  const handleAIBook = async () => {
    if (!destination || destination.trim().length < 2) {
      Alert.alert('AI Booking', 'Please enter your request like "Take me to Kollam Railway Station"');
      return;
    }
    try {
      setIsAiLoading(true);
      const body = {
        query: destination,
        current_location: pickupLocation ? { lat: pickupLocation.latitude, lng: pickupLocation.longitude } : null,
        num_passengers: selectedPassengers,
        preferences: { vehicle_type: selectedRideType },
      };

      const res = await fetch('/api/intent/single-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {throw new Error('AI intent API failed');}
      const data = await res.json();
      const preview = data.preview || {};
      setAiPreview(preview);

      // Populate UI from preview
      const dest = preview.destination;
      if (dest && dest.latitude && dest.longitude) {
        setSelectedDestinationLocation({ latitude: dest.latitude, longitude: dest.longitude, address: dest.address || dest.name || '' });
        setDestination(dest.address || dest.name || '');
      }

      if (preview.vehicle_type) {setSelectedRideType(preview.vehicle_type);}

      if (preview.estimated_fare) {
        setFareEstimate({
          minFare: Math.round(preview.estimated_fare),
          maxFare: Math.round(preview.estimated_fare),
          estimatedTime: preview.estimated_arrival_minutes || 15,
          distance: preview.pricing_breakdown?.estimated_distance_km || 0,
        });
      }

      // Show preview modal
      setAiPreview(preview);
      setShowAIPreviewModal(true);
    } catch (err) {
      console.error('AI booking error', err);
      Alert.alert('AI Booking failed', 'Could not process the AI booking.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleClearInput = () => {
    setDestination('');
    setFareEstimate(null);
    setShowSuggestions(false);
    setSelectedDestinationLocation(null);
  };

  const handleAIPreviewConfirm = async () => {
    if (!aiPreview) {return;}
    try {
      // Send lightweight analytics event (non-blocking)
      try {
        await apiClient.post('/api/analytics/events', {
          event: 'ai_booking_confirm',
          data: {
            query: destination,
            suggested_destination: aiPreview.destination?.name || aiPreview.destination?.address || null,
            vehicle_type: aiPreview.vehicle_type || null,
            estimated_fare: aiPreview.estimated_fare || null,
          },
        });
      } catch (e) {
        // swallow analytics errors
        console.warn('Analytics event failed', e);
      }

      onBookRide({
        destination: aiPreview.destination?.address || destination,
        rideType: aiPreview.vehicle_type || selectedRideType,
        fare: aiPreview.estimated_fare || fareEstimate?.minFare || 0,
      });
    } finally {
      setShowAIPreviewModal(false);
      setIsAiLoading(false);
    }
  };

  const handleRideDetailsClose = () => {
    setShowRideDetailsModal(false);
  };

  const handleRideDetailsConfirm = () => {
    // Combine modal selections to create an updated ride type identifier
    // Map vehicle type to a ride type if needed
    const combinedRideType = selectedVehicleType || selectedRideType;
    
    // Update the main ride type selection with the modal choices
    // This will trigger the fareEstimate useEffect which depends on selectedRideType
    setSelectedRideType(combinedRideType);
    
    // Close modal with a small delay to allow React to process state updates
    // This ensures fare estimation calculation completes before modal closes
    setTimeout(() => {
      setShowRideDetailsModal(false);
    }, 100);
  };

  const handleBookRide = () => {
    if (!destination.trim()) {
      Alert.alert('Destination Required', 'Please enter your destination');
      return;
    }

    onBookRide({
      destination,
      rideType: selectedRideType,
      fare: fareEstimate?.minFare || 0,
    });
  };

  const handleScheduleRide = () => {
    if (!destination.trim()) {
      Alert.alert('Destination Required', 'Please enter your destination');
      return;
    }

    onScheduleClick?.();
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Search Box */}
      <View style={styles.searchBoxContainer}>
        <View style={styles.searchBox}>
          <Pressable onPress={handleVoiceInput} style={styles.voiceButton}>
            <MaterialIcons
              name="mic"
              size={24}
              color={isVoiceInput ? '#2196F3' : '#999'}
            />
          </Pressable>

          <Pressable onPress={handleAIBook} style={styles.aiButton} disabled={isAiLoading}>
            {isAiLoading ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <MaterialIcons name="auto-awesome" size={22} color="#2196F3" />
            )}
          </Pressable>

          <TextInput
            style={styles.searchInput}
            placeholder="Where to? (or say: Take me to Kollam Railway Station)"
            placeholderTextColor="#ccc"
            value={destination}
            onChangeText={setDestination}
            editable={!loading}
          />

          {destination ? (
            <Pressable onPress={handleClearInput} style={styles.clearButton}>
              <MaterialIcons name="close" size={24} color="#999" />
            </Pressable>
          ) : null}
        </View>

        {/* Quick shortcuts */}
        <View style={styles.shortcuts}>
          <QuickButton
            icon="home"
            label="Home"
            onPress={() => {
              if (savedLocations.length > 0) {
                const home = savedLocations.find(l => l.name === 'Home');
                if (home) {handleSelectLocation(home);}
              }
            }}
          />
          <QuickButton
            icon="work"
            label="Work"
            onPress={() => {
              if (savedLocations.length > 1) {
                const work = savedLocations.find(l => l.name === 'Work');
                if (work) {handleSelectLocation(work);}
              }
            }}
          />
          <QuickButton
            icon="schedule"
            label="Schedule"
            onPress={handleScheduleRide}
          />
        </View>
      </View>

      {/* Location suggestions */}
      {showSuggestions && (
        <View style={styles.suggestionsContainer}>
          {isLoadingSuggestions ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#2196F3" />
              <Text style={styles.loadingText}>Finding locations...</Text>
            </View>
          ) : suggestedLocations.length > 0 ? (
            <FlatList
              data={suggestedLocations}
              keyExtractor={(item, index) => `${item.address}-${index}`}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.suggestionItem}
                  onPress={() => handleSelectLocation(item)}
                >
                  <MaterialIcons name="location-on" size={20} color="#2196F3" />
                  <View style={styles.suggestionContent}>
                    <Text style={styles.suggestionTitle}>{item.address}</Text>
                    {item.name && item.name !== item.address && (
                      <Text style={styles.suggestionSubtitle}>{item.name}</Text>
                    )}
                  </View>
                </Pressable>
              )}
            />
          ) : null}
        </View>
      )}

      {/* Ride Type Selection */}
      {destination && (
        <View style={styles.rideTypesContainer}>
          <Text style={styles.sectionTitle}>Choose your ride</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.rideTypesScroll}
          >
            {RIDE_TYPES.map(rideType => (
              <Pressable
                key={rideType.id}
                style={[
                  styles.rideTypeCard,
                  selectedRideType === rideType.id && styles.rideTypeCardSelected,
                ]}
                onPress={() => {
                  setSelectedRideType(rideType.id);
                  setShowRideDetailsModal(true);
                }}
              >
                <MaterialIcons
                  name={rideType.icon as any}
                  size={32}
                  color={selectedRideType === rideType.id ? '#2196F3' : '#999'}
                />
                <Text
                  style={[
                    styles.rideTypeName,
                    selectedRideType === rideType.id && styles.rideTypeNameSelected,
                  ]}
                >
                  {rideType.name}
                </Text>
                <Text style={styles.rideTypeCapacity}>
                  {rideType.capacity} {rideType.capacity === 1 ? 'seat' : 'seats'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Fare Estimate */}
      {(fareEstimate || isEstimatingFare) && (
        <View style={styles.fareCard}>
          <View style={styles.fareHeader}>
            <Text style={styles.fareLabel}>Estimated Fare</Text>
            {isEstimatingFare && (
              <ActivityIndicator size="small" color="#2196F3" />
            )}
            {fareEstimate?.surgeMultiplier && (
              <View style={styles.surgeBadge}>
                <Text style={styles.surgeBadgeText}>
                  🔴 {fareEstimate.surgeMultiplier}x surge
                </Text>
              </View>
            )}
          </View>

          {isEstimatingFare ? (
            <View style={styles.estimatingContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
              <Text style={styles.estimatingText}>Calculating fare...</Text>
            </View>
          ) : fareEstimate ? (
            <>
              <Text style={styles.fareRange}>
                ₹ {fareEstimate.minFare} - {fareEstimate.maxFare}
              </Text>

              <View style={styles.fareDetails}>
                <FareDetailItem
                  icon="schedule"
                  label="Pickup time"
                  value={`${fareEstimate.estimatedTime} min`}
                />
                <FareDetailItem
                  icon="directions"
                  label="Distance"
                  value={`${fareEstimate.distance} km`}
                />
                <FareDetailItem
                  icon="info"
                  label="Surge pricing"
                  value={fareEstimate.surgeMultiplier ? `${fareEstimate.surgeMultiplier}x` : 'None'}
                />
              </View>
            </>
          ) : null}
        </View>
      )}

      {/* Book Button */}
      {destination && fareEstimate && (
        <View style={styles.actionButtons}>
          <Pressable
            style={[styles.button, styles.bookButton, loading && styles.buttonDisabled]}
            onPress={handleBookRide}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="check" size={20} color="#fff" />
                <Text style={styles.bookButtonText}>BOOK NOW</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={[styles.button, styles.scheduleButton]}
            onPress={handleScheduleRide}
            disabled={loading}
          >
            <MaterialIcons name="calendar-today" size={20} color="#2196F3" />
            <Text style={styles.scheduleButtonText}>SCHEDULE</Text>
          </Pressable>
        </View>
      )}

      {/* Info section */}
      <View style={styles.infoSection}>
        <InfoCard
          icon="shield"
          title="Safety First"
          description="Share your trip details with emergency contacts"
        />
        <InfoCard
          icon="percent"
          title="Save 10%"
          description="Schedule rides in advance to get discounts"
        />
      </View>

      {/* AI Preview Modal */}
      <Modal visible={showAIPreviewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 320 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI Booking Preview</Text>
              <Pressable onPress={() => setShowAIPreviewModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={{ padding: 12 }}>
              <Text style={{ fontWeight: '600', marginBottom: 8 }}>
                {aiPreview?.destination?.name || aiPreview?.destination?.address || destination}
              </Text>

              <Text>Vehicle: {String(aiPreview?.vehicle_type || 'auto')}</Text>
              <Text>Fare: ₹{aiPreview?.estimated_fare ?? '-'}</Text>
              <Text>ETA: {aiPreview?.estimated_arrival_minutes ?? '-'} min</Text>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
                <Pressable style={[styles.button, styles.scheduleButton]} onPress={() => setShowAIPreviewModal(false)}>
                  <Text style={styles.scheduleButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.bookButton]} onPress={handleAIPreviewConfirm}>
                  <Text style={styles.bookButtonText}>Confirm</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ride Details Modal */}
      {showRideDetailsModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ride Details</Text>
              <Pressable onPress={handleRideDetailsClose}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {/* Vehicle Type */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Vehicle type</Text>
                <View style={styles.vehicleTypeGrid}>
                  {['economy', 'premium', 'xl', 'traveller'].map(type => (
                    <Pressable
                      key={type}
                      style={[
                        styles.vehicleOption,
                        selectedVehicleType === type && styles.vehicleOptionSelected,
                      ]}
                      onPress={() => setSelectedVehicleType(type)}
                    >
                      <Text
                        style={[
                          styles.vehicleOptionText,
                          selectedVehicleType === type && styles.vehicleOptionTextSelected,
                        ]}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Vehicle Model */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Vehicle model</Text>
                <View style={styles.vehicleModelGrid}>
                  {['sedan', 'suv', 'wagon'].map(model => (
                    <Pressable
                      key={model}
                      style={[
                        styles.modelOption,
                        selectedVehicleModel === model && styles.modelOptionSelected,
                      ]}
                      onPress={() => setSelectedVehicleModel(model)}
                    >
                      <Text
                        style={[
                          styles.modelOptionText,
                          selectedVehicleModel === model && styles.modelOptionTextSelected,
                        ]}
                      >
                        {model.charAt(0).toUpperCase() + model.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Ride Type */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Ride type</Text>
                <View style={styles.rideTypeGrid}>
                  {['normal', 'pool', 'scheduled', 'corporate'].map(rideType => (
                    <Pressable
                      key={rideType}
                      style={[
                        styles.rideTypeOption,
                        selectedRideCategory === rideType && styles.rideTypeOptionSelected,
                      ]}
                      onPress={() => setSelectedRideCategory(rideType)}
                    >
                      <Text
                        style={[
                          styles.rideTypeOptionText,
                          selectedRideCategory === rideType && styles.rideTypeOptionTextSelected,
                        ]}
                      >
                        {rideType.charAt(0).toUpperCase() + rideType.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Passengers */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Passengers optional</Text>
                <View style={styles.passengersControl}>
                  <Pressable
                    style={styles.passengerButton}
                    onPress={() => selectedPassengers > 1 && setSelectedPassengers(selectedPassengers - 1)}
                  >
                    <MaterialIcons name="remove" size={20} color="#2196F3" />
                  </Pressable>
                  <Text style={styles.passengerCount}>{selectedPassengers}</Text>
                  <Pressable
                    style={styles.passengerButton}
                    onPress={() => selectedPassengers < 8 && setSelectedPassengers(selectedPassengers + 1)}
                  >
                    <MaterialIcons name="add" size={20} color="#2196F3" />
                  </Pressable>
                </View>
              </View>
            </ScrollView>

            {/* Done Button */}
            <Pressable style={styles.doneButton} onPress={handleRideDetailsConfirm}>
              <Text style={styles.doneButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

interface QuickButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
}

function QuickButton({ icon, label, onPress }: QuickButtonProps) {
  return (
    <Pressable style={styles.quickButton} onPress={onPress}>
      <MaterialIcons name={icon as any} size={20} color="#2196F3" />
      <Text style={styles.quickButtonLabel}>{label}</Text>
    </Pressable>
  );
}

interface FareDetailItemProps {
  icon: string;
  label: string;
  value: string;
}

function FareDetailItem({ icon, label, value }: FareDetailItemProps) {
  return (
    <View style={styles.fareDetailItem}>
      <MaterialIcons name={icon as any} size={16} color="#2196F3" />
      <View style={styles.fareDetailContent}>
        <Text style={styles.fareDetailLabel}>{label}</Text>
        <Text style={styles.fareDetailValue}>{value}</Text>
      </View>
    </View>
  );
}

interface InfoCardProps {
  icon: string;
  title: string;
  description: string;
}

function InfoCard({ icon, title, description }: InfoCardProps) {
  return (
    <View style={styles.infoCard}>
      <MaterialIcons name={icon as any} size={24} color="#2196F3" />
      <View style={styles.infoContent}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchBoxContainer: {
    padding: 16,
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  voiceButton: {
    padding: 8,
  },
  aiButton: {
    padding: 8,
    marginHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#000',
  },
  clearButton: {
    padding: 8,
  },
  shortcuts: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickButton: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickButtonLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontWeight: '500',
  },
  suggestionsContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  suggestionContent: {
    marginLeft: 12,
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  suggestionSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#666',
  },
  rideTypesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  rideTypesScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  rideTypeCard: {
    width: 90,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    marginRight: 8,
  },
  rideTypeCardSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  rideTypeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
  },
  rideTypeNameSelected: {
    color: '#2196F3',
  },
  rideTypeCapacity: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  fareCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  fareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fareLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  surgeBadge: {
    backgroundColor: '#ffebee',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  surgeBadgeText: {
    fontSize: 11,
    color: '#C62828',
    fontWeight: '600',
  },
  fareRange: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  fareDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  estimatingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  estimatingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
  fareDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fareDetailContent: {
    marginLeft: 6,
  },
  fareDetailLabel: {
    fontSize: 10,
    color: '#999',
  },
  fareDetailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  bookButton: {
    backgroundColor: '#4CAF50',
  },
  bookButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  scheduleButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  scheduleButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565C0',
  },
  infoDescription: {
    fontSize: 12,
    color: '#0D47A1',
    marginTop: 4,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '80%',
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  modalScrollView: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalSection: {
    marginBottom: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  vehicleTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vehicleOption: {
    flex: 1,
    minWidth: '45%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  vehicleOptionSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  vehicleOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  vehicleOptionTextSelected: {
    color: '#2196F3',
    fontWeight: '600',
  },
  vehicleModelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modelOption: {
    flex: 1,
    minWidth: '45%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  modelOptionSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  modelOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  modelOptionTextSelected: {
    color: '#2196F3',
    fontWeight: '600',
  },
  rideTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rideTypeOption: {
    flex: 1,
    minWidth: '45%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  rideTypeOptionSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  rideTypeOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  rideTypeOptionTextSelected: {
    color: '#2196F3',
    fontWeight: '600',
  },
  passengersControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  passengerButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  passengerCount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    minWidth: 40,
    textAlign: 'center',
  },
  doneButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
