import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Animated,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { GlassmorphicCard } from '../components/GlassmorphicCard';
import { LiveETACard } from '../components/LiveETACard';
import { DynamicPricingVisualization } from '../components/DynamicPricingVisualization';
import { AIAssistantAvatar } from '../components/AIAssistantAvatar';
import { useDynamicPricing } from '../hooks/useDynamicPricing';

interface LiveMapHeroProps {
  destination?: string;
  pickupLocation?: string;
  userId?: string;
}

/**
 * Premium Live Map Hero Screen
 * Shows interactive map with real-time ETA, pricing, and AI assistant
 */
export const LiveMapHeroScreen: React.FC<LiveMapHeroProps> = ({
  destination = 'Ernakulathappan Palace',
  pickupLocation = 'Fort Kochi',
  userId = 'user-123',
}) => {
  const [showPricing, setShowPricing] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const mapScaleAnim = useRef(new Animated.Value(0.95)).current;
  const headerFadeAnim = useRef(new Animated.Value(0)).current;

  const { pricing, eta, calculatePricing, getSurgeStatus } = useDynamicPricing();

  // Simulate fetching pricing on load
  useEffect(() => {
    const mockPickup = { latitude: 9.966, longitude: 76.254 };
    const mockDropoff = { latitude: 9.96, longitude: 76.27 };
    calculatePricing(mockPickup, mockDropoff, 'economy', userId);

    // Fade in header
    Animated.timing(headerFadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [userId, calculatePricing]);

  return (
    <View style={styles.container}>
      {/* Animated Map Background */}
      <Animated.View
        style={[
          styles.mapContainer,
          { transform: [{ scale: mapScaleAnim }] },
        ]}
      >
        {/* Placeholder for actual MapView */}
        <View style={styles.mapPlaceholder}>
          <MaterialIcons name="map" size={80} color="rgba(33, 150, 243, 0.3)" />
          <Text style={styles.mapPlaceholderText}>Live Map</Text>
        </View>

        {/* Map overlay gradient */}
        <View style={styles.mapOverlay} />
      </Animated.View>

      {/* Floating Header Card */}
      <Animated.View
        style={[
          styles.headerCard,
          { opacity: headerFadeAnim },
        ]}
      >
        <GlassmorphicCard intensity="strong" style={styles.header}>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.fromLabel}>From</Text>
              <Text style={styles.fromText} numberOfLines={1}>
                {pickupLocation}
              </Text>
            </View>
            <Pressable style={styles.swapButton}>
              <MaterialIcons name="unfold-more" size={20} color="#2196F3" />
            </Pressable>
            <View style={styles.toContainer}>
              <Text style={styles.toLabel}>To</Text>
              <Text style={styles.toText} numberOfLines={1}>
                {destination}
              </Text>
            </View>
          </View>
        </GlassmorphicCard>
      </Animated.View>

      {/* Content Below Map */}
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Live ETA Card */}
        {eta && (
          <LiveETACard
            destination={destination}
            etaMinutes={eta.eta_minutes}
            distance={eta.distance_km}
            driverName={eta.driver_name}
            driverRating={eta.driver_rating}
          />
        )}

        {/* Pricing Card */}
        {pricing && (
          <Pressable onPress={() => setShowPricing(!showPricing)}>
            <DynamicPricingVisualization
              pricing={{
                baseFare: pricing.base_fare,
                distanceFare: pricing.distance_fare,
                surgeFare: pricing.surge_fare,
                discount: pricing.discount,
                taxes: pricing.taxes,
                total: pricing.total,
              }}
              isExpanded={showPricing}
              onToggle={() => setShowPricing(!showPricing)}
            />
          </Pressable>
        )}

        {/* Quick Info Cards */}
        <View style={styles.quickInfoSection}>
          <GlassmorphicCard intensity="light" style={styles.infoCard}>
            <View style={styles.infoCardContent}>
              <MaterialIcons name="bolt" size={20} color="#FF9800" />
              <Text style={styles.infoCardText}>
                {pricing?.is_surge_active
                  ? `${(pricing.surge_multiplier * 100).toFixed(0)}% Surge Active`
                  : 'Normal Pricing'}
              </Text>
            </View>
          </GlassmorphicCard>

          <GlassmorphicCard intensity="light" style={styles.infoCard}>
            <View style={styles.infoCardContent}>
              <MaterialIcons name="shield" size={20} color="#4CAF50" />
              <Text style={styles.infoCardText}>Safety Features</Text>
            </View>
          </GlassmorphicCard>
        </View>

        {/* CTA Buttons */}
        <View style={styles.ctaSection}>
          <Pressable style={styles.primaryButton}>
            <MaterialIcons name="check-circle" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Book Ride</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => setShowAI(!showAI)}
          >
            <MaterialIcons name="smart-toy" size={20} color="#2196F3" />
            <Text style={styles.secondaryButtonText}>Ask AI</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* AI Assistant */}
      {showAI && (
        <AIAssistantAvatar
          isActive={showAI}
          message="I'll help you find the perfect ride. Need schedule or payment options?"
          onDismiss={() => setShowAI(false)}
        />
      )}
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    zIndex: 0,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: 'rgba(33, 150, 243, 0.5)',
    marginTop: 8,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.95))',
  },
  headerCard: {
    position: 'absolute',
    top: 40,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fromLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
  },
  fromText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  swapButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toContainer: {
    flex: 1,
  },
  toLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
  },
  toText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  contentScroll: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    zIndex: 5,
  },
  contentContainer: {
    paddingHorizontal: 0,
    paddingTop: 16,
    paddingBottom: 40,
  },
  quickInfoSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  infoCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  infoCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  ctaSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 16,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 4,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  secondaryButtonText: {
    color: '#2196F3',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default LiveMapHeroScreen;
