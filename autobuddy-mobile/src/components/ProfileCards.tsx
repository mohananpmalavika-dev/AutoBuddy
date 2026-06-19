import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  useDriverProfile,
  usePassengerProfile,
  useFavorites,
} from '../hooks/useSocialFeatures';

interface DriverProfileCardProps {
  token: string | null;
  driverId: string;
  onChat?: () => void;
  onCallPress?: (phoneNumber: string) => void;
}

export const DriverProfileCard: React.FC<DriverProfileCardProps> = ({
  token,
  driverId,
  onChat,
  onCallPress,
}) => {
  const { profile, loading } = useDriverProfile(token, driverId);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(token);
  const [adding, setAdding] = useState(false);

  const handleToggleFavorite = async () => {
    if (!profile) return;

    setAdding(true);
    try {
      if (isFavorite(driverId)) {
        const fav = { id: driverId };
        await removeFavorite(fav.id);
      } else {
        await addFavorite(driverId, 'driver', profile.name, profile.photo, profile.rating);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update favorite');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorState}>
        <MaterialIcons name="error-outline" size={48} color="#F44336" />
        <Text style={styles.errorText}>Profile not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: getInitialColor(profile.name) },
          ]}
        >
          <Text style={styles.avatarText}>
            {profile.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.name}>{profile.name}</Text>
          <View style={styles.ratingContainer}>
            {[...Array(5)].map((_, i) => (
              <MaterialIcons
                key={i}
                name={i < Math.round(profile.rating) ? 'star' : 'star-outline'}
                size={16}
                color="#FFB800"
              />
            ))}
            <Text style={styles.ratingText}>{profile.rating}</Text>
          </View>
          <Text style={styles.rides}>{profile.totalRides} rides</Text>
        </View>

        <Pressable
          style={styles.favoriteButton}
          onPress={handleToggleFavorite}
          disabled={adding}
        >
          <MaterialIcons
            name={isFavorite(driverId) ? 'favorite' : 'favorite-border'}
            size={24}
            color={isFavorite(driverId) ? '#E91E63' : '#999'}
          />
        </Pressable>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatItem
          icon="trending-up"
          label="Acceptance"
          value={`${profile.acceptanceRate}%`}
          color="#4CAF50"
        />
        <StatItem
          icon="schedule"
          label="Avg Rating"
          value={profile.avgRating.toFixed(1)}
          color="#2196F3"
        />
        <StatItem
          icon="language"
          label="Languages"
          value={profile.languages?.length || '1'}
          color="#9C27B0"
        />
        <StatItem
          icon="verified"
          label="Member"
          value={profile.memberSince ? 'Since ' + new Date(profile.memberSince).getFullYear().toString() : 'Recent'}
          color="#FF9800"
        />
      </View>

      {/* Vehicle Info */}
      {profile.vehicle && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle</Text>
          <View style={styles.vehicleInfo}>
            <View
              style={[
                styles.vehicleIcon,
                { backgroundColor: profile.vehicle.color + '40' },
              ]}
            >
              <MaterialIcons name="directions-car" size={24} color={profile.vehicle.color} />
            </View>
            <View style={styles.vehicleDetails}>
              <Text style={styles.vehicleModel}>
                {profile.vehicle.make} {profile.vehicle.model}
              </Text>
              <Text style={styles.vehiclePlate}>{profile.vehicle.licensePlate}</Text>
              <View style={styles.vehicleFeatures}>
                {profile.vehicle.features?.map((feature: string, idx: number) => (
                  <View key={idx} style={styles.featureBadge}>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* About */}
      {profile.about && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>{profile.about}</Text>
        </View>
      )}

      {/* Experience & Languages */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <View style={styles.sectionCol}>
            <Text style={styles.sectionTitle}>Experience</Text>
            <Text style={styles.sectionValue}>{profile.yearsExperience} years</Text>
          </View>
          <View style={styles.sectionCol}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: profile.status === 'online' ? '#4CAF5040' : '#99999940' },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: profile.status === 'online' ? '#4CAF50' : '#999' },
                ]}
              />
              <Text style={styles.statusText}>
                {profile.status === 'online' ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Recent Ratings Summary */}
      {profile.recentRatingsSummary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Ratings</Text>
          <View style={styles.ratingsGrid}>
            {[5, 4, 3, 2, 1].map((rating) => (
              <View key={rating} style={styles.ratingItem}>
                <Text style={styles.ratingItemLabel}>{rating}★</Text>
                <View style={styles.ratingItemBar}>
                  <View
                    style={[
                      styles.ratingItemBarFill,
                      {
                        width: `${(profile.recentRatingsSummary[rating] || 0) * 20}%`,
                        backgroundColor: getRatingColor(rating),
                      },
                    ]}
                  />
                </View>
                <Text style={styles.ratingItemCount}>
                  {profile.recentRatingsSummary[rating] || 0}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        {onChat && (
          <Pressable style={styles.actionButton} onPress={onChat}>
            <MaterialIcons name="message" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Message</Text>
          </Pressable>
        )}

        {profile.phoneNumber && onCallPress && (
          <Pressable
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => onCallPress(profile.phoneNumber)}
          >
            <MaterialIcons name="call" size={18} color="#2196F3" />
            <Text style={styles.actionButtonSecondaryText}>Call</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
};

interface PassengerProfileCardProps {
  token: string | null;
  passengerId: string;
  onChat?: () => void;
}

export const PassengerProfileCard: React.FC<PassengerProfileCardProps> = ({
  token,
  passengerId,
  onChat,
}) => {
  const { profile, loading } = usePassengerProfile(token, passengerId);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites(token);
  const [adding, setAdding] = useState(false);

  const handleToggleFavorite = async () => {
    if (!profile) return;

    setAdding(true);
    try {
      if (isFavorite(passengerId)) {
        const fav = { id: passengerId };
        await removeFavorite(fav.id);
      } else {
        await addFavorite(passengerId, 'passenger', profile.name, profile.photo, profile.rating);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update favorite');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorState}>
        <MaterialIcons name="error-outline" size={48} color="#F44336" />
        <Text style={styles.errorText}>Profile not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: getInitialColor(profile.name) },
          ]}
        >
          <Text style={styles.avatarText}>
            {profile.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.name}>{profile.name}</Text>
          <View style={styles.ratingContainer}>
            {[...Array(5)].map((_, i) => (
              <MaterialIcons
                key={i}
                name={i < Math.round(profile.rating) ? 'star' : 'star-outline'}
                size={16}
                color="#FFB800"
              />
            ))}
            <Text style={styles.ratingText}>{profile.rating}</Text>
          </View>
          <Text style={styles.rides}>{profile.totalRides} rides</Text>
        </View>

        <Pressable
          style={styles.favoriteButton}
          onPress={handleToggleFavorite}
          disabled={adding}
        >
          <MaterialIcons
            name={isFavorite(passengerId) ? 'favorite' : 'favorite-border'}
            size={24}
            color={isFavorite(passengerId) ? '#E91E63' : '#999'}
          />
        </Pressable>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatItem
          icon="check-circle"
          label="Reliability"
          value={`${profile.cancellationRate}%`}
          color="#4CAF50"
        />
        <StatItem
          icon="schedule"
          label="Avg Rating"
          value={profile.avgRating.toFixed(1)}
          color="#2196F3"
        />
        <StatItem
          icon="verified-user"
          label="Verified"
          value={profile.isVerified ? 'Yes' : 'No'}
          color="#9C27B0"
        />
        <StatItem
          icon="calendar-today"
          label="Member"
          value={profile.memberSince ? new Date(profile.memberSince).getFullYear().toString() : 'Recent'}
          color="#FF9800"
        />
      </View>

      {/* About */}
      {profile.about && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>{profile.about}</Text>
        </View>
      )}

      {/* Preferences */}
      {profile.preferences && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.preferencesList}>
            {profile.preferences.music && (
              <PreferenceItem icon="music-note" label={`Music: ${profile.preferences.music}`} />
            )}
            {profile.preferences.temperature && (
              <PreferenceItem icon="ac-unit" label={`Temperature: ${profile.preferences.temperature}`} />
            )}
            {profile.preferences.conversationLevel && (
              <PreferenceItem icon="chat" label={`Chat: ${profile.preferences.conversationLevel}`} />
            )}
          </View>
        </View>
      )}

      {/* Recent Ratings Summary */}
      {profile.recentRatingsSummary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Ratings</Text>
          <View style={styles.ratingsGrid}>
            {[5, 4, 3, 2, 1].map((rating) => (
              <View key={rating} style={styles.ratingItem}>
                <Text style={styles.ratingItemLabel}>{rating}★</Text>
                <View style={styles.ratingItemBar}>
                  <View
                    style={[
                      styles.ratingItemBarFill,
                      {
                        width: `${(profile.recentRatingsSummary[rating] || 0) * 20}%`,
                        backgroundColor: getRatingColor(rating),
                      },
                    ]}
                  />
                </View>
                <Text style={styles.ratingItemCount}>
                  {profile.recentRatingsSummary[rating] || 0}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        {onChat && (
          <Pressable style={styles.actionButton} onPress={onChat}>
            <MaterialIcons name="message" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Message</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
};

interface StatItemProps {
  icon: string;
  label: string;
  value: string;
  color: string;
}

const StatItem: React.FC<StatItemProps> = ({ icon, label, value, color }) => (
  <View style={styles.statItem}>
    <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
      <MaterialIcons name={icon as any} size={20} color={color} />
    </View>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

interface PreferenceItemProps {
  icon: string;
  label: string;
}

const PreferenceItem: React.FC<PreferenceItemProps> = ({ icon, label }) => (
  <View style={styles.preferenceItem}>
    <MaterialIcons name={icon as any} size={16} color="#2196F3" />
    <Text style={styles.preferenceLabel}>{label}</Text>
  </View>
);

const getRatingColor = (rating: number): string => {
  switch (rating) {
    case 5:
      return '#4CAF50';
    case 4:
      return '#8BC34A';
    case 3:
      return '#FFB800';
    case 2:
      return '#FF9800';
    case 1:
      return '#F44336';
    default:
      return '#999';
  }
};

const getInitialColor = (name: string): string => {
  const colors = ['#2196F3', '#4CAF50', '#FF9800', '#F44336', '#9C27B0', '#00BCD4'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginLeft: 4,
  },
  rides: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  favoriteButton: {
    padding: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  section: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  sectionValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  sectionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionCol: {
    flex: 1,
  },
  aboutText: {
    fontSize: 12,
    color: '#333',
    lineHeight: 16,
  },
  vehicleInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleDetails: {
    flex: 1,
  },
  vehicleModel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  vehiclePlate: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  vehicleFeatures: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  featureBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
  },
  featureText: {
    fontSize: 9,
    color: '#666',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  ratingsGrid: {
    gap: 8,
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingItemLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000',
    width: 20,
  },
  ratingItemBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  ratingItemBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  ratingItemCount: {
    fontSize: 10,
    color: '#666',
    width: 20,
    textAlign: 'right',
  },
  preferencesList: {
    gap: 8,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  preferenceLabel: {
    fontSize: 12,
    color: '#333',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  actionButtonSecondary: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  actionButtonSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2196F3',
  },
});

export default {
  DriverProfileCard,
  PassengerProfileCard,
};
