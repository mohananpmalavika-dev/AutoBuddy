import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  Image,
  TextInput
} from 'react-native';
import { usePooling } from '../hooks/usePooling';

// ==================== POOL OFFER SCREEN ====================

export const PoolOfferScreen: React.FC<{
  userId: string;
  authToken: string;
  pickupLocation: { latitude: number; longitude: number; address: string };
  dropoffLocation: { latitude: number; longitude: number; address: string };
  originalFare: number;
  vehicleType: string;
  scheduledAt: Date;
  onPoolJoined: () => void;
  onPoolDeclined: () => void;
}> = ({
  userId,
  authToken,
  pickupLocation,
  dropoffLocation,
  originalFare,
  vehicleType,
  scheduledAt,
  onPoolJoined,
  onPoolDeclined
}) => {
  const { matchedPools, isLoading, findCompatiblePools, joinPool, declinePool } = usePooling(
    userId,
    authToken
  );

  useEffect(() => {
    findCompatiblePools(
      pickupLocation.latitude,
      pickupLocation.longitude,
      dropoffLocation.latitude,
      dropoffLocation.longitude,
      vehicleType,
      scheduledAt
    );
  }, []);

  const handleJoinPool = async (poolId: string) => {
    const success = await joinPool(poolId);
    if (success) {
      Alert.alert('Success', 'Joined pool successfully!', [
        { text: 'OK', onPress: onPoolJoined }
      ]);
    }
  };

  const handleDeclinePool = async (poolId: string) => {
    await declinePool(poolId);
  };

  const renderPool = ({ item }: { item: any }) => (
    <View style={styles.poolCard}>
      <View style={styles.poolHeader}>
        <View style={styles.memberBadge}>
          <Text style={styles.memberBadgeText}>{item.member_count} riders</Text>
        </View>
        <View style={styles.savingsBadge}>
          <Text style={styles.savingsText}>Save {item.savings_percent}%</Text>
        </View>
      </View>

      <View style={styles.savingsBox}>
        <Text style={styles.savingsLabel}>Your Savings</Text>
        <View style={styles.fareComparison}>
          <View style={styles.fareItem}>
            <Text style={styles.fareLabel}>Original</Text>
            <Text style={[styles.fareAmount, styles.originalFare]}>
              ₹{item.original_fare.toFixed(2)}
            </Text>
          </View>
          <Text style={styles.fareArrow}>→</Text>
          <View style={styles.fareItem}>
            <Text style={styles.fareLabel}>Pool Fare</Text>
            <Text style={[styles.fareAmount, styles.poolFare]}>
              ₹{item.pool_fare.toFixed(2)}
            </Text>
          </View>
        </View>
        <Text style={styles.savingsAmount}>
          Save ₹{(item.original_fare - item.pool_fare).toFixed(2)}
        </Text>
      </View>

      <View style={styles.poolDetails}>
        <Text style={styles.detailsTitle}>Pool Members</Text>
        {item.members.map((member: any, idx: number) => (
          <View key={idx} style={styles.memberRow}>
            <View style={styles.memberAvatar}>
              <Text style={styles.avatarText}>
                {member.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.memberTime}>
                {member.role === 'initiator' ? 'Pool Initiator' : 'Also pooling'}
              </Text>
            </View>
            <Text style={styles.memberFare}>₹{member.per_person_fare.toFixed(2)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rideDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Duration</Text>
          <Text style={styles.detailValue}>~{item.estimated_duration_minutes} min</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Vehicle</Text>
          <Text style={styles.detailValue}>{item.vehicle_type.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.poolActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonDecline]}
          onPress={() => handleDeclinePool(item.pool_id)}
        >
          <Text style={styles.actionButtonTextDecline}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonAccept]}
          onPress={() => handleJoinPool(item.pool_id)}
        >
          <Text style={styles.actionButtonTextAccept}>Join Pool & Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading && matchedPools.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Finding matching pools...</Text>
      </View>
    );
  }

  if (matchedPools.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No pools available</Text>
        <Text style={styles.emptySubtext}>
          You can ride alone or wait for compatible pools
        </Text>
        <TouchableOpacity style={styles.rideAloneButton} onPress={onPoolDeclined}>
          <Text style={styles.rideAloneText}>Ride Alone</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>Available Pools</Text>
      <FlatList
        data={matchedPools}
        renderItem={renderPool}
        keyExtractor={(item) => item.pool_id}
        scrollEnabled={true}
      />
    </View>
  );
};

// ==================== ACTIVE POOL SCREEN ====================

export const ActivePoolScreen: React.FC<{
  userId: string;
  authToken: string;
  poolId: string;
  onPoolCancelled: () => void;
}> = ({ userId, authToken, poolId, onPoolCancelled }) => {
  const { activePool, isLoading, getPoolDetails, connectToPoolUpdates, disconnectFromPoolUpdates } =
    usePooling(userId, authToken);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    getPoolDetails(poolId);
    connectToPoolUpdates(poolId);

    return () => {
      disconnectFromPoolUpdates();
    };
  }, [poolId]);

  const handleCancelPool = () => {
    Alert.alert(
      'Cancel Pool?',
      'You will receive a refund if cancelled more than 15 minutes before ride time.',
      [
        { text: 'Keep Pool', onPress: () => setShowCancelConfirm(false) },
        {
          text: 'Cancel Pool',
          onPress: () => {
            setShowCancelConfirm(false);
            onPoolCancelled();
          },
          style: 'destructive'
        }
      ]
    );
  };

  if (isLoading && !activePool) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (!activePool) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Pool not found</Text>
      </View>
    );
  }

  const timeUntilRide = new Date(activePool.scheduled_at).getTime() - Date.now();
  const minutesUntilRide = Math.floor(timeUntilRide / 60000);

  return (
    <ScrollView style={styles.container}>
      {/* Pool Status */}
      <View style={styles.section}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Pool Status</Text>
          <View
            style={[
              styles.statusBadge,
              activePool.status === 'confirmed' ? styles.statusConfirmed : styles.statusSearching
            ]}
          >
            <Text
              style={[
                styles.statusText,
                activePool.status === 'confirmed' ? styles.statusTextConfirmed : styles.statusTextSearching
              ]}
            >
              {activePool.status === 'confirmed' ? '✓ Confirmed' : 'Searching'}
            </Text>
          </View>
        </View>
        {minutesUntilRide > 0 && (
          <Text style={styles.countdownText}>
            Ride in {minutesUntilRide} minutes
          </Text>
        )}
      </View>

      {/* Fare Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fare Breakdown</Text>
        <View style={styles.fareSummary}>
          <View style={styles.fareRow}>
            <Text style={styles.fareRowLabel}>Original Fare</Text>
            <Text style={styles.fareRowAmount}>₹{activePool.original_fare.toFixed(2)}</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareRowLabel}>Your Savings ({activePool.savings_percent}%)</Text>
            <Text style={styles.fareRowAmount} style={{ color: '#22C55E' }}>
              -₹{(activePool.original_fare - activePool.pool_fare).toFixed(2)}
            </Text>
          </View>
          <View style={[styles.fareRow, styles.fareTotalRow]}>
            <Text style={styles.fareTotalLabel}>Your Fare</Text>
            <Text style={styles.fareTotalAmount}>
              ₹{(activePool.pool_fare / activePool.member_count).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Pool Members */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pool Members ({activePool.member_count})</Text>
        {activePool.members.map((member, idx) => (
          <View key={idx} style={styles.memberCard}>
            <View style={styles.memberAvatar}>
              <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.memberCardInfo}>
              <Text style={styles.memberCardName}>{member.name}</Text>
              <Text style={styles.memberCardRole}>
                {member.role === 'initiator' ? 'Pool Initiator' : 'Rider'}
              </Text>
            </View>
            <Text style={styles.memberCardFare}>₹{member.per_person_fare.toFixed(2)}</Text>
          </View>
        ))}
      </View>

      {/* Route Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Route</Text>
        <View style={styles.routeBox}>
          <Text style={styles.routeLabel}>Pickup</Text>
          <Text style={styles.routeAddress}>{activePool.pickup_address}</Text>
          <Text style={styles.routeArrow}>↓</Text>
          <Text style={styles.routeLabel}>Dropoff</Text>
          <Text style={styles.routeAddress}>{activePool.dropoff_address}</Text>
        </View>
        <View style={styles.routeStats}>
          <View style={styles.routeStat}>
            <Text style={styles.routeStatLabel}>Duration</Text>
            <Text style={styles.routeStatValue}>~{activePool.estimated_duration_minutes} min</Text>
          </View>
          <View style={styles.routeStat}>
            <Text style={styles.routeStatLabel}>Vehicle</Text>
            <Text style={styles.routeStatValue}>{activePool.vehicle_type.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={handleCancelPool}>
        <Text style={styles.buttonDangerText}>Cancel Pool</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ==================== POOL PREFERENCES SCREEN ====================

export const PoolPreferencesScreen: React.FC<{
  userId: string;
  authToken: string;
  onSaved: () => void;
}> = ({ userId, authToken, onSaved }) => {
  const { poolPreferences, isLoading, setPreferences, fetchPreferences } = usePooling(
    userId,
    authToken
  );

  const [preferenceType, setPreferenceType] = useState<'prefer_alone' | 'willing_to_pool' | 'prefer_pool'>(
    'willing_to_pool'
  );
  const [vehicleTypes, setVehicleTypes] = useState(['economy', 'premium']);
  const [maxWaitTime, setMaxWaitTime] = useState(5);
  const [genderPreference, setGenderPreference] = useState('');

  useEffect(() => {
    fetchPreferences();
  }, []);

  useEffect(() => {
    if (poolPreferences) {
      setPreferenceType(poolPreferences.preference_type);
      setVehicleTypes(poolPreferences.preferred_vehicle_types);
      setMaxWaitTime(poolPreferences.max_wait_time_minutes);
      setGenderPreference(poolPreferences.gender_preference || '');
    }
  }, [poolPreferences]);

  const handleSavePreferences = async () => {
    const success = await setPreferences({
      preference_type: preferenceType,
      preferred_vehicle_types: vehicleTypes,
      max_wait_time_minutes: maxWaitTime,
      gender_preference: genderPreference || undefined
    });

    if (success) {
      Alert.alert('Success', 'Preferences saved', [{ text: 'OK', onPress: onSaved }]);
    }
  };

  const toggleVehicleType = (type: string) => {
    if (vehicleTypes.includes(type)) {
      setVehicleTypes(vehicleTypes.filter((v) => v !== type));
    } else {
      setVehicleTypes([...vehicleTypes, type]);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Pooling Preference */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pooling Preference</Text>

        <TouchableOpacity
          style={[
            styles.preferenceOption,
            preferenceType === 'prefer_alone' && styles.preferenceOptionActive
          ]}
          onPress={() => setPreferenceType('prefer_alone')}
        >
          <View style={styles.preferenceContent}>
            <Text style={styles.preferenceTitle}>Prefer Alone</Text>
            <Text style={styles.preferenceDesc}>I prefer to ride alone</Text>
          </View>
          {preferenceType === 'prefer_alone' && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.preferenceOption,
            preferenceType === 'willing_to_pool' && styles.preferenceOptionActive
          ]}
          onPress={() => setPreferenceType('willing_to_pool')}
        >
          <View style={styles.preferenceContent}>
            <Text style={styles.preferenceTitle}>Willing to Pool</Text>
            <Text style={styles.preferenceDesc}>I'm open to pooling</Text>
          </View>
          {preferenceType === 'willing_to_pool' && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.preferenceOption,
            preferenceType === 'prefer_pool' && styles.preferenceOptionActive
          ]}
          onPress={() => setPreferenceType('prefer_pool')}
        >
          <View style={styles.preferenceContent}>
            <Text style={styles.preferenceTitle}>Prefer Pool</Text>
            <Text style={styles.preferenceDesc}>Save money, I prefer pooling</Text>
          </View>
          {preferenceType === 'prefer_pool' && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
      </View>

      {/* Vehicle Types */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vehicle Types</Text>
        <View style={styles.vehicleTypeGrid}>
          {['economy', 'premium', 'xl'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.vehicleTypeOption,
                vehicleTypes.includes(type) && styles.vehicleTypeOptionSelected
              ]}
              onPress={() => toggleVehicleType(type)}
            >
              <Text
                style={[
                  styles.vehicleTypeText,
                  vehicleTypes.includes(type) && styles.vehicleTypeTextSelected
                ]}
              >
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Max Wait Time */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Max Wait Time for Pooling</Text>
        <View style={styles.waitTimeOptions}>
          {[3, 5, 10, 15].map((time) => (
            <TouchableOpacity
              key={time}
              style={[
                styles.waitTimeButton,
                maxWaitTime === time && styles.waitTimeButtonActive
              ]}
              onPress={() => setMaxWaitTime(time)}
            >
              <Text
                style={[
                  styles.waitTimeText,
                  maxWaitTime === time && styles.waitTimeTextActive
                ]}
              >
                {time}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Gender Preference */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gender Preference (Optional)</Text>
        <TextInput
          style={styles.genderInput}
          placeholder="No preference"
          value={genderPreference}
          onChangeText={setGenderPreference}
        />
        <Text style={styles.genderNote}>Leave blank for no preference</Text>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary]}
        onPress={handleSavePreferences}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Save Preferences</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12
  },

  screenTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16
  },

  poolCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 3
  },
  poolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  memberBadge: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16
  },
  memberBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2'
  },
  savingsBadge: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16
  },
  savingsText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#22C55E'
  },

  savingsBox: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E'
  },
  savingsLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500'
  },
  fareComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  fareItem: {
    flex: 1,
    alignItems: 'center'
  },
  fareLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4
  },
  fareAmount: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  originalFare: {
    color: '#999',
    textDecorationLine: 'line-through'
  },
  poolFare: {
    color: '#333'
  },
  fareArrow: {
    fontSize: 14,
    color: '#CCC',
    paddingHorizontal: 8
  },
  savingsAmount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#22C55E',
    textAlign: 'center'
  },

  poolDetails: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  detailsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  avatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF'
  },
  memberInfo: {
    flex: 1
  },
  memberName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333'
  },
  memberTime: {
    fontSize: 11,
    color: '#999'
  },
  memberFare: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF6B35'
  },

  rideDetails: {
    backgroundColor: '#F9F9F9',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500'
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },

  poolActions: {
    flexDirection: 'row',
    gap: 10
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionButtonDecline: {
    backgroundColor: '#FEE',
    borderWidth: 1,
    borderColor: '#E53E3E'
  },
  actionButtonTextDecline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E53E3E'
  },
  actionButtonAccept: {
    backgroundColor: '#22C55E'
  },
  actionButtonTextAccept: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF'
  },

  rideAloneButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    marginTop: 12
  },
  rideAloneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },

  section: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12
  },

  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500'
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20
  },
  statusSearching: {
    backgroundColor: '#FFF3E0'
  },
  statusConfirmed: {
    backgroundColor: '#E8F5E9'
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600'
  },
  statusTextSearching: {
    color: '#F57C00'
  },
  statusTextConfirmed: {
    color: '#2E7D32'
  },
  countdownText: {
    fontSize: 13,
    color: '#FF6B35',
    fontWeight: '600'
  },

  fareSummary: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  fareTotalRow: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0
  },
  fareRowLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500'
  },
  fareRowAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333'
  },
  fareTotalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333'
  },
  fareTotalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B35'
  },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  memberCardInfo: {
    flex: 1,
    marginLeft: 12
  },
  memberCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333'
  },
  memberCardRole: {
    fontSize: 11,
    color: '#999'
  },
  memberCardFare: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF6B35'
  },

  routeBox: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35'
  },
  routeLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
    marginTop: 8
  },
  routeAddress: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4
  },
  routeArrow: {
    fontSize: 14,
    color: '#CCC',
    textAlign: 'center',
    marginVertical: 4
  },
  routeStats: {
    flexDirection: 'row',
    gap: 16
  },
  routeStat: {
    flex: 1
  },
  routeStatLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4
  },
  routeStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },

  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  buttonPrimary: {
    backgroundColor: '#FF6B35'
  },
  buttonDanger: {
    backgroundColor: '#FEE',
    borderWidth: 1,
    borderColor: '#E53E3E'
  },
  buttonDangerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E53E3E'
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16
  },

  preferenceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10
  },
  preferenceOptionActive: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF6B35'
  },
  preferenceContent: {
    flex: 1
  },
  preferenceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333'
  },
  preferenceDesc: {
    fontSize: 12,
    color: '#999',
    marginTop: 4
  },
  checkmark: {
    fontSize: 18,
    color: '#FF6B35',
    fontWeight: 'bold'
  },

  vehicleTypeGrid: {
    flexDirection: 'row',
    gap: 10
  },
  vehicleTypeOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center'
  },
  vehicleTypeOptionSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35'
  },
  vehicleTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  vehicleTypeTextSelected: {
    color: '#FFF'
  },

  waitTimeOptions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12
  },
  waitTimeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center'
  },
  waitTimeButtonActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35'
  },
  waitTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  waitTimeTextActive: {
    color: '#FFF'
  },

  genderInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8
  },
  genderNote: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic'
  }
});
