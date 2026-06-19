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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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

  // Mock fare estimation
  useEffect(() => {
    if (destination.length > 3) {
      // Simulate fare calculation
      const mockDistance = Math.random() * 15 + 2;
      const rideType = RIDE_TYPES.find(rt => rt.id === selectedRideType);
      if (rideType) {
        const baseFare = rideType.basePrice;
        const distanceFare = rideType.perKmPrice * mockDistance;
        const minFare = baseFare + distanceFare;
        const maxFare = minFare * 1.2;
        const hasSurge = Math.random() > 0.7;

        setFareEstimate({
          minFare: Math.round(minFare),
          maxFare: Math.round(maxFare),
          estimatedTime: Math.round(mockDistance * 2.5),
          distance: parseFloat(mockDistance.toFixed(1)),
          surgeMultiplier: hasSurge ? 1.5 : undefined,
        });
      }
    } else {
      setFareEstimate(null);
    }
  }, [destination, selectedRideType]);

  // Mock location suggestions
  useEffect(() => {
    if (destination.length > 0) {
      // Simulate location search
      const filtered = savedLocations.filter(loc =>
        loc.address.toLowerCase().includes(destination.toLowerCase())
      );
      setSuggestedLocations(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [destination, savedLocations]);

  const handleSelectLocation = (location: Location) => {
    setDestination(location.address);
    setShowSuggestions(false);
  };

  const handleVoiceInput = async () => {
    // In a real app, integrate voice recognition
    // For now, just show placeholder
    Alert.alert('Voice Input', 'Say your destination...');
    setIsVoiceInput(true);
  };

  const handleClearInput = () => {
    setDestination('');
    setFareEstimate(null);
    setShowSuggestions(false);
  };

  const handleBookRide = () => {
    if (!destination.trim()) {
      Alert.alert('Destination Required', 'Please enter your destination');
      return;
    }

    onBookRide({
      destination,
      rideType: selectedRideType,
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

          <TextInput
            style={styles.searchInput}
            placeholder="Where to?"
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
                if (home) handleSelectLocation(home);
              }
            }}
          />
          <QuickButton
            icon="work"
            label="Work"
            onPress={() => {
              if (savedLocations.length > 1) {
                const work = savedLocations.find(l => l.name === 'Work');
                if (work) handleSelectLocation(work);
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
      {showSuggestions && suggestedLocations.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={suggestedLocations}
            keyExtractor={item => `${item.latitude}-${item.longitude}`}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable
                style={styles.suggestionItem}
                onPress={() => handleSelectLocation(item)}
              >
                <MaterialIcons name="location-on" size={20} color="#2196F3" />
                <View style={styles.suggestionContent}>
                  <Text style={styles.suggestionTitle}>{item.address}</Text>
                  {item.name && (
                    <Text style={styles.suggestionSubtitle}>{item.name}</Text>
                  )}
                </View>
              </Pressable>
            )}
          />
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
                onPress={() => setSelectedRideType(rideType.id)}
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
      {fareEstimate && (
        <View style={styles.fareCard}>
          <View style={styles.fareHeader}>
            <Text style={styles.fareLabel}>Estimated Fare</Text>
            {fareEstimate.surgeMultiplier && (
              <View style={styles.surgeBadge}>
                <Text style={styles.surgeBadgeText}>
                  🔴 {fareEstimate.surgeMultiplier}x surge
                </Text>
              </View>
            )}
          </View>

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
});
