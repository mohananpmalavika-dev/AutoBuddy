import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { driverSafetyAPI } from '../services/apiClient';

type SafetyScore = 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR';

type BehaviourFlag = {
  flag: string;
  count: number;
};

type PassengerSafetyRating = {
  passengerId: string;
  averageRating: number;
  totalRatings: number;
  safetyScore: SafetyScore;
  reportedIncidents: number;
  warnings: string[];
  lastUpdated?: Date;
  behaviourFlags: BehaviourFlag[];
};

type PassengerSafetyRatingsPanelProps = {
  passengerId?: string;
  onLoad?: (rating: PassengerSafetyRating) => void;
  disabled?: boolean;
};

/**
 * PassengerSafetyRatingsPanel - Show passenger safety ratings for drivers
 * Allows drivers to see safety ratings of passengers before accepting rides
 * Helps drivers identify problematic passengers and decline unsafe bookings
 */

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const normalizeSafetyScore = (value: unknown): SafetyScore => {
  const normalized = String(value || '').trim().toUpperCase();
  if (
    normalized === 'EXCELLENT' ||
    normalized === 'GOOD' ||
    normalized === 'MODERATE' ||
    normalized === 'POOR'
  ) {
    return normalized;
  }
  return 'GOOD';
};

const normalizeSafetyRating = (passengerId: string, payload: any): PassengerSafetyRating => ({
  passengerId,
  averageRating: Number(payload?.averageRating ?? payload?.average_rating ?? payload?.rating ?? 0),
  totalRatings: Number(payload?.totalRatings ?? payload?.total_ratings ?? payload?.total_count ?? 0),
  safetyScore: normalizeSafetyScore(payload?.safetyScore ?? payload?.safety_score ?? payload?.score),
  reportedIncidents: Number(payload?.reportedIncidents ?? payload?.reported_incidents ?? payload?.incident_count ?? 0),
  warnings: Array.isArray(payload?.warnings) ? payload.warnings.map(String) : [],
  lastUpdated: payload?.lastUpdated || payload?.last_updated ? new Date(payload.lastUpdated ?? payload.last_updated) : undefined,
  behaviourFlags: Array.isArray(payload?.behaviourFlags ?? payload?.behavior_flags ?? payload?.flags)
    ? (payload.behaviourFlags ?? payload.behavior_flags ?? payload.flags).map((item: any) => ({
        flag: String(item?.flag ?? item?.name ?? 'driver_report'),
        count: Number(item?.count ?? item?.total ?? 1),
      }))
    : [],
});

export default function PassengerSafetyRatingsPanel({
  passengerId,
  onLoad,
  disabled = false,
}: PassengerSafetyRatingsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [safetyRating, setSafetyRating] = useState<PassengerSafetyRating | null>(null);
  const [error, setError] = useState('');

  const loadPassengerSafetyRating = useCallback(async () => {
    if (!passengerId) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await driverSafetyAPI.getPassengerSafetyRating(passengerId);
      const rating = normalizeSafetyRating(passengerId, response?.rating || response);
      setSafetyRating(rating);
      onLoad?.(rating);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load passenger safety rating'));
    } finally {
      setLoading(false);
    }
  }, [onLoad, passengerId]);

  useEffect(() => {
    if (passengerId && !disabled) {
      const timer = setTimeout(() => {
        loadPassengerSafetyRating();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [disabled, loadPassengerSafetyRating, passengerId]);

  const getSafetyColor = (score: SafetyScore) => {
    switch (score) {
      case 'EXCELLENT':
        return '#34C759';
      case 'GOOD':
        return '#4CAF50';
      case 'MODERATE':
        return '#FFA500';
      case 'POOR':
        return '#FF3B30';
      default:
        return COLORS.text;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!safetyRating) {
    return null;
  }

  const { averageRating, safetyScore, reportedIncidents, behaviourFlags } = safetyRating;
  const safetyColor = getSafetyColor(safetyScore);

  return (
    <View style={[styles.container, SHADOWS.card]}>
      <Text style={styles.title}>Passenger Safety Rating</Text>

      {/* Safety Score */}
      <View style={styles.scoreSection}>
        <View
          style={[
            styles.scoreCircle,
            { borderColor: safetyColor, backgroundColor: `${safetyColor}15` },
          ]}
        >
          <Text style={[styles.scoreText, { color: safetyColor }]}>{safetyScore}</Text>
          <Text style={styles.scoreSubtext}>{averageRating.toFixed(1)}/5</Text>
        </View>

        <View style={styles.scoreInfo}>
          <Text style={styles.scoreLabel}>Safety Assessment</Text>
          <Text style={styles.scoreDescription}>
            Based on {safetyRating.totalRatings} ratings from drivers
          </Text>
          {reportedIncidents > 0 && (
            <Text style={styles.incidentText}>
              ⚠️ {reportedIncidents} incident{reportedIncidents > 1 ? 's' : ''} reported
            </Text>
          )}
        </View>
      </View>

      {/* Behaviour Flags */}
      {behaviourFlags && behaviourFlags.length > 0 && (
        <View style={styles.flagsSection}>
          <Text style={styles.flagsTitle}>Behaviour Patterns</Text>
          {behaviourFlags.map((item, index) => (
            <View key={index} style={styles.flagItem}>
              <Text style={styles.flagEmoji}>⚠️</Text>
              <View style={styles.flagContent}>
                <Text style={styles.flagLabel}>{item.flag.replace(/_/g, ' ').toUpperCase()}</Text>
                <Text style={styles.flagCount}>{item.count} occurrences</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Safety Tips */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>Safety Tips</Text>
        <Text style={styles.tipText}>• Check passenger details before accepting</Text>
        <Text style={styles.tipText}>• Trust your instincts - decline if uncomfortable</Text>
        <Text style={styles.tipText}>• Report unsafe behaviour to support</Text>
        <Text style={styles.tipText}>• Use driver panic button if in danger</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  scoreSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  scoreSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  scoreInfo: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  scoreDescription: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  incidentText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 8,
    fontWeight: '600',
  },
  flagsSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  flagsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  flagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
  },
  flagEmoji: {
    fontSize: 16,
    marginRight: 10,
  },
  flagContent: {
    flex: 1,
  },
  flagLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
    textTransform: 'capitalize',
  },
  flagCount: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  tipsSection: {
    backgroundColor: '#F0F7FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  tipsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 8,
  },
  tipText: {
    fontSize: 12,
    color: COLORS.text,
    marginBottom: 6,
    lineHeight: 16,
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    color: '#C41C00',
    fontSize: 12,
    fontWeight: '500',
  },
});
