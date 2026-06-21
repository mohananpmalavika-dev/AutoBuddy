/**
 * Travel Intent Engine - Mobile Dashboard Screen
 * Unified interface for natural language travel search
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
  FlatList,
} from 'react-native';
import { useTravelIntent } from '../hooks/useTravelIntent';

const TravelIntentDashboard: React.FC<{ navigation: any }> = ({ navigation }) => {
  const travelIntent = useTravelIntent();
  const [showTrending, setShowTrending] = useState(true);

  useEffect(() => {
    // Load trending destinations on mount
    travelIntent.loadTrendingDestinations();
  }, []);

  const handleSelectSuggestion = (suggestion: any) => {
    travelIntent.selectSuggestion(suggestion);
    navigation.navigate('SuggestionDetail', { suggestion });
  };

  const handleQuickBook = (suggestion: any) => {
    Alert.alert(
      'Quick Book',
      `Book ${travelIntent.selectedVehicleType} for ₹${
        suggestion.pricing.find((p: any) => p.vehicleType === travelIntent.selectedVehicleType)
          ?.estimatedFare || 'TBD'
      }?`,
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Book Now',
          onPress: () =>
            travelIntent.quickBook(
              suggestion.id,
              travelIntent.selectedVehicleType,
              travelIntent.numPassengers
            ),
        },
      ]
    );
  };

  const renderSuggestion = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.suggestionCard}
      onPress={() => handleSelectSuggestion(item)}
    >
      <View style={styles.suggestionHeader}>
        <View style={styles.locationInfo}>
          <Text style={styles.locationName} numberOfLines={1}>
            {item.location.name}
          </Text>
          <Text style={styles.locationCategory}>{item.location.category}</Text>
        </View>
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>★ {item.location.rating}</Text>
        </View>
      </View>

      <Text style={styles.address} numberOfLines={2}>
        {item.location.address}
      </Text>

      <View style={styles.amenitiesContainer}>
        {item.location.amenities.slice(0, 3).map((amenity: string, idx: number) => (
          <View key={idx} style={styles.amenityTag}>
            <Text style={styles.amenityText}>{amenity}</Text>
          </View>
        ))}
      </View>

      <View style={styles.pricingContainer}>
        {item.pricing.map((price: any, idx: number) => (
          <TouchableOpacity
            key={idx}
            style={[
              styles.vehicleOption,
              travelIntent.selectedVehicleType === price.vehicleType &&
                styles.vehicleOptionSelected,
            ]}
            onPress={() => travelIntent.updateVehicleType(price.vehicleType)}
          >
            <Text style={styles.vehicleType}>{price.vehicleType.toUpperCase()}</Text>
            <Text style={styles.vehiclePrice}>₹{Math.round(price.estimatedFare)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.bookButton}
        onPress={() => handleQuickBook(item)}
      >
        <Text style={styles.bookButtonText}>Book Now</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderTrending = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.trendingCard}
      onPress={() => {
        travelIntent.handleSearchInput(item.name);
        setShowTrending(false);
      }}
    >
      <View style={styles.trendingBadge}>
        <Text style={styles.trendingLabel}>TRENDING</Text>
      </View>
      <Text style={styles.trendingName} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.trendingRating}>★ {item.rating}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Where are you heading?</Text>
          <Text style={styles.headerSubtitle}>
            Type what you'd like to do, we'll find the perfect place
          </Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchInputContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="e.g., Movie with friends, Dinner tonight..."
              placeholderTextColor="#999"
              value={travelIntent.searchQuery}
              onChangeText={travelIntent.handleSearchInput}
              editable={!travelIntent.isSearching}
            />
            {travelIntent.isSearching && <ActivityIndicator size="small" color="#FF6B6B" />}
          </View>

          {/* Passenger & Vehicle Selection */}
          <View style={styles.optionsContainer}>
            <View style={styles.optionGroup}>
              <Text style={styles.optionLabel}>Passengers</Text>
              <View style={styles.passengerControl}>
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={() => travelIntent.updateNumPassengers(travelIntent.numPassengers - 1)}
                >
                  <Text style={styles.controlButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.passengerCount}>{travelIntent.numPassengers}</Text>
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={() => travelIntent.updateNumPassengers(travelIntent.numPassengers + 1)}
                >
                  <Text style={styles.controlButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.optionGroup}>
              <Text style={styles.optionLabel}>Vehicle</Text>
              <View style={styles.vehicleTypeControl}>
                {['auto', 'cab', 'premium'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.vehicleTypeButton,
                      travelIntent.selectedVehicleType === type && styles.vehicleTypeButtonActive,
                    ]}
                    onPress={() => travelIntent.updateVehicleType(type)}
                  >
                    <Text
                      style={[
                        styles.vehicleTypeButtonText,
                        travelIntent.selectedVehicleType === type &&
                          styles.vehicleTypeButtonTextActive,
                      ]}
                    >
                      {type === 'auto' ? '🛺' : type === 'cab' ? '🚕' : '✨'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Error Message */}
        {travelIntent.searchError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{travelIntent.searchError}</Text>
          </View>
        )}

        {/* Booking Success */}
        {travelIntent.bookingSuccess && (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>✓ Ride booked successfully!</Text>
            <Text style={styles.successSubtext}>Ride ID: {travelIntent.bookingDetails?.ride_id}</Text>
          </View>
        )}

        {/* Suggestions */}
        {travelIntent.suggestions.length > 0 && (
          <View style={styles.suggestionsSection}>
            <Text style={styles.sectionTitle}>Top Suggestions</Text>
            <FlatList
              data={travelIntent.suggestions}
              renderItem={renderSuggestion}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* Trending (when no search) */}
        {showTrending && travelIntent.trendingDestinations.length > 0 && (
          <View style={styles.trendingSection}>
            <Text style={styles.sectionTitle}>Trending Now</Text>
            <FlatList
              data={travelIntent.trendingDestinations}
              renderItem={renderTrending}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.trendingGrid}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* Empty State */}
        {travelIntent.suggestions.length === 0 && !showTrending && !travelIntent.isSearching && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🔍</Text>
            <Text style={styles.emptyStateText}>No results found</Text>
            <Text style={styles.emptyStateSubtext}>Try a different query</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      {travelIntent.suggestions.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            travelIntent.clearSelection();
            setShowTrending(true);
          }}
        >
          <Text style={styles.fabText}>✕</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#FFF',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  searchSection: {
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1A1A1A',
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionGroup: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  passengerControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  controlButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  passengerCount: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  vehicleTypeControl: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  vehicleTypeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    alignItems: 'center',
  },
  vehicleTypeButtonActive: {
    backgroundColor: '#FF6B6B',
  },
  vehicleTypeButtonText: {
    fontSize: 16,
  },
  vehicleTypeButtonTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  errorContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFE0E0',
    borderRadius: 8,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    fontWeight: '500',
  },
  successContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  successText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '600',
  },
  successSubtext: {
    color: '#558B2F',
    fontSize: 12,
    marginTop: 4,
  },
  suggestionsSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  trendingSection: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  suggestionCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  locationCategory: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  ratingBadge: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F57C00',
  },
  address: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
    lineHeight: 16,
  },
  amenitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    gap: 6,
  },
  amenityTag: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  amenityText: {
    fontSize: 11,
    color: '#666',
  },
  pricingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  vehicleOption: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  vehicleOptionSelected: {
    backgroundColor: '#FFE8E8',
    borderColor: '#FF6B6B',
  },
  vehicleType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1A1A',
    textTransform: 'uppercase',
  },
  vehiclePrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B6B',
    marginTop: 2,
  },
  bookButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  bookButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  trendingCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    justifyContent: 'flex-end',
    minHeight: 140,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  trendingGrid: {
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  trendingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF6B6B',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  trendingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  trendingName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  trendingRating: {
    fontSize: 12,
    color: '#F57C00',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: {
    fontSize: 24,
    color: '#FFF',
  },
});

export default TravelIntentDashboard;
