/**
 * Predictive Destination Card - Shows AI-predicted destinations with one-tap booking
 * Location: src/components/PredictiveDestinationCard.tsx
 * 
 * Features:
 * - Shows top 3 AI-predicted destinations
 * - Confidence scores visualized
 * - One-tap booking integration
 * - Smart time-of-day context
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../lib/api-client';
import { useNotifications } from '../contexts/NotificationContext';

interface PredictedDestination {
  destination_type: string;
  confidence_score: number;
  name: string;
  emoji: string;
  latitude: number;
  longitude: number;
  color: string;
}

interface PredictiveDestinationCardProps {
  token: string;
  userId: string;
  onSelectDestination?: (destination: PredictedDestination) => void;
  onQuickBook?: (destination: PredictedDestination) => void;
}

const PredictiveDestinationCard: React.FC<PredictiveDestinationCardProps> = ({
  token,
  userId,
  onSelectDestination,
  onQuickBook,
}) => {
  const notificationContext = useNotifications() as any;
  const addNotification = notificationContext?.addNotification || (() => {});
  const [predictions, setPredictions] = useState<PredictedDestination[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeContext, setTimeContext] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPredictions();
    // Refresh predictions every 30 minutes
    const interval = setInterval(loadPredictions, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadPredictions = async () => {
    try {
      setLoading(true);

      // Get predictions from backend
      const response = await apiRequest('/api/ai/predict-destination', {
        method: 'POST',
        token,
        body: {
          timestamp: new Date().toISOString(),
        },
      });

      if (response && (response as any).ok) {
        const data = response as any;
        setPredictions(data.predictions || []);
        setTimeContext(data.time_bucket || 'afternoon');

        // Animate in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }).start();
      }
    } catch (error) {
      console.error('Error loading predictions:', error);
      if (addNotification) {
        addNotification({
          title: 'Prediction Error',
          message: 'Could not load destination predictions',
          type: 'warning',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickBook = async (destination: PredictedDestination) => {
    try {
      if (onQuickBook) {
        onQuickBook(destination);
      } else if (addNotification) {
        addNotification({
          title: `Going to ${destination.name}?`,
          message: `${destination.emoji} One-tap booking available`,
          type: 'info',
        });
      }
    } catch (error) {
      Alert.alert('Booking Error', 'Could not book ride');
    }
  };

  const getConfidenceBar = (score: number) => {
    return (
      <View style={styles.confidenceContainer}>
        <View style={[styles.confidenceBar, { width: `${score}%` }]} />
      </View>
    );
  };

  const getTimeGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning!';
    if (hour < 18) return 'Good Afternoon!';
    return 'Good Evening!';
  };

  if (loading && predictions.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4338CA" />
      </View>
    );
  }

  if (predictions.length === 0) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{getTimeGreeting()}</Text>
          <Text style={styles.subtitle}>Where would you like to go?</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => {
            setRefreshing(true);
            loadPredictions().finally(() => setRefreshing(false));
          }}
          disabled={refreshing}
        >
          <MaterialCommunityIcons
            name="refresh"
            size={20}
            color="#4338CA"
            style={refreshing ? { opacity: 0.5 } : {}}
          />
        </TouchableOpacity>
      </View>

      {/* Predictions Grid */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.predictionsScroll}
        contentContainerStyle={styles.predictionsContainer}
      >
        {predictions.map((destination, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.predictionCard, { borderColor: destination.color }]}
            onPress={() => handleQuickBook(destination)}
            activeOpacity={0.7}
          >
            {/* Card Background Accent */}
            <View
              style={[
                styles.cardAccent,
                { backgroundColor: destination.color, opacity: 0.1 },
              ]}
            />

            {/* Emoji & Name */}
            <Text style={styles.emoji}>{destination.emoji}</Text>
            <Text style={styles.destinationName}>{destination.name}</Text>

            {/* Confidence Score */}
            <View style={styles.scoreSection}>
              <Text style={styles.scoreLabel}>
                {destination.confidence_score}% match
              </Text>
              {getConfidenceBar(destination.confidence_score)}
            </View>

            {/* Quick Book Button */}
            <TouchableOpacity
              style={[
                styles.quickBookButton,
                { backgroundColor: destination.color },
              ]}
              onPress={() => handleQuickBook(destination)}
            >
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
              <Text style={styles.quickBookText}>Book Now</Text>
            </TouchableOpacity>

            {/* Rank Badge */}
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{index === 0 ? '⭐' : index === 1 ? '⭐⭐' : '⭐⭐⭐'}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Smart Tips */}
      <View style={styles.tipsSection}>
        <MaterialCommunityIcons name="lightbulb" size={16} color="#F59E0B" />
        <Text style={styles.tipsText}>
          {timeContext === 'morning_commute'
            ? 'Usual office time'
            : timeContext === 'evening_commute'
              ? 'Going home soon'
              : timeContext === 'lunch'
                ? 'Lunch break time'
                : 'Based on your routine'}
        </Text>
      </View>
    </Animated.View>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2.5; // Fit ~2.5 cards

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    marginHorizontal: 0,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  predictionsScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  predictionsContainer: {
    gap: 12,
  },
  predictionCard: {
    width: CARD_WIDTH,
    borderRadius: 14,
    backgroundColor: '#FFF',
    borderWidth: 2,
    padding: 14,
    justifyContent: 'space-between',
    minHeight: 200,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 80,
    height: 80,
    borderBottomLeftRadius: 14,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  destinationName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 10,
  },
  scoreSection: {
    marginBottom: 12,
  },
  scoreLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 6,
  },
  confidenceContainer: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceBar: {
    height: '100%',
    backgroundColor: '#4338CA',
    borderRadius: 3,
  },
  quickBookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    marginBottom: 8,
  },
  quickBookText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  rankBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  rankText: {
    fontSize: 12,
  },
  tipsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    gap: 8,
  },
  tipsText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
    flex: 1,
  },
});

export default PredictiveDestinationCard;
