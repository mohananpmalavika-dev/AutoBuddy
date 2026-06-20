import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { OptimizedRoute } from '../hooks/useRouteOptimization';
import ETACalculator from '../utils/etaCalculations';

interface RouteComparisonCardProps {
  routes: OptimizedRoute[];
  selectedRouteId?: string;
  onSelectRoute: (routeId: string) => void;
  tollRoutes?: Record<string, { amount: number; timeSavings: number }>;
}

interface RouteComparison {
  route: OptimizedRoute;
  eta: number;
  etaMinutes: number;
  hasToll: boolean;
  tollAmount: number;
  timeSavings: number;
  fuelCost: number;
  isRecommended: boolean;
  recommendation: string;
}

const FUEL_COST_PER_KM = 6;
const FUEL_EFFICIENCY = 12;
const AVG_TIME_VALUE_PER_HOUR = 300;

export const RouteComparisonCard: React.FC<RouteComparisonCardProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
  tollRoutes = {},
}) => {
  const comparisons = useMemo<RouteComparison[]>(() => {
    if (!routes.length) return [];

    const comps = routes.map((route) => {
      const eta = ETACalculator.calculateFromRoute(route);
      const etaMinutes = Math.round(eta.totalETA / 60);
      const fuelCost = (route.totalDistance / FUEL_EFFICIENCY) * FUEL_COST_PER_KM;
      const tollData = tollRoutes[route.id] || { amount: 0, timeSavings: 0 };

      return {
        route,
        eta: eta.totalETA,
        etaMinutes,
        hasToll: tollData.amount > 0,
        tollAmount: tollData.amount,
        timeSavings: tollData.timeSavings,
        fuelCost,
        isRecommended: false,
        recommendation: '',
      };
    });

    if (comps.length > 0) {
      const fastestETA = Math.min(...comps.map((c) => c.eta));
      const cheapestFuel = Math.min(...comps.map((c) => c.fuelCost));

      const recommended = comps.reduce((best, current) => {
        const currentROI = current.fuelCost + (current.timeSavings / 3600) * AVG_TIME_VALUE_PER_HOUR - current.tollAmount;
        const bestROI = best.fuelCost + (best.timeSavings / 3600) * AVG_TIME_VALUE_PER_HOUR - best.tollAmount;

        return currentROI > bestROI ? current : best;
      });

      recommended.isRecommended = true;
      recommended.recommendation =
        recommended.eta === fastestETA
          ? '⚡ Fastest'
          : recommended.fuelCost === cheapestFuel
            ? '💚 Cheapest'
            : '🎯 Best Value';
    }

    return comps;
  }, [routes, tollRoutes]);

  if (!routes.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No routes available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Route Options</Text>
        <Text style={styles.subtitle}>{routes.length} routes available</Text>
      </View>

      <FlatList
        data={comparisons}
        scrollEnabled={false}
        renderItem={({ item, index }) => (
          <RouteComparisonItem
            comparison={item}
            index={index}
            isSelected={selectedRouteId === item.route.id}
            onSelect={() => onSelectRoute(item.route.id)}
          />
        )}
        keyExtractor={(item) => item.route.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
};

interface RouteComparisonItemProps {
  comparison: RouteComparison;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

const RouteComparisonItem: React.FC<RouteComparisonItemProps> = ({
  comparison,
  index,
  isSelected,
  onSelect,
}) => {
  const routeLetter = String.fromCharCode(65 + index);
  const totalCost = comparison.fuelCost + comparison.tollAmount;
  const timeSavingsValue = (comparison.timeSavings / 3600) * AVG_TIME_VALUE_PER_HOUR;
  const netBenefit = comparison.fuelCost + timeSavingsValue - comparison.tollAmount;

  return (
    <TouchableOpacity
      style={[styles.routeCard, isSelected && styles.routeCardSelected, comparison.isRecommended && styles.routeCardRecommended]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      {comparison.isRecommended && (
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedText}>{comparison.recommendation}</Text>
        </View>
      )}

      {isSelected && (
        <View style={styles.selectedBadge}>
          <Text style={styles.selectedText}>✓ Selected</Text>
        </View>
      )}

      <View style={styles.routeHeader}>
        <Text style={styles.routeLetter}>Route {routeLetter}</Text>
        <Text style={styles.etaText}>{comparison.etaMinutes} min</Text>
      </View>

      <View style={styles.routeMetrics}>
        {/* Distance */}
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Distance</Text>
          <Text style={styles.metricValue}>{comparison.route.totalDistance.toFixed(1)} km</Text>
        </View>

        {/* Fuel Cost */}
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Fuel</Text>
          <Text style={styles.metricValue}>₹{Math.round(comparison.fuelCost)}</Text>
        </View>

        {/* Toll Cost */}
        {comparison.tollAmount > 0 && (
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Toll</Text>
            <Text style={styles.metricValueToll}>₹{Math.round(comparison.tollAmount)}</Text>
          </View>
        )}

        {/* Traffic Level */}
        {comparison.route.traffic && (
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Traffic</Text>
            <Text style={[styles.metricValue, getTrafficStyle(comparison.route.traffic.level)]}>
              {comparison.route.traffic.level.charAt(0).toUpperCase() + comparison.route.traffic.level.slice(1)}
            </Text>
          </View>
        )}
      </View>

      {/* Summary Row */}
      <View style={styles.summaryRow}>
        <View style={styles.costSummary}>
          <Text style={styles.totalLabel}>Total Cost</Text>
          <Text style={styles.totalCost}>₹{Math.round(totalCost)}</Text>
        </View>

        <View style={[styles.benefitSummary, netBenefit > 0 ? styles.benefitPositive : styles.benefitNeutral]}>
          <Text style={styles.benefitLabel}>vs Route A</Text>
          <Text style={netBenefit > 0 ? styles.benefitValue : styles.benefitValueNeutral}>
            {netBenefit > 0 ? '+' : ''}₹{Math.round(netBenefit)}
          </Text>
        </View>
      </View>

      {comparison.hasToll && comparison.timeSavings > 0 && (
        <View style={styles.tollBenefit}>
          <Text style={styles.tollBenefitText}>
            💳 Toll saves {Math.round(comparison.timeSavings / 60)} min + ₹{Math.round(timeSavingsValue - comparison.tollAmount)}
          </Text>
        </View>
      )}

      {comparison.route.optimization && comparison.route.optimization.percentageOptimized > 10 && (
        <View style={styles.optimizationBadge}>
          <Text style={styles.optimizationText}>✨ {comparison.route.optimization.percentageOptimized}% optimized</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const getTrafficStyle = (level: string) => {
  switch (level) {
    case 'low':
      return { color: '#4CAF50' };
    case 'moderate':
      return { color: '#FF9800' };
    case 'high':
      return { color: '#FF6F00' };
    case 'severe':
      return { color: '#C62828' };
    default:
      return { color: '#666' };
  }
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  separator: {
    height: 12,
  },
  routeCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    position: 'relative',
  },
  routeCardSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#F0F7FF',
  },
  routeCardRecommended: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F5',
  },
  recommendedBadge: {
    position: 'absolute',
    top: -8,
    right: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recommendedText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  selectedBadge: {
    position: 'absolute',
    top: -8,
    left: 12,
    backgroundColor: '#2196F3',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectedText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  routeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  routeLetter: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
  },
  etaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  routeMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  metricItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFF',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  metricLabel: {
    fontSize: 10,
    color: '#999',
    fontWeight: '600',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#212121',
  },
  metricValueToll: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F57C00',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  costSummary: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  totalLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    marginBottom: 2,
  },
  totalCost: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
  },
  benefitSummary: {
    flex: 1,
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  benefitPositive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  benefitNeutral: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  benefitLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    marginBottom: 2,
  },
  benefitValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
  },
  benefitValueNeutral: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
  },
  tollBenefit: {
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  tollBenefitText: {
    fontSize: 11,
    color: '#1565C0',
    fontWeight: '600',
  },
  optimizationBadge: {
    backgroundColor: '#F3E5F5',
    borderRadius: 6,
    padding: 6,
    alignItems: 'center',
  },
  optimizationText: {
    fontSize: 11,
    color: '#6A1B9A',
    fontWeight: '600',
  },
});

export default RouteComparisonCard;
