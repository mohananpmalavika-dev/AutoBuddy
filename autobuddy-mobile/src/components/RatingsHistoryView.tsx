import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  useRatingsHistory,
  useDriverProfile,
  usePassengerProfile,
} from '../hooks/useSocialFeatures';

interface RatingsHistoryViewProps {
  token: string | null;
  userId?: string;
  userType?: 'driver' | 'passenger';
}

export const RatingsHistoryView: React.FC<RatingsHistoryViewProps> = ({
  token,
  userId,
  userType,
}) => {
  const { ratings, stats, loading, refetch } = useRatingsHistory(token, userId);
  const [filterType, setFilterType] = useState<'all' | 'given' | 'received'>('all');
  const [ratingFilter, setRatingFilter] = useState<number>(0); // 0 means show all
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filteredRatings = useMemo(() => {
    let filtered = ratings;

    if (filterType !== 'all') {
      filtered = filtered.filter((r) => r.type === filterType);
    }

    if (ratingFilter > 0) {
      filtered = filtered.filter((r) => r.rating >= ratingFilter);
    }

    return filtered;
  }, [ratings, filterType, ratingFilter]);

  const ratingPercentages = useMemo(() => {
    if (stats.totalRatings === 0) {return {};}
    return {
      5: Math.round((stats.ratingDistribution[5] / stats.totalRatings) * 100),
      4: Math.round((stats.ratingDistribution[4] / stats.totalRatings) * 100),
      3: Math.round((stats.ratingDistribution[3] / stats.totalRatings) * 100),
      2: Math.round((stats.ratingDistribution[2] / stats.totalRatings) * 100),
      1: Math.round((stats.ratingDistribution[1] / stats.totalRatings) * 100),
    };
  }, [stats]);

  if (loading && ratings.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <FlatList
      scrollEnabled={true}
      ListHeaderComponent={
        <>
          {/* Stats Header */}
          <View style={styles.statsCard}>
            <View style={styles.mainRating}>
              <Text style={styles.mainRatingValue}>
                {stats.averageRating.toFixed(1)}
              </Text>
              <View style={styles.starsContainer}>
                {[...Array(5)].map((_, i) => (
                  <MaterialIcons
                    key={i}
                    name={i < Math.round(stats.averageRating) ? 'star' : 'star-outline'}
                    size={16}
                    color="#FFB800"
                  />
                ))}
              </View>
              <Text style={styles.totalRatings}>
                {stats.totalRatings} ratings
              </Text>
            </View>

            {/* Rating Distribution */}
            <View style={styles.distribution}>
              {[5, 4, 3, 2, 1].map((rating) => (
                <View key={rating} style={styles.ratingRow}>
                  <Text style={styles.ratingLabel}>{rating}★</Text>
                  <View style={styles.barContainer}>
                    <View
                      style={[
                        styles.bar,
                        {
                          width: `${ratingPercentages[rating as keyof typeof ratingPercentages] || 0}%`,
                          backgroundColor: getRatingColor(rating),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.percentage}>
                    {ratingPercentages[rating as keyof typeof ratingPercentages] || 0}%
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Filter Section */}
          <View style={styles.filterSection}>
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Show</Text>
              <View style={styles.filterButtons}>
                {(['all', 'given', 'received'] as const).map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.filterButton,
                      filterType === type && styles.filterButtonActive,
                    ]}
                    onPress={() => setFilterType(type)}
                  >
                    <Text
                      style={[
                        styles.filterButtonText,
                        filterType === type && styles.filterButtonTextActive,
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Minimum Rating</Text>
              <View style={styles.ratingFilter}>
                {[0, 1, 2, 3, 4].map((rating) => (
                  <Pressable
                    key={rating}
                    style={[
                      styles.ratingFilterButton,
                      ratingFilter === rating && styles.ratingFilterButtonActive,
                    ]}
                    onPress={() => setRatingFilter(rating)}
                  >
                    <Text
                      style={[
                        styles.ratingFilterButtonText,
                        ratingFilter === rating && styles.ratingFilterButtonTextActive,
                      ]}
                    >
                      {rating === 0 ? 'All' : `${rating}+`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Results Count */}
          {filteredRatings.length > 0 && (
            <View style={styles.countSection}>
              <Text style={styles.countText}>
                Showing {filteredRatings.length} of {stats.totalRatings} ratings
              </Text>
            </View>
          )}
        </>
      }
      data={filteredRatings}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <RatingCard rating={item} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <MaterialIcons name="star-outline" size={48} color="#ddd" />
          <Text style={styles.emptyText}>No ratings yet</Text>
        </View>
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={styles.listContent}
    />
  );
};

interface RatingCardProps {
  rating: any;
}

const RatingCard: React.FC<RatingCardProps> = ({ rating }) => {
  return (
    <View style={styles.ratingCard}>
      <View style={styles.cardHeader}>
        <View style={styles.raterInfo}>
          {rating.raterPhoto && (
            <View
              style={[
                styles.avatar,
                { backgroundColor: getAvatarColor(rating.raterName) },
              ]}
            >
              <Text style={styles.avatarText}>
                {rating.raterName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.raterDetails}>
            <Text style={styles.raterName}>{rating.raterName}</Text>
            <Text style={styles.raterRole}>
              {rating.type === 'received' ? 'Passenger' : 'Driver'}
            </Text>
          </View>
        </View>

        <View style={styles.ratingBadge}>
          <Text style={styles.ratingBadgeValue}>{rating.rating}</Text>
          <MaterialIcons name="star" size={14} color="#FFB800" />
        </View>
      </View>

      {/* Review Text */}
      {rating.comment && (
        <Text style={styles.comment} numberOfLines={3}>
          {rating.comment}
        </Text>
      )}

      {/* Metadata */}
      <View style={styles.metadata}>
        {rating.rideType && (
          <View style={styles.metadataItem}>
            <MaterialIcons name="directions-car" size={14} color="#666" />
            <Text style={styles.metadataText}>{rating.rideType}</Text>
          </View>
        )}
        <View style={styles.metadataItem}>
          <MaterialIcons name="access-time" size={14} color="#666" />
          <Text style={styles.metadataText}>
            {new Date(rating.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      {/* Rating Breakdown (if available) */}
      {rating.categoryRatings && (
        <View style={styles.categoryRatings}>
          {Object.entries(rating.categoryRatings).map(
            ([category, score]: [string, any]) => (
              <View key={category} style={styles.categoryItem}>
                <Text style={styles.categoryLabel}>
                  {category.replace(/_/g, ' ')}
                </Text>
                <View style={styles.categoryStars}>
                  {[...Array(5)].map((_, i) => (
                    <MaterialIcons
                      key={i}
                      name={i < score ? 'star' : 'star-outline'}
                      size={12}
                      color="#FFB800"
                    />
                  ))}
                </View>
              </View>
            )
          )}
        </View>
      )}
    </View>
  );
};

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

const getAvatarColor = (name: string): string => {
  const colors = ['#2196F3', '#4CAF50', '#FF9800', '#F44336', '#9C27B0', '#00BCD4'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingVertical: 8,
  },
  statsCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  mainRating: {
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  mainRatingValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#000',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
    marginVertical: 4,
  },
  totalRatings: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  distribution: {
    gap: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
    width: 20,
  },
  barContainer: {
    flex: 1,
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 3,
  },
  percentage: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    width: 30,
    textAlign: 'right',
  },
  filterSection: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    gap: 12,
  },
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#2196F3',
  },
  filterButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  ratingFilter: {
    flexDirection: 'row',
    gap: 6,
  },
  ratingFilterButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  ratingFilterButtonActive: {
    backgroundColor: '#FFB800',
    borderColor: '#FFB800',
  },
  ratingFilterButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  ratingFilterButtonTextActive: {
    color: '#fff',
  },
  countSection: {
    marginHorizontal: 16,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countText: {
    fontSize: 11,
    color: '#999',
  },
  ratingCard: {
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  raterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  raterDetails: {
    flex: 1,
  },
  raterName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  raterRole: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFB80020',
    borderRadius: 4,
  },
  ratingBadgeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFB800',
  },
  comment: {
    fontSize: 12,
    color: '#333',
    lineHeight: 16,
    marginBottom: 8,
  },
  metadata: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataText: {
    fontSize: 10,
    color: '#666',
  },
  categoryRatings: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 6,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryLabel: {
    fontSize: 10,
    color: '#666',
  },
  categoryStars: {
    flexDirection: 'row',
    gap: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});

export default RatingsHistoryView;
