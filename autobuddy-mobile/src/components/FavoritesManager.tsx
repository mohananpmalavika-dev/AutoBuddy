import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFavorites } from '../hooks/useSocialFeatures';

interface FavoritesManagerProps {
  token: string | null;
  onSelectFavorite?: (favoriteId: string) => void;
}

export const FavoritesManager: React.FC<FavoritesManagerProps> = ({
  token,
  onSelectFavorite,
}) => {
  const {
    favorites,
    loading,
    error,
    addFavorite,
    removeFavorite,
    getFavoritesByType,
    refetch,
  } = useFavorites(token);

  const [filterType, setFilterType] = useState<'all' | 'driver' | 'passenger'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filteredFavorites = useMemo(() => {
    let filtered = favorites;

    if (filterType !== 'all') {
      filtered = filtered.filter((f) => f.type === filterType);
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [favorites, filterType, searchQuery]);

  const stats = useMemo(
    () => ({
      total: favorites.length,
      drivers: getFavoritesByType('driver').length,
      passengers: getFavoritesByType('passenger').length,
    }),
    [favorites, getFavoritesByType]
  );

  const handleRemoveFavorite = (favorite: any) => {
    Alert.alert(
      'Remove Favorite',
      `Remove ${favorite.name} from favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFavorite(favorite.id);
              Alert.alert('Success', 'Favorite removed');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove favorite');
            }
          },
        },
      ]
    );
  };

  if (loading && favorites.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <StatCard label="Total" count={stats.total} color="#2196F3" />
        <StatCard label="Drivers" count={stats.drivers} color="#4CAF50" />
        <StatCard label="Passengers" count={stats.passengers} color="#FF9800" />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search favorites..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <MaterialIcons name="close" size={20} color="#999" />
          </Pressable>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['all', 'driver', 'passenger'] as const).map((type) => (
          <Pressable
            key={type}
            style={[
              styles.filterTab,
              filterType === type && styles.filterTabActive,
            ]}
            onPress={() => setFilterType(type)}
          >
            <Text
              style={[
                styles.filterTabLabel,
                filterType === type && styles.filterTabLabelActive,
              ]}
            >
              {type === 'all'
                ? `All (${stats.total})`
                : type === 'driver'
                ? `Drivers (${stats.drivers})`
                : `Passengers (${stats.passengers})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Favorites List */}
      <FlatList
        data={filteredFavorites}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FavoriteCard
            favorite={item}
            onPress={() => onSelectFavorite?.(item.favoriteId)}
            onRemove={() => handleRemoveFavorite(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="favorite-border" size={48} color="#ddd" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No favorites match your search' : 'No favorites yet'}
            </Text>
            {!searchQuery && (
              <Pressable
                style={styles.addButton}
                onPress={() => setShowAddModal(true)}
              >
                <MaterialIcons name="add" size={20} color="#fff" />
                <Text style={styles.addButtonText}>Add Favorite</Text>
              </Pressable>
            )}
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={
          filteredFavorites.length === 0 ? { flexGrow: 1 } : {}
        }
      />

      {/* Add Favorite Modal */}
      <AddFavoriteModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addFavorite}
        token={token}
      />

      {/* Error Alert */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={18} color="#F44336" />
          <Text style={styles.errorText}>{error.message}</Text>
          <Pressable onPress={refetch}>
            <MaterialIcons name="refresh" size={18} color="#F44336" />
          </Pressable>
        </View>
      )}
    </View>
  );
};

interface FavoriteCardProps {
  favorite: any;
  onPress?: () => void;
  onRemove?: () => void;
}

const FavoriteCard: React.FC<FavoriteCardProps> = ({
  favorite,
  onPress,
  onRemove,
}) => {
  return (
    <Pressable style={styles.favoriteCard} onPress={onPress}>
      <View style={styles.cardContent}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: getTypeColor(favorite.type) },
          ]}
        >
          <MaterialIcons
            name={favorite.type === 'driver' ? 'directions-car' : 'person'}
            size={24}
            color="#fff"
          />
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.favoriteName}>{favorite.name}</Text>
          <View style={styles.details}>
            <Text style={styles.detailLabel}>
              {favorite.type === 'driver' ? '🚗' : '👤'} {favorite.type}
            </Text>

            {favorite.rating && (
              <View style={styles.ratingBadge}>
                <MaterialIcons name="star" size={12} color="#FFB800" />
                <Text style={styles.ratingText}>{favorite.rating}</Text>
              </View>
            )}

            {favorite.totalRides !== undefined && (
              <Text style={styles.detailLabel}>{favorite.totalRides} rides</Text>
            )}
          </View>

          {favorite.createdAt && (
            <Text style={styles.addedDate}>
              Added {new Date(favorite.createdAt).toLocaleDateString()}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.cardActions}>
        <Pressable
          style={styles.removeButton}
          onPress={onRemove}
          hitSlop={8}
        >
          <MaterialIcons name="close" size={20} color="#F44336" />
        </Pressable>
      </View>
    </Pressable>
  );
};

interface AddFavoriteModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (favoriteId: string, type: 'driver' | 'passenger', name: string, photo?: string, rating?: number) => Promise<any>;
  token: string | null;
}

const AddFavoriteModal: React.FC<AddFavoriteModalProps> = ({
  visible,
  onClose,
  onAdd,
  token,
}) => {
  const [favoriteId, setFavoriteId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'driver' | 'passenger'>('driver');
  const [rating, setRating] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!favoriteId.trim() || !name.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await onAdd(
        favoriteId,
        type,
        name,
        undefined,
        rating ? parseFloat(rating) : undefined
      );
      Alert.alert('Success', 'Favorite added');
      setFavoriteId('');
      setName('');
      setRating('');
      setType('driver');
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to add favorite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Favorite</Text>
            <Pressable onPress={onClose}>
              <MaterialIcons name="close" size={24} color="#000" />
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            {/* Type Selection */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Type</Text>
              <View style={styles.typeSelector}>
                {(['driver', 'passenger'] as const).map((t) => (
                  <Pressable
                    key={t}
                    style={[
                      styles.typeButton,
                      type === t && styles.typeButtonActive,
                    ]}
                    onPress={() => setType(t)}
                  >
                    <MaterialIcons
                      name={t === 'driver' ? 'directions-car' : 'person'}
                      size={18}
                      color={type === t ? '#fff' : '#666'}
                    />
                    <Text
                      style={[
                        styles.typeButtonText,
                        type === t && styles.typeButtonTextActive,
                      ]}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ID Input */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>ID</Text>
              <TextInput
                style={styles.input}
                placeholder={`Enter ${type} ID`}
                value={favoriteId}
                onChangeText={setFavoriteId}
                placeholderTextColor="#999"
              />
            </View>

            {/* Name Input */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter name"
                value={name}
                onChangeText={setName}
                placeholderTextColor="#999"
              />
            </View>

            {/* Rating Input */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Rating (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 4.8"
                value={rating}
                onChangeText={setRating}
                keyboardType="decimal-pad"
                placeholderTextColor="#999"
              />
            </View>

            {/* Add Button */}
            <Pressable
              style={styles.submitButton}
              onPress={handleAdd}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="favorite" size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>Add to Favorites</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

interface StatCardProps {
  label: string;
  count: number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, count, color }) => (
  <View style={styles.statCard}>
    <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
      <Text style={{ fontSize: 16, color }}>💫</Text>
    </View>
    <Text style={styles.statCount}>{count}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const getTypeColor = (type: string): string => {
  return type === 'driver' ? '#4CAF50' : '#2196F3';
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
  statsBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  statCard: {
    flex: 1,
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
  statCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#000',
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#2196F3',
  },
  filterTabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  filterTabLabelActive: {
    color: '#fff',
  },
  favoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardInfo: {
    flex: 1,
  },
  favoriteName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  detailLabel: {
    fontSize: 10,
    color: '#666',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: '#FFB80020',
    borderRadius: 3,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFB800',
  },
  addedDate: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
  },
  cardActions: {
    padding: 8,
  },
  removeButton: {
    padding: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF3CD',
    borderRadius: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#856404',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  typeButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#000',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
    marginTop: 20,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

export default FavoritesManager;
