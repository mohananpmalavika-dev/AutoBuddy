/* AI Insights Screen Component - Displays AI-powered suggestions and insights to the user. */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAIInsights, useTravelPatterns } from "../hooks/useAIInsights";
import { AIInsightCard, AIInsightsCarousel, AIAlertBanner } from "../components/AIInsightCard";

interface Insight {
  id?: string;
  action_type?: string;
  destination_lat?: number;
  destination_lng?: number;
  [key: string]: unknown;
}

interface AIInsightsScreenProps {
  userId: string;
  onInsightSelected?: (insight: Insight) => void;
  onQuickBook?: (destination: { lat: number; lng: number }) => void;
}

export const AIInsightsScreen: React.FC<AIInsightsScreenProps> = ({
  userId,
  onInsightSelected,
  onQuickBook,
}) => {
  const { insights, loading, error, dismissInsight, fetchInsights } = useAIInsights(userId);
  const { patterns } = useTravelPatterns(userId, 30);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchInsights().finally(() => setRefreshing(false));
  }, [fetchInsights]);

  const handleInsightAction = (insight: Insight) => {
    if (insight.action_type === "quick_book" && insight.destination_lat && insight.destination_lng) {
      onQuickBook?.({
        lat: insight.destination_lat,
        lng: insight.destination_lng,
      });
    } else {
      onInsightSelected?.(insight);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🤖 AI Insights</Text>
          <Text style={styles.headerSubtitle}>Personalized for you</Text>
        </View>

        {/* Error Banner */}
        {error && (
          <AIAlertBanner
            type="warning"
            message={error}
            onClose={() => {}}
          />
        )}

        {/* Loading State */}
        {loading && !refreshing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Analyzing your patterns...</Text>
          </View>
        )}

        {/* Insights Section */}
        {!loading && insights.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>✨ Smart Suggestions</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{insights.length}</Text>
              </View>
            </View>

            <AIInsightsCarousel
              insights={insights}
              loading={loading}
              onInsightAction={handleInsightAction}
              onInsightDismiss={dismissInsight}
            />
          </View>
        )}

        {/* Travel Patterns Section */}
        {patterns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Your Frequent Routes</Text>
            {patterns.slice(0, 3).map((pattern, index) => (
              <TouchableOpacity
                key={index}
                style={styles.patternCard}
                onPress={() => {
                  onQuickBook?.({
                    lat: pattern.destination_lat,
                    lng: pattern.destination_lng,
                  });
                }}
              >
                <View style={styles.patternIcon}>
                  <MaterialCommunityIcons
                    name="map-marker"
                    size={24}
                    color="#667eea"
                  />
                </View>
                <View style={styles.patternContent}>
                  <Text style={styles.patternLabel}>{pattern.label}</Text>
                  <Text style={styles.patternMeta}>
                    {pattern.frequency} visits • Popular at {pattern.common_hours?.[0]}:00
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#999" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* No Insights State */}
        {!loading && insights.length === 0 && patterns.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="lightbulb-outline"
              size={48}
              color="#ccc"
            />
            <Text style={styles.emptyStateTitle}>No insights yet</Text>
            <Text style={styles.emptyStateText}>
              Start booking rides to get personalized AI suggestions
            </Text>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.section}>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons
              name="information"
              size={24}
              color="#667eea"
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>How AI Works</Text>
              <Text style={styles.infoText}>
                We learn from your ride patterns to suggest faster routes, predict your
                destinations, and alert you about delays.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

/**
 * Compact AI Insights Widget for Dashboard
 * Shows top 3 insights in a card
 */
export const AIInsightsWidget: React.FC<{
  userId: string;
  onViewAll?: () => void;
  onQuickBook?: (destination: { lat: number; lng: number }) => void;
}> = ({ userId, onViewAll, onQuickBook }) => {
  const { insights, loading, dismissInsight } = useAIInsights(userId);

  if (loading || insights.length === 0) {
    return null;
  }

  const topInsights = insights.slice(0, 2);

  return (
    <View style={styles.widgetContainer}>
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetTitle}>🤖 AI Insights</Text>
        {insights.length > topInsights.length && (
          <TouchableOpacity onPress={onViewAll}>
            <Text style={styles.viewAllText}>
              View all ({insights.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {topInsights.map((insight, index) => (
        <TouchableOpacity
          key={index}
          style={styles.miniCard}
          onPress={() => {
            if (
              insight.action_type === "quick_book" &&
              insight.destination_lat &&
              insight.destination_lng
            ) {
              onQuickBook?.({
                lat: insight.destination_lat,
                lng: insight.destination_lng,
              });
            }
          }}
        >
          <View style={styles.miniCardContent}>
            <Text style={styles.miniCardTitle}>{insight.title}</Text>
            <Text style={styles.miniCardMessage} numberOfLines={1}>
              {insight.message}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#333",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
  },
  section: {
    marginVertical: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  badge: {
    backgroundColor: "#667eea",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
    fontSize: 14,
  },
  patternCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    marginBottom: 8,
  },
  patternIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f0f4ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  patternContent: {
    flex: 1,
  },
  patternLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    textTransform: "capitalize",
  },
  patternMeta: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginTop: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: "#f0f4ff",
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#667eea",
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  infoText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    lineHeight: 16,
  },
  widgetContainer: {
    marginVertical: 12,
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  widgetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  widgetTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  viewAllText: {
    fontSize: 12,
    color: "#667eea",
    fontWeight: "600",
  },
  miniCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 6,
  },
  miniCardContent: {
    flex: 1,
  },
  miniCardTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  miniCardMessage: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
});

export default AIInsightsScreen;
