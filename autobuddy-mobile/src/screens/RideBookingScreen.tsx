/**
 * Ride Booking Screen - Default: PassengerSingleScreenBooking
 * Other booking methods accessible via menu
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTravelIntent } from '../hooks/useTravelIntent';
import { SingleScreenBooking } from '../components/PassengerSingleScreenBooking';

interface RideBookingScreenProps {
  navigation?: any;
}

interface BookingOption {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  route?: string;
}

const BOOKING_OPTIONS: BookingOption[] = [
  {
    id: 'single-screen',
    title: 'Quick Book',
    description: 'Fast & simple - destination & vehicle',
    icon: 'flash-on',
    color: '#FF6B6B',
    route: 'SingleScreen',
  },
  {
    id: 'ai',
    title: 'AI Booking',
    description: 'Natural language - describe your trip',
    icon: 'auto-awesome',
    color: '#4ECDC4',
    route: 'TravelIntent',
  },
  {
    id: 'manual',
    title: 'Manual Booking',
    description: 'Traditional - precise locations',
    icon: 'place',
    color: '#95E1D3',
    route: 'ManualBooking',
  },
  {
    id: 'scheduled',
    title: 'Scheduled Rides',
    description: 'Book rides in advance',
    icon: 'schedule',
    color: '#F9CA24',
    route: 'ScheduledRides',
  },
];

const RideBookingScreen: React.FC<RideBookingScreenProps> = ({ navigation }) => {
  const travelIntent = useTravelIntent();
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      await travelIntent.loadTrendingDestinations();
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadInitialData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleBookRide = async (rideData: any) => {
    try {
      console.log('Booking ride:', rideData);
      if (navigation) {
        navigation.navigate('BookingConfirmation', { rideData });
      }
    } catch (error) {
      console.error('Booking error:', error);
    }
  };

  const handleMenuItemPress = (option: BookingOption) => {
    setShowMenu(false);
    
    // If it's the single screen (default), just close menu
    if (option.id === 'single-screen') {
      return;
    }
    
    // Navigate to the selected booking method
    if (option.route && navigation) {
      navigation.navigate(option.route);
    }
  };

  const renderMenuOption = ({ item }: { item: BookingOption }) => (
    <TouchableOpacity
      style={[styles.menuOption, { borderLeftColor: item.color }]}
      onPress={() => handleMenuItemPress(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.menuIconContainer, { backgroundColor: item.color + '20' }]}>
        <MaterialIcons name={item.icon as any} size={28} color={item.color} />
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuTitle}>{item.title}</Text>
        <Text style={styles.menuDescription}>{item.description}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#999" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Book a Ride</Text>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setShowMenu(!showMenu)}
          >
            <MaterialIcons name="more-vert" size={28} color="#2196F3" />
          </TouchableOpacity>
        </View>

        {/* Main Content - Default: SingleScreenBooking */}
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          style={styles.scrollContent}
        >
          <SingleScreenBooking
            onBookRide={handleBookRide}
            loading={travelIntent.loading}
          />

          {/* Quick Tips Section */}
          <View style={styles.tipsSection}>
            <Text style={styles.tipsTitle}>💡 Quick Tips</Text>
            <Text style={styles.tipText}>• Enter your destination to get instant fare estimates</Text>
            <Text style={styles.tipText}>• Select your preferred vehicle type</Text>
            <Text style={styles.tipText}>• Check the "more options" menu for other booking methods</Text>
          </View>
        </ScrollView>

        {/* Floating Menu Button Badge */}
        {!showMenu && (
          <View style={styles.menuBadge}>
            <MaterialIcons name="info" size={16} color="#FFF" />
            <Text style={styles.menuBadgeText}>More options</Text>
          </View>
        )}
      </View>

      {/* Booking Options Menu Modal */}
      <Modal
        visible={showMenu}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMenu(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Booking Methods</Text>
              <TouchableOpacity onPress={() => setShowMenu(false)}>
                <MaterialIcons name="close" size={28} color="#000" />
              </TouchableOpacity>
            </View>

            {/* Current Method Indicator */}
            <View style={styles.currentMethodBox}>
              <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
              <Text style={styles.currentMethodText}>Currently using: Quick Book</Text>
            </View>

            {/* Menu Options List */}
            <FlatList
              data={BOOKING_OPTIONS}
              renderItem={renderMenuOption}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              style={styles.optionsList}
            />

            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowMenu(false)}
            >
              <Text style={styles.closeButtonText}>Continue with Quick Book</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Loading State */}
      {travelIntent.loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Preparing ride options...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  menuButton: {
    padding: 8,
  },
  scrollContent: {
    flex: 1,
  },
  tipsSection: {
    backgroundColor: '#F0F8FF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#555',
    marginBottom: 6,
    lineHeight: 18,
  },
  menuBadge: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#2196F3',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  menuBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  currentMethodBox: {
    backgroundColor: '#E8F5E9',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  currentMethodText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '500',
  },
  optionsList: {
    marginBottom: 16,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  menuIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 12,
    color: '#666',
  },
  closeButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
});

export default RideBookingScreen;
