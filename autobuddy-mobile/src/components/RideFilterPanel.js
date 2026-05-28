import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Modal, TextInput, Alert } from 'react-native';
import { useRideFilters } from '../hooks/useRideFilters';
import { theme } from '../theme';

const RideFilterPanel = ({ token, driverId, isVisible, onClose }) => {
  const { filters, isLoading, error, saveFilters, loadFilters } = useRideFilters({ token, driverId });
  const [localFilters, setLocalFilters] = useState(null);
  const [editingDistance, setEditingDistance] = useState('');

  useEffect(() => {
    if (isVisible) {
      loadFilters();
    }
  }, [isVisible, loadFilters]);

  useEffect(() => {
    if (filters) {
      const timer = setTimeout(() => {
        setLocalFilters(filters);
        setEditingDistance(String(filters.maxPickupDistance || 15));
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [filters]);

  const handleSave = useCallback(async () => {
    const updatedFilters = {
      ...localFilters,
      maxPickupDistance: parseFloat(editingDistance),
    };
    
    const success = await saveFilters(updatedFilters);
    if (success) {
      Alert.alert('Success', 'Filters saved');
      onClose();
    } else {
      Alert.alert('Error', error || 'Failed to save filters');
    }
  }, [localFilters, editingDistance, saveFilters, onClose, error]);

  return (
    <Modal visible={isVisible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.headerButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ride Filters</Text>
          <TouchableOpacity onPress={handleSave} disabled={isLoading}>
            <Text style={[styles.headerButton, { color: theme.COLORS.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Auto-Decline Toggle */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Auto-Decline Settings</Text>
              <Switch
                value={localFilters?.autoDeclineEnabled ?? true}
                onValueChange={(val) => setLocalFilters(prev => ({ ...prev, autoDeclineEnabled: val }))}
                trackColor={{ false: theme.COLORS.grey3, true: theme.COLORS.primary }}
              />
            </View>
            <Text style={styles.sectionDescription}>
              Automatically decline rides that do not match your preferences
            </Text>
          </View>

          {/* Distance Filter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Max Pickup Distance</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Distance in km"
                value={editingDistance}
                onChangeText={setEditingDistance}
                keyboardType="decimal-pad"
              />
              <Text style={styles.unit}>km</Text>
            </View>
            <Text style={styles.hint}>Rides beyond this distance will be auto-declined</Text>
          </View>

          {/* Minimum Rating Filter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Minimum Passenger Rating</Text>
            <View style={styles.ratingOptions}>
              {[3.0, 3.5, 4.0, 4.5, 5.0].map((rating) => (
                <TouchableOpacity
                  key={rating}
                  style={[
                    styles.ratingButton,
                    (localFilters?.minPassengerRating === rating) && styles.ratingButtonActive
                  ]}
                  onPress={() => setLocalFilters(prev => ({ ...prev, minPassengerRating: rating }))}
                >
                  <Text style={[
                    styles.ratingButtonText,
                    (localFilters?.minPassengerRating === rating) && styles.ratingButtonTextActive
                  ]}>
                    ★ {rating.toFixed(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Blocked Areas */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Avoid Areas</Text>
            <View style={styles.areaList}>
              {(localFilters?.blockedAreas || []).map((area, idx) => (
                <View key={idx} style={styles.areaTag}>
                  <Text style={styles.areaTagText}>{area}</Text>
                  <TouchableOpacity onPress={() => {
                    setLocalFilters(prev => ({
                      ...prev,
                      blockedAreas: prev.blockedAreas.filter((_, i) => i !== idx)
                    }));
                  }}>
                    <Text style={styles.areaTagRemove}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <Text style={styles.hint}>Tap areas to remove them from blocked list</Text>
          </View>

          {/* Time Restrictions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Time Restrictions</Text>
            <View style={styles.timeInfo}>
              <Text style={styles.timeInfoText}>Configure specific times to accept/decline rides</Text>
            </View>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.white,
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.grey2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.COLORS.black,
  },
  headerButton: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.grey5,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.grey2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: theme.COLORS.grey5,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginRight: 8,
  },
  unit: {
    fontSize: 14,
    color: theme.COLORS.grey5,
    fontWeight: '500',
  },
  hint: {
    fontSize: 12,
    color: theme.COLORS.grey5,
    marginTop: 6,
  },
  ratingOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 12,
  },
  ratingButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
  },
  ratingButtonActive: {
    backgroundColor: theme.COLORS.primary,
    borderColor: theme.COLORS.primary,
  },
  ratingButtonText: {
    color: theme.COLORS.grey5,
    fontSize: 12,
  },
  ratingButtonTextActive: {
    color: theme.COLORS.white,
  },
  areaList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 8,
  },
  areaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.COLORS.grey1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  areaTagText: {
    fontSize: 12,
    color: theme.COLORS.black,
    marginRight: 6,
  },
  areaTagRemove: {
    fontSize: 16,
    color: theme.COLORS.grey5,
  },
  timeInfo: {
    backgroundColor: theme.COLORS.grey1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  timeInfoText: {
    fontSize: 13,
    color: theme.COLORS.grey5,
  },
  error: {
    color: theme.COLORS.danger,
    fontSize: 13,
    marginTop: 12,
  },
});

export default RideFilterPanel;
