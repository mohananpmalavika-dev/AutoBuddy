/**
 * DriverFareDisplay.js
 * Shows driver their current fare configuration
 * Displays whether using custom rates or defaults
 */

import React, { useState, useCallback, useEffect } from "react";
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Text } from "react-native";
import { COLORS, SHADOWS, SPACING } from "../theme";
import { apiRequest } from "../lib/api";

const RIDE_TYPES = ["standard", "premium", "economy"];

export default function DriverFareDisplay() {
  const [fares, setFares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRideType, setExpandedRideType] = useState(null);

  const fetchMyFares = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest('/api/driver/my-fares', { method: 'GET' });
      setFares(response.fares || []);
    } catch (_err) {
      console.error("Error fetching fares:", _err);
      setError("Unable to load your fare configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted) {
        await fetchMyFares();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fetchMyFares]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMyFares}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const hasCustomRates = fares && fares.length > 0;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Fare Rates</Text>
        {hasCustomRates && (
          <View style={styles.customBadge}>
            <Text style={styles.customBadgeText}>Custom Rates</Text>
          </View>
        )}
      </View>

      {/* Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.statusIconContainer}>
          <Text style={styles.statusIcon}>{hasCustomRates ? "⭐" : "📊"}</Text>
        </View>
        <View style={styles.statusContent}>
          <Text style={styles.statusTitle}>
            {hasCustomRates ? "Custom Rates Active" : "Using Default Rates"}
          </Text>
          <Text style={styles.statusDescription}>
            {hasCustomRates
              ? "Your personalized fare rates are being used for bookings"
              : "Your fares follow the system district and locality defaults"}
          </Text>
        </View>
      </View>

      {/* Fare Information */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>How Your Fares Are Calculated</Text>
        <Text style={styles.infoStep}>
          <Text style={styles.stepNumber}>1</Text> Driver-Specific Override (if set)
        </Text>
        <Text style={styles.infoStep}>
          <Text style={styles.stepNumber}>2</Text> Locality-Level Fare
        </Text>
        <Text style={styles.infoStep}>
          <Text style={styles.stepNumber}>3</Text> District-Level Fare
        </Text>
        <Text style={styles.infoStep}>
          <Text style={styles.stepNumber}>4</Text> System Default
        </Text>
      </View>

      {/* Current Fares */}
      {hasCustomRates ? (
        <>
          <Text style={styles.sectionTitle}>Your Custom Rates</Text>
          {RIDE_TYPES.map((rideType) => {
            const fareData = fares.find((f) => f.ride_type === rideType);
            if (!fareData) return null;

            const isExpanded = expandedRideType === rideType;

            return (
              <TouchableOpacity
                key={rideType}
                style={styles.fareCard}
                onPress={() =>
                  setExpandedRideType(isExpanded ? null : rideType)
                }
                activeOpacity={0.7}
              >
                <View style={styles.fareCardHeader}>
                  <View style={styles.rideTypeInfo}>
                    <Text style={styles.rideTypeLabel}>
                      {rideType.charAt(0).toUpperCase() + rideType.slice(1)}
                    </Text>
                    <View style={styles.rateBadge}>
                      <Text style={styles.rateBadgeText}>Custom</Text>
                    </View>
                  </View>
                  <View style={styles.fareAmount}>
                    <Text style={styles.baseAmount}>Base ₹{fareData.base_fare.toFixed(2)}</Text>
                    <Text style={styles.expandIcon}>{isExpanded ? "▼" : "▶"}</Text>
                  </View>
                </View>

                {isExpanded && (
                  <View style={styles.fareDetails}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Base Fare:</Text>
                      <Text style={styles.detailValue}>₹{fareData.base_fare.toFixed(2)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Per Kilometer:</Text>
                      <Text style={styles.detailValue}>₹{fareData.per_km.toFixed(2)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Per Minute:</Text>
                      <Text style={styles.detailValue}>₹{fareData.per_minute.toFixed(2)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Minimum Fare:</Text>
                      <Text style={styles.detailValue}>₹{fareData.minimum_fare.toFixed(2)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Surge Multiplier:</Text>
                      <Text style={styles.detailValue}>{fareData.surge_multiplier.toFixed(2)}x</Text>
                    </View>

                    {/* Example Calculation */}
                    <View style={styles.exampleBox}>
                      <Text style={styles.exampleTitle}>Example: 10 km, 15 min ride</Text>
                      <View style={styles.exampleRow}>
                        <Text style={styles.exampleLabel}>Base:</Text>
                        <Text style={styles.exampleValue}>₹{fareData.base_fare.toFixed(2)}</Text>
                      </View>
                      <View style={styles.exampleRow}>
                        <Text style={styles.exampleLabel}>Distance (10 × {fareData.per_km.toFixed(2)}):</Text>
                        <Text style={styles.exampleValue}>₹{(10 * fareData.per_km).toFixed(2)}</Text>
                      </View>
                      <View style={styles.exampleRow}>
                        <Text style={styles.exampleLabel}>Time (15 × {fareData.per_minute.toFixed(2)}):</Text>
                        <Text style={styles.exampleValue}>₹{(15 * fareData.per_minute).toFixed(2)}</Text>
                      </View>
                      <View style={[styles.exampleRow, styles.exampleRowHighlight]}>
                        <Text style={styles.exampleLabelBold}>Estimated Fare:</Text>
                        <Text style={styles.exampleValueBold}>
                          ₹{Math.max(
                            (fareData.base_fare +
                              10 * fareData.per_km +
                              15 * fareData.per_minute) *
                              fareData.surge_multiplier,
                            fareData.minimum_fare
                          ).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </>
      ) : (
        <View style={styles.noDataBox}>
          <Text style={styles.noDataIcon}>📍</Text>
          <Text style={styles.noDataTitle}>Using Default Rates</Text>
          <Text style={styles.noDataText}>
            Your admin has not set custom rates for you. Your fares are based on district and locality configurations.
          </Text>
        </View>
      )}

      {/* Additional Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>💡 Fare Calculation Tips</Text>
        <Text style={styles.infoCardText}>
          • Your base fare covers the initial trip cost{"\n"}
          • Distance and time charges accumulate as you drive{"\n"}
          • During high demand, surge multipliers may apply{"\n"}
          • The final fare is always at least the minimum fare
        </Text>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.large,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.large,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.text,
  },
  customBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderRadius: 20,
  },
  customBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "600",
  },
  statusCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.large,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.large,
    ...SHADOWS.medium,
  },
  statusIconContainer: {
    marginRight: SPACING.large,
  },
  statusIcon: {
    fontSize: 40,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.white,
    marginBottom: SPACING.small,
  },
  statusDescription: {
    fontSize: 13,
    color: COLORS.white,
    opacity: 0.9,
  },
  infoBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.large,
    marginBottom: SPACING.large,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  infoStep: {
    fontSize: 13,
    color: COLORS.text,
    marginVertical: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  stepNumber: {
    backgroundColor: COLORS.primary,
    color: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
    fontSize: 11,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.medium,
    marginTop: SPACING.large,
  },
  fareCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: SPACING.medium,
    ...SHADOWS.small,
    overflow: "hidden",
  },
  fareCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.large,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rideTypeInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  rideTypeLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginRight: SPACING.medium,
    textTransform: "capitalize",
  },
  rateBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.small,
    paddingVertical: 3,
    borderRadius: 4,
  },
  rateBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "600",
  },
  fareAmount: {
    alignItems: "flex-end",
  },
  baseAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: SPACING.small,
  },
  expandIcon: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  fareDetails: {
    padding: SPACING.large,
    backgroundColor: COLORS.background,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: SPACING.small,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  exampleBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.medium,
    marginTop: SPACING.large,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
  },
  exampleTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  exampleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  exampleRowHighlight: {
    marginTop: SPACING.medium,
    paddingVertical: SPACING.small,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  exampleLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  exampleLabelBold: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  exampleValue: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.text,
  },
  exampleValueBold: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primary,
  },
  noDataBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.xlarge,
    alignItems: "center",
    marginVertical: SPACING.large,
  },
  noDataIcon: {
    fontSize: 48,
    marginBottom: SPACING.medium,
  },
  noDataTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  noDataText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  infoCard: {
    backgroundColor: COLORS.info,
    borderRadius: 12,
    padding: SPACING.large,
    marginTop: SPACING.large,
    marginBottom: SPACING.large,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  infoCardText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
  },
  spacer: {
    height: SPACING.xlarge,
  },
  errorBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.large,
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.danger,
    fontWeight: "600",
    marginBottom: SPACING.medium,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: SPACING.large,
    paddingVertical: SPACING.small,
    borderRadius: 6,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "700",
  },
};
