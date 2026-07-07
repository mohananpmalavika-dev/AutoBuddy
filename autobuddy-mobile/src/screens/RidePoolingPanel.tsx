import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  Text,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { ridePoolingAPI } from '@/services/apiClient';
import { getSocket } from '@/services/socketClient';
// BUG-019 FIX: Import fare validation
import { validateFare } from '../utils/validation';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type PoolModel = 'SYSTEM_CREATED' | 'PASSENGER_CREATED' | 'DRIVER_CREATED';

type PoolCreateDefaults = {
  pickup_location?: string;
  dropoff_location?: string;
  max_wait_minutes?: number;
};

type RidePool = {
  _id?: string;
  id?: string;
  pool_id?: string;
  pool_model?: PoolModel;
  pickup_location: string;
  dropoff_location: string;
  estimated_fare: number;
  fare_per_passenger?: number;
  current_passengers: number;
  max_passengers: number;
  discount_percentage: number;
  max_wait_minutes?: number;
  route_name?: string;
  route_polyline?: string;
  driver_id?: string;
  passengers?: string[];
  status?: string;
};

type RidePoolingPanelProps = {
  userId: string;
  userType: 'passenger' | 'driver';
  currentLocation?: Coordinate | null;
  radiusKm?: number;
  openCreateModel?: PoolModel | null;
  openCreateRequestKey?: number;
  createDefaults?: PoolCreateDefaults;
};

type PoolSocketEvent = {
  pool_id: string;
  passenger_id?: string;
};

type PoolFormData = {
  pickup_location: string;
  dropoff_location: string;
  estimated_fare: number;
  max_passengers: number;
  discount_percentage: number;
  max_wait_minutes: number;
  route_name: string;
  route_polyline: string;
};

const ICONS: Record<string, string> = {
  add: '+',
  close: 'x',
  check: 'Check',
  'arrow-downward': 'v',
  'location-on': 'Pin',
  'account-check': 'In',
  'car-multiple': 'Cars',
  car: 'Car',
};

const POOL_MODEL_LABELS: Record<PoolModel, string> = {
  SYSTEM_CREATED: 'Auto Match',
  PASSENGER_CREATED: 'My Pool',
  DRIVER_CREATED: 'Shared Route',
};

const PASSENGER_POOL_OPTIONS: { model: PoolModel; label: string }[] = [
  { model: 'SYSTEM_CREATED', label: 'Auto Match Pool' },
  { model: 'PASSENGER_CREATED', label: 'Create My Pool' },
];

const MaterialIcons = ({
  name,
  size = 16,
  color = '#333',
}: {
  name: string;
  size?: number;
  color?: string;
}) => (
  <Text style={{ color, fontSize: Math.max(11, Math.min(size, 18)), fontWeight: '700' }}>
    {ICONS[name] || name}
  </Text>
);

const MaterialCommunityIcons = MaterialIcons;

const getPoolId = (pool: Pick<RidePool, '_id' | 'id' | 'pool_id'>) => pool.pool_id || pool._id || pool.id || '';

const normalizePoolModel = (model: unknown): PoolModel => {
  const value = String(model || '').toUpperCase();
  if (value === 'PASSENGER_CREATED') {
    return 'PASSENGER_CREATED';
  }
  if (value === 'DRIVER_CREATED') {
    return 'DRIVER_CREATED';
  }
  return 'SYSTEM_CREATED';
};

const getInitialFormData = (): PoolFormData => ({
  pickup_location: '',
  dropoff_location: '',
  estimated_fare: 500,
  max_passengers: 4,
  discount_percentage: 20,
  max_wait_minutes: 10,
  route_name: '',
  route_polyline: '',
});

const getCreateFormData = (defaults?: PoolCreateDefaults): PoolFormData => {
  const initial = getInitialFormData();
  return {
    ...initial,
    pickup_location: defaults?.pickup_location || initial.pickup_location,
    dropoff_location: defaults?.dropoff_location || initial.dropoff_location,
    max_wait_minutes: Number(defaults?.max_wait_minutes) || initial.max_wait_minutes,
  };
};

const normalizePool = (pool: any): RidePool => ({
  _id: pool?._id || pool?.id || pool?.pool_id,
  id: pool?.id || pool?._id || pool?.pool_id,
  pool_id: pool?.pool_id,
  pool_model: normalizePoolModel(pool?.pool_model),
  pickup_location: String(pool?.pickup_location || ''),
  dropoff_location: String(pool?.dropoff_location || ''),
  estimated_fare: Number(pool?.estimated_fare || 0),
  fare_per_passenger: Number(pool?.fare_per_passenger || 0),
  current_passengers: Number(pool?.current_passengers ?? pool?.passengers?.length ?? 0),
  max_passengers: Number(pool?.max_passengers || 4),
  discount_percentage: Number(pool?.discount_percentage || 0),
  max_wait_minutes: Number(pool?.max_wait_minutes || 10),
  route_name: String(pool?.route_name || ''),
  route_polyline: String(pool?.route_polyline || ''),
  driver_id: pool?.driver_id ? String(pool.driver_id) : undefined,
  passengers: Array.isArray(pool?.passengers) ? pool.passengers.map(String) : [],
  status: pool?.status,
});

const RidePoolingPanel: React.FC<RidePoolingPanelProps> = ({
  userId,
  userType,
  currentLocation = null,
  radiusKm = 2,
  openCreateModel = null,
  openCreateRequestKey = 0,
  createDefaults,
}) => {
  const panelAudience = userType === 'driver' ? 'Driver' : 'Passenger';
  const initialCreateModel: PoolModel =
    userType === 'driver'
      ? 'DRIVER_CREATED'
      : openCreateModel === 'PASSENGER_CREATED' || openCreateModel === 'SYSTEM_CREATED'
        ? openCreateModel
        : 'SYSTEM_CREATED';
  const shouldOpenCreateOnMount = openCreateRequestKey > 0 && !!openCreateModel;
  const [pools, setPools] = useState<RidePool[]>([]);
  const [userPools, setUserPools] = useState<RidePool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(userType === 'driver' ? 'my-pools' : 'available');
  const [showPoolDetail, setShowPoolDetail] = useState(false);
  const [showCreatePool, setShowCreatePool] = useState(shouldOpenCreateOnMount);
  const [selectedPool, setSelectedPool] = useState<RidePool | null>(null);
  const [selectedPoolModel, setSelectedPoolModel] = useState<PoolModel>(initialCreateModel);
  const effectivePoolModel: PoolModel =
    userType === 'driver'
      ? 'DRIVER_CREATED'
      : selectedPoolModel === 'DRIVER_CREATED'
        ? 'SYSTEM_CREATED'
        : selectedPoolModel;
  const activePoolTab = userType === 'driver' ? 'my-pools' : activeTab;

  const [formData, setFormData] = useState<PoolFormData>(
    shouldOpenCreateOnMount ? getCreateFormData(createDefaults) : getInitialFormData(),
  );

  const loadPools = useCallback(async () => {
    try {
      setLoading(true);
      if (userType === 'passenger') {
        const result = await ridePoolingAPI.findAvailablePools(
          currentLocation?.latitude,
          currentLocation?.longitude,
          radiusKm
        );
        const availablePools = (result.pools || []).map(normalizePool);
        setPools(availablePools);
      } else {
        setPools([]);
      }

      // Get user's pools
      const userPoolsResult = await ridePoolingAPI.listUserPools();
      const nextUserPools = (Array.isArray(userPoolsResult) ? userPoolsResult : userPoolsResult.pools || []).map(normalizePool);
      setUserPools(nextUserPools);
    } catch (error) {
      console.error('Error loading pools:', error);
      Alert.alert('Error', 'Failed to load ride pools');
    } finally {
      setLoading(false);
    }
  }, [currentLocation, radiusKm, userType]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPools();
    setRefreshing(false);
  };

  const registerSocketListeners = useCallback(() => {
    const socket = getSocket();
    if (!socket) {return;}

    socket.on('pool_created', (data: unknown) => {
      const nextPool = normalizePool(data);
      if (userType === 'passenger') {
        setPools((prev) => [nextPool, ...prev]);
      }
      if (userType === 'driver' && nextPool.driver_id === userId) {
        setUserPools((prev) => [nextPool, ...prev]);
      }
    });

    socket.on('pool_joined', (data: PoolSocketEvent) => {
      const passengerId = data.passenger_id;
      setPools((prev) =>
        prev.map((pool) =>
          getPoolId(pool) === data.pool_id
            ? {
                ...pool,
                current_passengers: (pool.current_passengers || 0) + 1,
                passengers: passengerId
                  ? [...(pool.passengers || []), passengerId]
                  : pool.passengers || [],
              }
            : pool
        )
      );
    });

    socket.on('pool_updated', (data: PoolSocketEvent & Partial<RidePool>) => {
      setPools((prev) =>
        prev.map((pool) => (getPoolId(pool) === data.pool_id ? normalizePool(data) : pool))
      );
      setUserPools((prev) =>
        prev.map((pool) => (getPoolId(pool) === data.pool_id ? normalizePool(data) : pool))
      );
    });
  }, [userId, userType]);

  const openCreatePool = (requestedModel?: PoolModel | null) => {
    const nextModel =
      userType === 'driver'
        ? 'DRIVER_CREATED'
        : requestedModel === 'PASSENGER_CREATED' || requestedModel === 'SYSTEM_CREATED'
          ? requestedModel
          : effectivePoolModel;
    setSelectedPoolModel(nextModel);
    setFormData(getCreateFormData(createDefaults));
    setShowCreatePool(true);
  };

  const resetCreateForm = () => {
    setFormData(getCreateFormData());
    setSelectedPoolModel(userType === 'driver' ? 'DRIVER_CREATED' : 'SYSTEM_CREATED');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPools();
    }, 0);
    registerSocketListeners();

    return () => {
      clearTimeout(timer);
      const socket = getSocket();
      if (socket) {
        socket.off('pool_created');
        socket.off('pool_joined');
        socket.off('pool_updated');
      }
    };
  }, [loadPools, registerSocketListeners]);

  const handleCreatePool = async () => {
    if (!formData.pickup_location.trim() || !formData.dropoff_location.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    // BUG-019 FIX: Validate fare before submission
    const fareValidation = validateFare(formData.estimated_fare, { min: 10, max: 10000 });
    if (!fareValidation.isValid) {
      Alert.alert('Invalid Fare', fareValidation.error || 'Please enter a valid fare amount');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        pickup_location: formData.pickup_location,
        dropoff_location: formData.dropoff_location,
        estimated_fare: fareValidation.amount!, // Use validated fare
        max_passengers: Number(formData.max_passengers) || 4,
        discount_percentage: Number(formData.discount_percentage) || 0,
        max_wait_minutes: Number(formData.max_wait_minutes) || 10,
        route_name: formData.route_name.trim() || undefined,
        route_polyline: formData.route_polyline.trim() || undefined,
        pool_model: effectivePoolModel,
      };

      const newPool =
        effectivePoolModel === 'DRIVER_CREATED'
          ? await ridePoolingAPI.createDriverPool(payload)
          : effectivePoolModel === 'PASSENGER_CREATED'
            ? await ridePoolingAPI.createPassengerPool(payload)
            : await ridePoolingAPI.requestSystemPool(payload);

      const normalizedNewPool = normalizePool(newPool);
      setUserPools((prev) => [normalizedNewPool, ...prev.filter((pool) => getPoolId(pool) !== getPoolId(normalizedNewPool))]);
      if (userType === 'passenger') {
        setPools((prev) => [normalizedNewPool, ...prev.filter((pool) => getPoolId(pool) !== getPoolId(normalizedNewPool))]);
      }
      resetCreateForm();
      setShowCreatePool(false);
      setActiveTab('my-pools');
      Alert.alert(
        'Success',
        effectivePoolModel === 'SYSTEM_CREATED'
          ? 'Pool request sent for auto matching.'
          : effectivePoolModel === 'DRIVER_CREATED'
            ? 'Shared route started.'
            : 'Ride pool created successfully!'
      );
    } catch (error) {
      console.error('Error creating pool:', error);
      Alert.alert('Error', 'Failed to create ride pool');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinPool = async (poolId: string) => {
    try {
      const response = await ridePoolingAPI.joinPool(poolId);
      const updatedPool = normalizePool(response?.pool || response);

      // Update pools list
      setPools((prev) =>
        prev.map((pool) =>
          getPoolId(pool) === poolId
            ? {
                ...pool,
                ...updatedPool,
                current_passengers: updatedPool.current_passengers || (pool.current_passengers || 0) + 1,
                passengers: updatedPool.passengers?.length ? updatedPool.passengers : [...(pool.passengers || []), userId],
              }
            : pool
        )
      );

      // Add to user's pools
      const poolDetail = pools.find((p) => getPoolId(p) === poolId);
      if (poolDetail) {
        setUserPools([{ ...poolDetail, ...updatedPool, status: updatedPool.status || 'joined' }, ...userPools]);
      }

      Alert.alert('Success', 'Joined the ride pool!');
    } catch (error) {
      console.error('Error joining pool:', error);
      Alert.alert('Error', 'Failed to join ride pool');
    }
  };

  const handleLeavePool = async (poolId: string) => {
    Alert.alert('Leave Pool', 'Are you sure you want to leave this pool?', [
      { text: 'Cancel' },
      {
        text: 'Leave',
        onPress: async () => {
          try {
            await ridePoolingAPI.leavePool(poolId);

            setUserPools((prev) => prev.filter((p) => getPoolId(p) !== poolId));
            setPools((prev) =>
              prev.map((pool) =>
                getPoolId(pool) === poolId
                  ? {
                      ...pool,
                      current_passengers: Math.max(0, (pool.current_passengers || 1) - 1),
                      passengers: (pool.passengers || []).filter((p) => p !== userId),
                    }
                  : pool
              )
            );

            Alert.alert('Success', 'Left the ride pool');
          } catch {
            Alert.alert('Error', 'Failed to leave pool');
          }
        },
      },
    ]);
  };

  const handleAssignDriver = async (poolId: string) => {
    try {
      const response = await ridePoolingAPI.assignDriver(poolId);
      const updatedPool = normalizePool(response?.pool || response);
      setUserPools((prev) =>
        prev.map((pool) => (getPoolId(pool) === poolId ? { ...pool, ...updatedPool } : pool))
      );
      setPools((prev) =>
        prev.map((pool) => (getPoolId(pool) === poolId ? { ...pool, ...updatedPool } : pool))
      );
      setSelectedPool((prev) => (prev && getPoolId(prev) === poolId ? { ...prev, ...updatedPool } : prev));
      Alert.alert('Success', 'Driver assigned to pool');
    } catch (error) {
      console.error('Error assigning driver:', error);
      Alert.alert('Error', 'Failed to assign driver');
    }
  };

  const calculatePerPersonFare = (pool: RidePool) => {
    if (pool.fare_per_passenger && pool.fare_per_passenger > 0) {
      return pool.fare_per_passenger.toFixed(0);
    }
    const discount = (pool.estimated_fare * pool.discount_percentage) / 100;
    const discountedFare = pool.estimated_fare - discount;
    const perPerson = discountedFare / Math.max(1, pool.current_passengers || 1);
    return perPerson.toFixed(0);
  };

  const calculateSavings = (pool: RidePool) => {
    const discount = (pool.estimated_fare * pool.discount_percentage) / 100;
    return discount.toFixed(0);
  };

  const PoolCard = ({ pool, isUserPool = false }: { pool: RidePool; isUserPool?: boolean }) => {
    const passengers = Math.max(0, pool.current_passengers || 0);
    const isFull = passengers >= pool.max_passengers;
    const model = normalizePoolModel(pool.pool_model);
    const routeTitle = pool.route_name || pool.pickup_location;

    return (
      <TouchableOpacity
        style={[styles.poolCard, isFull && styles.fullPoolCard]}
        onPress={() => {
          setSelectedPool(pool);
          setShowPoolDetail(true);
        }}
      >
        <View style={styles.poolHeader}>
          <View style={styles.poolRoute}>
            <View style={styles.poolMetaRow}>
              <Text style={styles.modelBadgeText}>{POOL_MODEL_LABELS[model]}</Text>
              <Text style={styles.poolStatusText}>{String(pool.status || 'waiting').replace(/_/g, ' ')}</Text>
            </View>
            <Text style={styles.routeFrom}>Pin {routeTitle}</Text>
            <View style={styles.routeArrow}>
              <MaterialIcons name="arrow-downward" size={16} color="#4ECDC4" />
            </View>
            <Text style={styles.routeTo}>Drop {pool.dropoff_location}</Text>
          </View>

          <View style={styles.poolStatus}>
            {isFull ? (
              <View style={styles.fullBadge}>
                <Text style={styles.fullBadgeText}>FULL</Text>
              </View>
            ) : (
              <View style={styles.availableBadge}>
                <Text style={styles.availableBadgeText}>
                  {pool.max_passengers - passengers} spots
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.poolPricingInfo}>
          <View style={styles.priceSection}>
            <Text style={styles.priceLabel}>Base</Text>
            <Text style={styles.priceValue}>₹{pool.estimated_fare}</Text>
          </View>

          <View style={styles.priceSection}>
            <Text style={styles.priceLabel}>You Pay</Text>
            <Text style={styles.priceValue}>₹{calculatePerPersonFare(pool)}</Text>
          </View>

          <View style={styles.priceSection}>
            <Text style={styles.priceLabel}>Save</Text>
            <Text style={[styles.priceValue, styles.savingsText]}>
              ₹{calculateSavings(pool)}
            </Text>
          </View>
        </View>

        <View style={styles.poolPassengers}>
          <View style={styles.passengerInfo}>
            {[...Array(Math.max(0, pool.current_passengers || 0))].map((_, i) => (
              <View key={i} style={styles.passengerAvatar}>
                <Text style={styles.passengerInitial}>P{i + 1}</Text>
              </View>
            ))}
            {pool.current_passengers < pool.max_passengers && (
              <View style={styles.emptySlot}>
                <MaterialIcons name="add" size={16} color="#ddd" />
              </View>
            )}
          </View>
          <Text style={styles.passengerCount}>
            {passengers}/{pool.max_passengers} passengers
          </Text>
        </View>

        {model === 'DRIVER_CREATED' && pool.driver_id && (
          <View style={styles.userPoolBadge}>
            <MaterialCommunityIcons name="car" size={14} color="#4ECDC4" />
            <Text style={styles.userPoolText}>Driver route active</Text>
          </View>
        )}

        {isUserPool && (
          <View style={styles.userPoolBadge}>
            <MaterialCommunityIcons name="account-check" size={14} color="#51CF66" />
            <Text style={styles.userPoolText}>
              {userType === 'driver' ? 'Your shared route' : 'You are in this pool'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4ECDC4" />
          <Text style={styles.loadingText}>Loading ride pools...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{panelAudience} Ride Pooling</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => openCreatePool()}
        >
          <MaterialIcons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      {userType === 'passenger' && (
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'available' && styles.activeTab]}
            onPress={() => setActiveTab('available')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'available' && styles.activeTabText,
              ]}
            >
              Available
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'my-pools' && styles.activeTab]}
            onPress={() => setActiveTab('my-pools')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'my-pools' && styles.activeTabText,
              ]}
            >
              My Pools
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {userType === 'passenger' && activePoolTab === 'available' ? (
        pools.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="car-multiple" size={64} color="#ddd" />
            <Text style={styles.emptyText}>No available pools</Text>
            <Text style={styles.emptySubText}>
              Use Auto Match to queue one
            </Text>
          </View>
        ) : (
          <FlatList
            data={pools}
            renderItem={({ item }) => <PoolCard pool={item} />}
            keyExtractor={(item) => getPoolId(item)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
          />
        )
      ) : userPools.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="car" size={64} color="#ddd" />
          <Text style={styles.emptyText}>
            {userType === 'driver' ? 'No shared routes' : 'No active pools'}
          </Text>
          <Text style={styles.emptySubText}>
            {userType === 'driver' ? 'Start a shared route' : 'Join a pool to get started'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={userPools}
          renderItem={({ item }) => <PoolCard pool={item} isUserPool={true} />}
          keyExtractor={(item) => getPoolId(item)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Create pool modal */}
      <Modal visible={showCreatePool} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreatePool(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {effectivePoolModel === 'DRIVER_CREATED' ? 'Start Shared Route' : 'Pool Ride'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {userType === 'passenger' && (
              <View style={styles.modelSelector}>
                {PASSENGER_POOL_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.model}
                    style={[
                      styles.modelOption,
                      effectivePoolModel === option.model && styles.activeModelOption,
                    ]}
                    onPress={() => setSelectedPoolModel(option.model)}
                  >
                    <Text
                      style={[
                        styles.modelOptionText,
                        effectivePoolModel === option.model && styles.activeModelOptionText,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {effectivePoolModel === 'DRIVER_CREATED' && (
              <>
                <Text style={styles.formLabel}>Route Name</Text>
                <View style={styles.locationInput}>
                  <MaterialIcons name="car" size={20} color="#4ECDC4" />
                  <TextInput
                    style={styles.locationTextInput}
                    placeholder="Kazhakkoottam to Technopark"
                    placeholderTextColor="#999"
                    value={formData.route_name}
                    onChangeText={(route_name) => setFormData({ ...formData, route_name })}
                  />
                </View>
              </>
            )}

            <Text style={styles.formLabel}>Pickup Location *</Text>
            <View style={styles.locationInput}>
              <MaterialIcons name="location-on" size={20} color="#4ECDC4" />
              <TextInput
                style={styles.locationTextInput}
                placeholder="Enter pickup location"
                placeholderTextColor="#999"
                value={formData.pickup_location}
                onChangeText={(pickup_location) => setFormData({ ...formData, pickup_location })}
              />
            </View>

            <Text style={styles.formLabel}>Dropoff Location *</Text>
            <View style={styles.locationInput}>
              <MaterialIcons name="location-on" size={20} color="#FF6B6B" />
              <TextInput
                style={styles.locationTextInput}
                placeholder="Enter dropoff location"
                placeholderTextColor="#999"
                value={formData.dropoff_location}
                onChangeText={(dropoff_location) => setFormData({ ...formData, dropoff_location })}
              />
            </View>

            <Text style={styles.formLabel}>Estimated Base Fare</Text>
            <View style={styles.locationInput}>
              <Text style={styles.inputPrefix}>Rs.</Text>
              <TextInput
                style={styles.locationTextInput}
                keyboardType="numeric"
                value={String(formData.estimated_fare)}
                onChangeText={(value) => {
                  // BUG-019 FIX: Validate fare input
                  const numericValue = Number(value.replace(/[^0-9]/g, '')) || 0;
                  const fareValidation = validateFare(numericValue, { min: 10, max: 10000 });
                  
                  if (!fareValidation.isValid && numericValue > 0) {
                    // Show warning but still update (for better UX)
                    console.warn('[RidePooling] Invalid fare:', fareValidation.error);
                  }
                  
                  setFormData({ ...formData, estimated_fare: numericValue });
                }}
              />
            </View>

            <Text style={styles.formLabel}>Max Passengers</Text>
            <View style={styles.numberStepper}>
              {[2, 3, 4].map((count) => (
                <TouchableOpacity
                  key={count}
                  style={[
                    styles.stepperOption,
                    formData.max_passengers === count && styles.activeStepperOption,
                  ]}
                  onPress={() => setFormData({ ...formData, max_passengers: count })}
                >
                  <Text
                    style={[
                      styles.stepperText,
                      formData.max_passengers === count && styles.activeStepperText,
                    ]}
                  >
                    {count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Discount Percentage</Text>
            <View style={styles.numberStepper}>
              {[10, 20, 30].map((discount) => (
                <TouchableOpacity
                  key={discount}
                  style={[
                    styles.stepperOption,
                    formData.discount_percentage === discount && styles.activeStepperOption,
                  ]}
                  onPress={() => setFormData({ ...formData, discount_percentage: discount })}
                >
                  <Text
                    style={[
                      styles.stepperText,
                      formData.discount_percentage === discount && styles.activeStepperText,
                    ]}
                  >
                    {discount}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Max Wait Time</Text>
            <View style={styles.numberStepper}>
              {[5, 10, 15].map((minutes) => (
                <TouchableOpacity
                  key={minutes}
                  style={[
                    styles.stepperOption,
                    formData.max_wait_minutes === minutes && styles.activeStepperOption,
                  ]}
                  onPress={() => setFormData({ ...formData, max_wait_minutes: minutes })}
                >
                  <Text
                    style={[
                      styles.stepperText,
                      formData.max_wait_minutes === minutes && styles.activeStepperText,
                    ]}
                  >
                    {minutes} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {effectivePoolModel === 'DRIVER_CREATED' && (
              <>
                <Text style={styles.formLabel}>Route Polyline</Text>
                <View style={[styles.locationInput, styles.multilineInput]}>
                  <TextInput
                    style={[styles.locationTextInput, styles.multilineTextInput]}
                    placeholder="Optional encoded route"
                    placeholderTextColor="#999"
                    value={formData.route_polyline}
                    multiline
                    onChangeText={(route_polyline) => setFormData({ ...formData, route_polyline })}
                  />
                </View>
              </>
            )}

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleCreatePool}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {effectivePoolModel === 'SYSTEM_CREATED'
                    ? 'Auto Match Pool'
                    : effectivePoolModel === 'DRIVER_CREATED'
                      ? 'Start Shared Route'
                      : 'Create My Pool'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Pool detail modal */}
      <Modal visible={showPoolDetail} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowPoolDetail(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Pool Details</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedPool && (
            <ScrollView style={styles.modalContent}>
              <View style={styles.detailSection}>
                <Text style={styles.routeTitle}>Route</Text>
                {selectedPool.route_name ? (
                  <Text style={styles.routeDetail}>{selectedPool.route_name}</Text>
                ) : null}
                <Text style={styles.routeDetail}>Pin {selectedPool.pickup_location}</Text>
                <View style={styles.routeArrow}>
                  <MaterialIcons name="arrow-downward" size={20} color="#4ECDC4" />
                </View>
                <Text style={styles.routeDetail}>Drop {selectedPool.dropoff_location}</Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Pool Model</Text>
                <View style={styles.priceDetailRow}>
                  <Text style={styles.detailLabel}>Model</Text>
                  <Text style={styles.detailValue}>
                    {POOL_MODEL_LABELS[normalizePoolModel(selectedPool.pool_model)]}
                  </Text>
                </View>
                <View style={styles.priceDetailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={styles.detailValue}>
                    {String(selectedPool.status || 'waiting').replace(/_/g, ' ')}
                  </Text>
                </View>
                <View style={styles.priceDetailRow}>
                  <Text style={styles.detailLabel}>Max Wait</Text>
                  <Text style={styles.detailValue}>{selectedPool.max_wait_minutes || 10} min</Text>
                </View>
                {selectedPool.driver_id ? (
                  <View style={styles.priceDetailRow}>
                    <Text style={styles.detailLabel}>Driver</Text>
                    <Text style={styles.detailValue}>Assigned</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Pricing</Text>
                <View style={styles.priceDetailRow}>
                  <Text style={styles.detailLabel}>Base Fare</Text>
                  <Text style={styles.detailValue}>
                    ₹{selectedPool.estimated_fare}
                  </Text>
                </View>

                <View style={styles.priceDetailRow}>
                  <Text style={styles.detailLabel}>Discount</Text>
                  <Text style={styles.detailValue}>
                    {selectedPool.discount_percentage}%
                  </Text>
                </View>

                <View style={styles.priceDetailRow}>
                  <Text style={styles.detailLabel}>Your Fare</Text>
                  <Text style={styles.detailValueHighlight}>
                    ₹{calculatePerPersonFare(selectedPool)}
                  </Text>
                </View>

                <View style={styles.priceDetailRow}>
                  <Text style={styles.detailLabel}>You Save</Text>
                  <Text style={styles.detailValueSavings}>
                    ₹{calculateSavings(selectedPool)}
                  </Text>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Passengers</Text>
                <Text style={styles.passengerCountDetail}>
                  {selectedPool.current_passengers}/{selectedPool.max_passengers}
                </Text>
              </View>

              {/* Action buttons */}
              <View style={styles.actionButtons}>
                {userType === 'passenger' &&
                  !userPools.find((p) => getPoolId(p) === getPoolId(selectedPool)) &&
                  selectedPool.current_passengers < selectedPool.max_passengers && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.joinBtn]}
                      onPress={() => {
                        handleJoinPool(getPoolId(selectedPool));
                        setShowPoolDetail(false);
                      }}
                    >
                      <MaterialIcons name="check" size={20} color="white" />
                      <Text style={styles.actionBtnText}>Join Pool</Text>
                    </TouchableOpacity>
                  )}

                {userType === 'passenger' && userPools.find((p) => getPoolId(p) === getPoolId(selectedPool)) && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.leaveBtn]}
                    onPress={() => {
                      handleLeavePool(getPoolId(selectedPool));
                      setShowPoolDetail(false);
                    }}
                  >
                    <MaterialIcons name="close" size={20} color="white" />
                    <Text style={styles.actionBtnText}>Leave Pool</Text>
                  </TouchableOpacity>
                )}

                {userType === 'driver' && !selectedPool.driver_id && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.joinBtn]}
                    onPress={() => {
                      handleAssignDriver(getPoolId(selectedPool));
                      setShowPoolDetail(false);
                    }}
                  >
                    <MaterialIcons name="check" size={20} color="white" />
                    <Text style={styles.actionBtnText}>Assign to Me</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#4ECDC4',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
  },
  activeTabText: {
    color: '#4ECDC4',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  listContent: {
    padding: 8,
  },
  poolCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    marginHorizontal: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  fullPoolCard: {
    borderLeftColor: '#95A5A6',
    opacity: 0.6,
  },
  poolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  poolRoute: {
    flex: 1,
  },
  poolMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  modelBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0B7A3B',
    backgroundColor: '#E8F6EF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  poolStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B756F',
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  routeFrom: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  routeArrow: {
    alignItems: 'center',
    marginVertical: 2,
  },
  routeTo: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  poolStatus: {
    marginLeft: 8,
  },
  fullBadge: {
    backgroundColor: '#95A5A6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  fullBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  availableBadge: {
    backgroundColor: '#51CF66',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  availableBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  poolPricingInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  priceSection: {
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  savingsText: {
    color: '#51CF66',
  },
  poolPassengers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passengerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8,
    borderWidth: 2,
    borderColor: 'white',
  },
  passengerInitial: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
  },
  emptySlot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  passengerCount: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  userPoolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  userPoolText: {
    fontSize: 12,
    color: '#51CF66',
    fontWeight: '500',
    marginLeft: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modelSelector: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  modelOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  activeModelOption: {
    backgroundColor: '#4ECDC4',
  },
  modelOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    textAlign: 'center',
  },
  activeModelOptionText: {
    color: 'white',
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  locationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  locationTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    paddingVertical: 0,
  },
  inputPrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4ECDC4',
  },
  multilineInput: {
    minHeight: 84,
    alignItems: 'flex-start',
  },
  multilineTextInput: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  numberStepper: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  stepperOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: 6,
  },
  activeStepperOption: {
    backgroundColor: '#4ECDC4',
  },
  stepperText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  activeStepperText: {
    color: 'white',
  },
  sliderContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  sliderValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  submitButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  detailSection: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  routeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  routeDetail: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  priceDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  detailValueHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ECDC4',
  },
  detailValueSavings: {
    fontSize: 14,
    fontWeight: '600',
    color: '#51CF66',
  },
  passengerCountDetail: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4ECDC4',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  joinBtn: {
    backgroundColor: '#51CF66',
  },
  leaveBtn: {
    backgroundColor: '#FF6B6B',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
});

export default RidePoolingPanel;
