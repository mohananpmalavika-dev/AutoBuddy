/**
 * Ride Booking Screen - Main booking interface with AI Travel Intent
 * Displays the unified AI-powered booking experience
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTravelIntent } from '../hooks/useTravelIntent';

interface RideBookingScreenProps {
  navigation?: any;
}

const RideBookingScreen: React.FC<RideBookingScreenProps> = ({ navigation }) => {
  const travelIntent = useTravelIntent();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');

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

  const handleQuickBook = async (suggestion: any) => {
    try {
      await travelIntent.quickBook(
        suggestion.id,
        travelIntent.selectedVehicleType,
        travelIntent.numPassengers
      );
      // Navigate to booking confirmation
      if (navigation) {
        navigation.navigate('BookingConfirmation');
      }
    } catch (error) {
      console.error('Booking error:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Book a Ride</Text>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'ai' && styles.activeTab]}
            onPress={() => setActiveTab('ai')}
          >
            <MaterialIcons name="auto-awesome" size={20} color={activeTab === 'ai' ? '#2196F3' : '#999'} />
            <Text style={[styles.tabText, activeTab === 'ai' && styles.activeTabText]}>AI Booking</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'manual' && styles.activeTab]}
            onPress={() => setActiveTab('manual')}
          >
            <MaterialIcons name="directions-car" size={20} color={activeTab === 'manual' ? '#2196F3' : '#999'} />
            <Text style={[styles.tabText, activeTab === 'manual' && styles.activeTabText]}>Manual Booking</Text>
          </TouchableOpacity>
        </View>

        {/* AI Booking Tab */}
        {activeTab === 'ai' && (
          <View style={styles.content}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AI Travel Intent</Text>
              <Text style={styles.sectionDescription}>
                Describe your trip naturally and we'll find the best ride for you
              </Text>

              <View style={styles.featureCard}>
                <MaterialIcons name="bulb" size={32} color="#FFC107" />
                <Text style={styles.featureTitle}>Smart Suggestions</Text>
                <Text style={styles.featureText}>
                  Our AI understands your destination and preferences to suggest the best ride type
                </Text>
              </View>

              <View style={styles.featureCard}>
                <MaterialIcons name="trending-up" size={32} color="#4CAF50" />
                <Text style={styles.featureTitle}>Trending Routes</Text>
                <Text style={styles.featureText}>
                  See popular destinations and save time booking common trips
                </Text>
              </View>

              <View style={styles.featureCard}>
                <MaterialIcons name="flash-on" size={32} color="#FF9800" />
                <Text style={styles.featureTitle}>Quick Book</Text>
                <Text style={styles.featureText}>
                  Book rides in seconds with smart defaults based on your preferences
                </Text>
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => navigation?.navigate('TravelIntent')}
              >
                <MaterialIcons name="arrow-forward" size={24} color="#FFF" />
                <Text style={styles.buttonText}>Start AI Booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Manual Booking Tab */}
        {activeTab === 'manual' && (
          <View style={styles.content}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Traditional Booking</Text>
              <Text style={styles.sectionDescription}>
                Book a ride with specific pickup and dropoff locations
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation?.navigate('ManualBooking')}
              >
                <MaterialIcons name="add-location" size={24} color="#2196F3" />
                <Text style={styles.secondaryButtonText}>Set Locations</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Loading State */}
        {travelIntent.loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>Loading suggestions...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#2196F3',
  },
  tabText: {
    fontSize: 14,
    color: '#999',
  },
  activeTabText: {
    color: '#2196F3',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  featureCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginTop: 8,
  },
  featureText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  secondaryButton: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
});

export default RideBookingScreen;
