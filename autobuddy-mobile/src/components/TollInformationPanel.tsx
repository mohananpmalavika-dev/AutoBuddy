import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { OptimizedRoute } from '../hooks/useRouteOptimization';
import ETACalculator from '../utils/etaCalculations';

interface TollInformationPanelProps {
  route: OptimizedRoute;
  tollAmount?: number;
  timeSavings?: number;
  fuelCostReduction?: number;
  onSelectRoute?: () => void;
}

interface TollMetrics {
  tollAmount: number;
  timeSavings: number;
  fuelCostReduction: number;
  roi: number;
  roiText: string;
  isWorthToll: boolean;
}

const FUEL_COST_PER_KM = 6;
const FUEL_EFFICIENCY = 12;
const AVG_TIME_VALUE_PER_HOUR = 300;

export const TollInformationPanel: React.FC<TollInformationPanelProps> = ({
  route,
  tollAmount = 0,
  timeSavings = 300,
  fuelCostReduction = 0,
  onSelectRoute,
}) => {
  const metrics = useMemo<TollMetrics>(() => {
    const fuelReduction =
      fuelCostReduction || (route.optimization?.savedDistance || 0) * (FUEL_COST_PER_KM / FUEL_EFFICIENCY);
    const timeSavingsValue = (timeSavings / 3600) * AVG_TIME_VALUE_PER_HOUR;
    const totalBenefit = fuelReduction + timeSavingsValue;
    const roi = totalBenefit - tollAmount;
    const roiPercent = tollAmount > 0 ? ((roi / tollAmount) * 100).toFixed(0) : 0;

    return {
      tollAmount,
      timeSavings,
      fuelCostReduction: fuelReduction,
      roi,
      roiText: `Save ₹${Math.round(roi)} vs toll (${roiPercent}% value)`,
      isWorthToll: roi > 0,
    };
  }, [route, tollAmount, timeSavings, fuelCostReduction]);

  const eta = ETACalculator.calculateFromRoute(route);
  const timeSavingsMinutes = Math.round(metrics.timeSavings / 60);

  if (tollAmount === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.noTollBadge}>
          <Text style={styles.noTollText}>✓ No tolls on this route</Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, metrics.isWorthToll && styles.containerRecommended]}
      onPress={onSelectRoute}
      activeOpacity={0.7}
    >
      {metrics.isWorthToll && (
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedText}>🚀 RECOMMENDED</Text>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.mainTitle}>Toll Route Analysis</Text>
      </View>

      <View style={styles.metricsGrid}>
        {/* Toll Cost */}
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>💳 Toll Cost</Text>
          <Text style={styles.metricValue}>₹{Math.round(metrics.tollAmount)}</Text>
        </View>

        {/* Time Savings */}
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>⏱️ Time Saved</Text>
          <Text style={styles.metricValue}>{timeSavingsMinutes} min</Text>
        </View>

        {/* Fuel Savings */}
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>⛽ Fuel Saved</Text>
          <Text style={styles.metricValue}>₹{Math.round(metrics.fuelCostReduction)}</Text>
        </View>

        {/* ROI */}
        <View style={[styles.metricCard, metrics.roi > 0 ? styles.metricCardPositive : styles.metricCardNegative]}>
          <Text style={styles.metricLabel}>💰 Net Benefit</Text>
          <Text style={metrics.roi > 0 ? styles.metricValuePositive : styles.metricValueNegative}>
            ₹{Math.round(Math.abs(metrics.roi))}
          </Text>
        </View>
      </View>

      <View style={styles.breakdownSection}>
        <Text style={styles.breakdownTitle}>Why this toll route?</Text>

        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Distance:</Text>
          <Text style={styles.breakdownValue}>{route.totalDistance.toFixed(1)} km</Text>
        </View>

        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Time:</Text>
          <Text style={styles.breakdownValue}>{Math.round(eta.totalETA / 60)} min</Text>
        </View>

        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Optimization:</Text>
          <Text style={styles.breakdownValue}>{route.optimization?.percentageOptimized || 0}% optimized</Text>
        </View>

        {route.traffic && (
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Traffic:</Text>
            <Text style={[styles.breakdownValue, styles.trafficLevel]}>
              {route.traffic.level.toUpperCase()} ({Math.round(route.traffic.delay / 60)} min)
            </Text>
          </View>
        )}
      </View>

      <View style={styles.roiMessage}>
        <Text style={metrics.isWorthToll ? styles.roiTextPositive : styles.roiTextNegative}>
          {metrics.roiText}
        </Text>
      </View>

      {onSelectRoute && (
        <TouchableOpacity style={styles.selectButton} onPress={onSelectRoute}>
          <Text style={styles.selectButtonText}>Select This Route</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  containerRecommended: {
    borderColor: '#4CAF50',
    borderWidth: 2,
    backgroundColor: '#F1F8F5',
  },
  noTollBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  noTollText: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '600',
  },
  recommendedBadge: {
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  recommendedText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  header: {
    marginBottom: 12,
  },
  mainTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  metricCardPositive: {
    backgroundColor: '#E8F5E9',
  },
  metricCardNegative: {
    backgroundColor: '#FFEBEE',
  },
  metricLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
  },
  metricValuePositive: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2E7D32',
  },
  metricValueNegative: {
    fontSize: 16,
    fontWeight: '700',
    color: '#C62828',
  },
  breakdownSection: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#212121',
  },
  trafficLevel: {
    color: '#FF9800',
  },
  roiMessage: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  roiTextPositive: {
    color: '#1976D2',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  roiTextNegative: {
    color: '#F57C00',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  selectButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  selectButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default TollInformationPanel;
