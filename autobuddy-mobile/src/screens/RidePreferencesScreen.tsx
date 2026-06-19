import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Switch,
  Modal,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRidePreferences, RidePreferences } from '../hooks/useRidePreferences';

interface RidePreferencesScreenProps {
  token: string | null;
  driverId: string;
}

export const RidePreferencesScreen: React.FC<RidePreferencesScreenProps> = ({
  token,
  driverId,
}) => {
  const {
    preferences,
    loading,
    fetchPreferences,
    updateRideTypes,
    updatePassengerFilters,
    updateStopPreferences,
    updateRideLength,
    updateMusicAndEnvironment,
    updateCommunicationLevel,
    toggleAutoAccept,
    resetToDefaults,
  } = useRidePreferences(token, driverId);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'types' | 'passenger' | 'stops' | 'length' | 'environment' | 'areas'
  >('types');
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [areaType, setAreaType] = useState<'preferred' | 'avoid'>('preferred');
  const [newArea, setNewArea] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchPreferences();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleResetToDefaults = () => {
    Alert.alert('Reset Preferences', 'Are you sure you want to reset all preferences to defaults?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          const success = await resetToDefaults();
          if (success) {
            Alert.alert('Success', 'Preferences reset to defaults');
            await loadData();
          }
        },
      },
    ]);
  };

  if (loading && !preferences) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!preferences) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error" size={48} color="#F44336" />
        <Text style={styles.errorText}>Failed to load preferences</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Tab Navigation */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabContainer}
      >
        <TabButton
          label="Ride Types"
          active={activeTab === 'types'}
          onPress={() => setActiveTab('types')}
        />
        <TabButton
          label="Passenger"
          active={activeTab === 'passenger'}
          onPress={() => setActiveTab('passenger')}
        />
        <TabButton
          label="Stops"
          active={activeTab === 'stops'}
          onPress={() => setActiveTab('stops')}
        />
        <TabButton
          label="Length"
          active={activeTab === 'length'}
          onPress={() => setActiveTab('length')}
        />
        <TabButton
          label="Environment"
          active={activeTab === 'environment'}
          onPress={() => setActiveTab('environment')}
        />
        <TabButton
          label="Areas"
          active={activeTab === 'areas'}
          onPress={() => setActiveTab('areas')}
        />
      </ScrollView>

      {/* Ride Types Tab */}
      {activeTab === 'types' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ride Types</Text>
          <Text style={styles.sectionSubtitle}>
            Select which ride types you want to accept
          </Text>

          <PreferenceToggle
            icon="directions-car"
            label="Regular Rides"
            value={preferences.rideTypes.rides}
            onChange={async (value) => {
              await updateRideTypes({
                ...preferences.rideTypes,
                rides: value,
              });
              await fetchPreferences();
            }}
          />

          <PreferenceToggle
            icon="people"
            label="Ride Pools"
            value={preferences.rideTypes.pools}
            onChange={async (value) => {
              await updateRideTypes({
                ...preferences.rideTypes,
                pools: value,
              });
              await fetchPreferences();
            }}
          />

          <PreferenceToggle
            icon="directions-run"
            label="Long Rides"
            value={preferences.rideTypes.longRides}
            onChange={async (value) => {
              await updateRideTypes({
                ...preferences.rideTypes,
                longRides: value,
              });
              await fetchPreferences();
            }}
          />

          <PreferenceToggle
            icon="schedule"
            label="Scheduled Rides"
            value={preferences.rideTypes.scheduledRides}
            onChange={async (value) => {
              await updateRideTypes({
                ...preferences.rideTypes,
                scheduledRides: value,
              });
              await fetchPreferences();
            }}
          />
        </View>
      )}

      {/* Passenger Filters Tab */}
      {activeTab === 'passenger' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Passenger Preferences</Text>

          <PreferenceCard
            icon="star"
            label="Minimum Passenger Rating"
            value={`${preferences.passengerFilters.minRating.toFixed(1)} ⭐`}
          />

          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>Adjust Rating</Text>
            <View style={styles.ratingDisplay}>
              {[3.0, 3.5, 4.0, 4.5, 5.0].map((rating) => (
                <Pressable
                  key={rating}
                  style={[
                    styles.ratingButton,
                    preferences.passengerFilters.minRating === rating &&
                      styles.ratingButtonActive,
                  ]}
                  onPress={async () => {
                    await updatePassengerFilters({
                      ...preferences.passengerFilters,
                      minRating: rating,
                    });
                    await fetchPreferences();
                  }}
                >
                  <Text
                    style={[
                      styles.ratingButtonText,
                      preferences.passengerFilters.minRating === rating &&
                        styles.ratingButtonTextActive,
                    ]}
                  >
                    {rating}⭐
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <PreferenceCard
            icon="cancel"
            label="Max Cancelled Rides"
            value={`${preferences.passengerFilters.maxRidesCancelled}`}
          />

          <PreferenceToggle
            icon="person-add"
            label="Accept New Passengers"
            value={preferences.passengerFilters.acceptNewPassengers}
            onChange={async (value) => {
              await updatePassengerFilters({
                ...preferences.passengerFilters,
                acceptNewPassengers: value,
              });
              await fetchPreferences();
            }}
          />

          <PreferenceToggle
            icon="wc"
            label="Female Passengers Only"
            value={preferences.passengerFilters.acceptFemalePassengersOnly}
            onChange={async (value) => {
              await updatePassengerFilters({
                ...preferences.passengerFilters,
                acceptFemalePassengersOnly: value,
              });
              await fetchPreferences();
            }}
          />
        </View>
      )}

      {/* Stops Tab */}
      {activeTab === 'stops' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stop Preferences</Text>

          <PreferenceToggle
            icon="location-on"
            label="Allow Stops"
            value={preferences.stopPreferences.allowStops}
            onChange={async (value) => {
              await updateStopPreferences({
                ...preferences.stopPreferences,
                allowStops: value,
              });
              await fetchPreferences();
            }}
          />

          {preferences.stopPreferences.allowStops && (
            <>
              <PreferenceCard
                icon="list"
                label="Maximum Stops"
                value={`${preferences.stopPreferences.maxStops}`}
              />

              <View style={styles.sliderContainer}>
                <Text style={styles.sliderLabel}>Set Max Stops</Text>
                <View style={styles.stopsDisplay}>
                  {[1, 2, 3, 4, 5].map((stops) => (
                    <Pressable
                      key={stops}
                      style={[
                        styles.stopsButton,
                        preferences.stopPreferences.maxStops === stops &&
                          styles.stopsButtonActive,
                      ]}
                      onPress={async () => {
                        await updateStopPreferences({
                          ...preferences.stopPreferences,
                          maxStops: stops,
                        });
                        await fetchPreferences();
                      }}
                    >
                      <Text
                        style={[
                          styles.stopsButtonText,
                          preferences.stopPreferences.maxStops === stops &&
                            styles.stopsButtonTextActive,
                        ]}
                      >
                        {stops}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <PreferenceCard
                icon="trending-down"
                label="Stop Penalty Preference"
                value={preferences.stopPreferences.stopPenaltyPreference}
              />

              <View style={styles.optionsContainer}>
                {(['none', 'low', 'medium', 'high'] as const).map((penalty) => (
                  <Pressable
                    key={penalty}
                    style={[
                      styles.optionButton,
                      preferences.stopPreferences.stopPenaltyPreference === penalty &&
                        styles.optionButtonActive,
                    ]}
                    onPress={async () => {
                      await updateStopPreferences({
                        ...preferences.stopPreferences,
                        stopPenaltyPreference: penalty,
                      });
                      await fetchPreferences();
                    }}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        preferences.stopPreferences.stopPenaltyPreference === penalty &&
                          styles.optionButtonTextActive,
                      ]}
                    >
                      {penalty.charAt(0).toUpperCase() + penalty.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      {/* Ride Length Tab */}
      {activeTab === 'length' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ride Length Preferences</Text>

          <PreferenceCard
            icon="straighten"
            label="Minimum Distance"
            value={`${preferences.rideLength.minDistance} km`}
          />

          <PreferenceCard
            icon="straighten"
            label="Maximum Distance"
            value={`${preferences.rideLength.maxDistance} km`}
          />

          <Text style={styles.rangeNote}>
            {preferences.rideLength.minDistance} - {preferences.rideLength.maxDistance} km
          </Text>

          <PreferenceCard
            icon="schedule"
            label="Minimum Duration"
            value={`${preferences.rideLength.minDuration} min`}
          />

          <PreferenceCard
            icon="schedule"
            label="Maximum Duration"
            value={`${preferences.rideLength.maxDuration} min`}
          />

          <Text style={styles.rangeNote}>
            {preferences.rideLength.minDuration} - {preferences.rideLength.maxDuration} minutes
          </Text>
        </View>
      )}

      {/* Music & Environment Tab */}
      {activeTab === 'environment' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Music & Environment</Text>

          <PreferenceCard
            icon="music-note"
            label="Music Preference"
            value={preferences.musicAndEnvironment.musicPreference.replace(/_/g, ' ')}
          />

          <View style={styles.optionsContainer}>
            {(['no_music', 'passenger_choice', 'driver_choice'] as const).map((pref) => (
              <Pressable
                key={pref}
                style={[
                  styles.optionButton,
                  preferences.musicAndEnvironment.musicPreference === pref &&
                    styles.optionButtonActive,
                ]}
                onPress={async () => {
                  await updateMusicAndEnvironment({
                    ...preferences.musicAndEnvironment,
                    musicPreference: pref,
                  });
                  await fetchPreferences();
                }}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    preferences.musicAndEnvironment.musicPreference === pref &&
                      styles.optionButtonTextActive,
                  ]}
                >
                  {pref.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            ))}
          </View>

          <PreferenceCard
            icon="ac-unit"
            label="AC Temperature"
            value={`${preferences.musicAndEnvironment.acTemperature}°C`}
          />

          <PreferenceToggle
            icon="smoke-free"
            label="Allow Smoking Breaks"
            value={preferences.musicAndEnvironment.allowSmokingBreaks}
            onChange={async (value) => {
              await updateMusicAndEnvironment({
                ...preferences.musicAndEnvironment,
                allowSmokingBreaks: value,
              });
              await fetchPreferences();
            }}
          />

          <PreferenceToggle
            icon="pets"
            label="Allow Pets"
            value={preferences.musicAndEnvironment.allowPets}
            onChange={async (value) => {
              await updateMusicAndEnvironment({
                ...preferences.musicAndEnvironment,
                allowPets: value,
              });
              await fetchPreferences();
            }}
          />

          <PreferenceCard
            icon="chat-bubble"
            label="Communication Level"
            value={preferences.communicationLevel}
          />

          <View style={styles.optionsContainer}>
            {(['quiet', 'normal', 'chatty'] as const).map((level) => (
              <Pressable
                key={level}
                style={[
                  styles.optionButton,
                  preferences.communicationLevel === level && styles.optionButtonActive,
                ]}
                onPress={async () => {
                  await updateCommunicationLevel(level);
                  await fetchPreferences();
                }}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    preferences.communicationLevel === level &&
                      styles.optionButtonTextActive,
                  ]}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Areas Tab */}
      {activeTab === 'areas' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferred & Avoid Areas</Text>

          <PreferenceToggle
            icon="power-settings-new"
            label="Auto-Accept Rides"
            value={preferences.autoAcceptRides}
            onChange={async (value) => {
              await toggleAutoAccept(value);
              await fetchPreferences();
            }}
          />

          {preferences.acceptanceTimeout > 0 && (
            <PreferenceCard
              icon="schedule"
              label="Acceptance Timeout"
              value={`${preferences.acceptanceTimeout} seconds`}
            />
          )}

          <View style={styles.areasSection}>
            <Text style={styles.subsectionTitle}>Preferred Areas</Text>
            <View style={styles.areasList}>
              {preferences.preferredAreas.length === 0 ? (
                <Text style={styles.emptyAreasText}>No preferred areas added</Text>
              ) : (
                preferences.preferredAreas.map((area, index) => (
                  <View key={index} style={styles.areaBadge}>
                    <Text style={styles.areaText}>{area}</Text>
                    <MaterialIcons name="close" size={14} color="#fff" />
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={styles.areasSection}>
            <Text style={styles.subsectionTitle}>Avoid Areas</Text>
            <View style={styles.areasList}>
              {preferences.avoidAreas.length === 0 ? (
                <Text style={styles.emptyAreasText}>No avoid areas added</Text>
              ) : (
                preferences.avoidAreas.map((area, index) => (
                  <View key={index} style={[styles.areaBadge, styles.avoidBadge]}>
                    <Text style={styles.areaText}>{area}</Text>
                    <MaterialIcons name="close" size={14} color="#fff" />
                  </View>
                ))
              )}
            </View>
          </View>
        </View>
      )}

      {/* Reset Button */}
      <Pressable style={styles.resetButton} onPress={handleResetToDefaults}>
        <MaterialIcons name="refresh" size={20} color="#F44336" />
        <Text style={styles.resetButtonText}>Reset to Defaults</Text>
      </Pressable>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

const PreferenceToggle: React.FC<{
  icon: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}> = ({ icon, label, value, onChange }) => {
  return (
    <View style={styles.preferenceItem}>
      <View style={styles.preferenceLeft}>
        <MaterialIcons name={icon as any} size={20} color="#2196F3" />
        <Text style={styles.preferenceLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#e0e0e0', true: '#81C784' }}
        thumbColor={value ? '#4CAF50' : '#f0f0f0'}
      />
    </View>
  );
};

const PreferenceCard: React.FC<{
  icon: string;
  label: string;
  value: string;
}> = ({ icon, label, value }) => {
  return (
    <View style={styles.preferenceCard}>
      <View style={styles.preferenceLeft}>
        <MaterialIcons name={icon as any} size={20} color="#2196F3" />
        <Text style={styles.preferenceLabel}>{label}</Text>
      </View>
      <Text style={styles.preferenceValue}>{value}</Text>
    </View>
  );
};

const TabButton: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => {
  return (
    <Pressable
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
    marginTop: 12,
  },
  tabScroll: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tabContainer: {
    paddingHorizontal: 8,
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#2196F3',
  },
  tabButtonText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#2196F3',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  preferenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  preferenceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  preferenceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  preferenceValue: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  sliderContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  sliderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  ratingDisplay: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignItems: 'center',
  },
  ratingButtonActive: {
    backgroundColor: '#2196F3',
  },
  ratingButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  ratingButtonTextActive: {
    color: '#fff',
  },
  stopsDisplay: {
    flexDirection: 'row',
    gap: 8,
  },
  stopsButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignItems: 'center',
  },
  stopsButtonActive: {
    backgroundColor: '#2196F3',
  },
  stopsButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  stopsButtonTextActive: {
    color: '#fff',
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  optionButton: {
    flex: 1,
    minWidth: '30%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: '#2196F3',
  },
  optionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  optionButtonTextActive: {
    color: '#fff',
  },
  rangeNote: {
    fontSize: 11,
    color: '#999',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  areasSection: {
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  areasList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  areaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2196F3',
    borderRadius: 16,
  },
  avoidBadge: {
    backgroundColor: '#F44336',
  },
  areaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  emptyAreasText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F44336',
  },
});

export default RidePreferencesScreen;
