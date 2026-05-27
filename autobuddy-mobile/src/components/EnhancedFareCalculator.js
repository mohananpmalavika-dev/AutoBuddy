import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';

/**
 * EnhancedFareCalculator Component
 * 
 * Quick preset buttons + collapsible advanced settings.
 * Addresses Issue #8: Fare Calculator Usability
 * 
 * Props:
 *   - fareConfig: {base_fare, per_km_rate, surge_multiplier, night_multiplier, minimum_fare}
 *   - onCalculate: (distance, passengers, time) => void
 *   - loading: boolean
 *   - expanded: boolean
 *   - onToggleExpand: (boolean) => void
 */
export default function EnhancedFareCalculator({
  fareConfig = null,
  onCalculate,
  loading = false,
  expanded = false,
  onToggleExpand,
}) {
  const [distance, setDistance] = useState('5');
  const [passengers, setPassengers] = useState('1');
  const [selectedTime, setSelectedTime] = useState('day');

  const handleToggleExpand = useCallback(() => {
    if (typeof onToggleExpand === 'function') {
      onToggleExpand(!expanded);
    }
  }, [expanded, onToggleExpand]);

  const estimatedFare = useMemo(() => {
    if (!fareConfig || !distance) return null;

    let baseFare = parseFloat(fareConfig.base_fare || 0);
    let perKmRate = parseFloat(fareConfig.per_km_rate || 0);
    let km = parseFloat(distance) || 0;
    let fare = baseFare + (km * perKmRate);

    // Apply multipliers
    if (selectedTime === 'night') {
      fare *= parseFloat(fareConfig.night_multiplier || 1);
    }
    if (selectedTime === 'peak') {
      fare *= parseFloat(fareConfig.surge_multiplier || 1);
    }

    // Apply minimum fare
    const minimumFare = parseFloat(fareConfig.minimum_fare || 0);
    fare = Math.max(fare, minimumFare);

    return Math.round(fare * 100) / 100;
  }, [fareConfig, distance, selectedTime]);

  const presets = useMemo(() => [
    { label: 'Short (2km)', distance: '2', time: 'day' },
    { label: 'Medium (5km)', distance: '5', time: 'day' },
    { label: 'Long (15km)', distance: '15', time: 'day' },
    { label: 'Night Short', distance: '2', time: 'night' },
    { label: 'Peak Hour', distance: '5', time: 'peak' },
  ], []);

  const handlePresetSelect = useCallback((preset) => {
    setDistance(preset.distance);
    setSelectedTime(preset.time);
    if (typeof onCalculate === 'function') {
      onCalculate(preset.distance, passengers, preset.time);
    }
  }, [passengers, onCalculate]);

  const handleCalculate = useCallback(() => {
    if (typeof onCalculate === 'function') {
      onCalculate(distance, passengers, selectedTime);
    }
  }, [distance, passengers, selectedTime, onCalculate]);

  if (!fareConfig) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Fare calculator unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Compact View Header */}
      {!expanded && (
        <TouchableOpacity
          style={styles.compactHeader}
          onPress={handleToggleExpand}>
          <View style={styles.compactInfo}>
            <Text style={styles.compactIcon}>💡</Text>
            <View>
              <Text style={styles.compactTitle}>Fare Calculator</Text>
              <Text style={styles.compactDistance}>
                {distance}km ≈ ₹{estimatedFare || '0'}
              </Text>
            </View>
          </View>
          <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      )}

      {/* Expanded View */}
      {expanded && (
        <View style={styles.expandedContent}>
          <View style={styles.expandedHeader}>
            <Text style={styles.expandedTitle}>Fare Calculator</Text>
            <TouchableOpacity onPress={handleToggleExpand}>
              <Text style={styles.collapseIcon}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Presets */}
          <View style={styles.presetsContainer}>
            <Text style={styles.presetsLabel}>Quick Presets</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetsScroll}
              scrollEventThrottle={16}>
              {presets.map((preset, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.presetButton}
                  onPress={() => handlePresetSelect(preset)}>
                  <Text style={styles.presetButtonText}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Detailed Inputs */}
          <View style={styles.inputsContainer}>
            {/* Distance Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Distance (km)</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={distance}
                  onChangeText={setDistance}
                  keyboardType="decimal-pad"
                  placeholder="Enter distance"
                  placeholderTextColor={COLORS.textMuted}
                />
                <Text style={styles.inputUnit}>km</Text>
              </View>
            </View>

            {/* Passengers Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Passengers</Text>
              <View style={styles.passengerCounter}>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => setPassengers(Math.max(1, parseInt(passengers) - 1).toString())}>
                  <Text style={styles.counterButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>{passengers}</Text>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => setPassengers((parseInt(passengers) + 1).toString())}>
                  <Text style={styles.counterButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Time Period Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Time Period</Text>
              <View style={styles.timeButtonsRow}>
                {[
                  { key: 'day', label: 'Day' },
                  { key: 'peak', label: 'Peak' },
                  { key: 'night', label: 'Night' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.timeButton,
                      selectedTime === option.key && styles.timeButtonActive,
                    ]}
                    onPress={() => setSelectedTime(option.key)}>
                    <Text
                      style={[
                        styles.timeButtonText,
                        selectedTime === option.key && styles.timeButtonTextActive,
                      ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Fare Breakdown */}
          <View style={styles.fareBreakdown}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Base Fare</Text>
              <Text style={styles.breakdownValue}>₹{fareConfig.base_fare}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Per KM Rate</Text>
              <Text style={styles.breakdownValue}>₹{fareConfig.per_km_rate} × {distance}km</Text>
            </View>
            {selectedTime === 'night' && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Night Multiplier</Text>
                <Text style={styles.breakdownValue}>×{fareConfig.night_multiplier}</Text>
              </View>
            )}
            {selectedTime === 'peak' && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Surge Multiplier</Text>
                <Text style={styles.breakdownValue}>×{fareConfig.surge_multiplier}</Text>
              </View>
            )}
            <View style={[styles.breakdownRow, styles.breakdownTotal]}>
              <Text style={styles.breakdownTotalLabel}>Estimated Fare</Text>
              <Text style={styles.breakdownTotalValue}>₹{estimatedFare || '0'}</Text>
            </View>
          </View>

          {/* Calculate Button */}
          <TouchableOpacity
            style={[styles.calculateButton, loading && styles.calculateButtonDisabled]}
            onPress={handleCalculate}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.calculateButtonText}>Calculate & Save</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  emptyContainer: {
    paddingVertical: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  compactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  compactIcon: {
    fontSize: 24,
  },
  compactTitle: {
    ...TYPOGRAPHY.body2,
    fontWeight: '600',
  },
  compactDistance: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  expandIcon: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.background,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  expandedTitle: {
    ...TYPOGRAPHY.headline6,
    fontWeight: '600',
  },
  collapseIcon: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  presetsContainer: {
    marginBottom: 16,
  },
  presetsLabel: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    marginBottom: 8,
  },
  presetsScroll: {
    paddingRight: 16,
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetButtonText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.white,
    fontWeight: '600',
  },
  inputsContainer: {
    marginBottom: 16,
    gap: 12,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingRight: 12,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...TYPOGRAPHY.body2,
  },
  inputUnit: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  passengerCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 4,
  },
  counterButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.primary,
  },
  counterValue: {
    ...TYPOGRAPHY.body2,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
  },
  timeButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timeButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  timeButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  timeButtonTextActive: {
    color: COLORS.white,
  },
  fareBreakdown: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  breakdownLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  breakdownValue: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTopVertical: 10,
    marginTop: 6,
  },
  breakdownTotalLabel: {
    ...TYPOGRAPHY.body2,
    fontWeight: '600',
  },
  breakdownTotalValue: {
    ...TYPOGRAPHY.body2,
    fontWeight: '700',
    color: COLORS.primary,
  },
  calculateButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calculateButtonDisabled: {
    opacity: 0.6,
  },
  calculateButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
    fontWeight: '600',
  },
});
