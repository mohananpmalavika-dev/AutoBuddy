/* AI Insight Card Component - Displays AI-powered suggestions in a tappable card. */

import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

interface AIInsightCardProps {
  type: "travel_pattern" | "predictive_offer" | "weather_alert" | "destination_recognition";
  title: string;
  message: string;
  confidence: number;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

export const AIInsightCard: React.FC<AIInsightCardProps> = ({
  type,
  title,
  message,
  confidence,
  icon = "lightbulb",
  actionLabel = "Learn More",
  onAction,
  onDismiss,
}) => {
  const scaleAnim = new Animated.Value(0.9);
  const opacityAnim = new Animated.Value(0);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const getInsightColor = () => {
    switch (type) {
      case "travel_pattern":
        return ["#667eea", "#764ba2"]; // Purple gradient
      case "predictive_offer":
        return ["#f093fb", "#f5576c"]; // Pink/Red gradient
      case "weather_alert":
        return ["#fa709a", "#fee140"]; // Warm gradient
      case "destination_recognition":
        return ["#30cfd0", "#330867"]; // Teal gradient
      default:
        return ["#667eea", "#764ba2"];
    }
  };

  const getInsightIcon = () => {
    switch (type) {
      case "travel_pattern":
        return "map-marker-path";
      case "predictive_offer":
        return "lightning-bolt";
      case "weather_alert":
        return "cloud-alert";
      case "destination_recognition":
        return "star";
      default:
        return "lightbulb";
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <LinearGradient
        colors={getInsightColor()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientContainer}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleSection}>
            <MaterialCommunityIcons
              name={getInsightIcon()}
              size={24}
              color="#fff"
              style={styles.icon}
            />
            <Text style={styles.title}>{title}</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Message */}
        <Text style={styles.message}>{message}</Text>

        {/* Confidence Score */}
        <View style={styles.confidenceSection}>
          <View style={styles.confidenceBar}>
            <View
              style={[styles.confidenceFill, { width: `${confidence * 100}%` }]}
            />
          </View>
          <Text style={styles.confidenceText}>
            {Math.round(confidence * 100)}% confident
          </Text>
        </View>

        {/* Action Button */}
        {actionLabel && onAction && (
          <TouchableOpacity
            onPress={onAction}
            style={styles.actionButton}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color="#fff"
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        )}

        {/* AI Badge */}
        <View style={styles.aiBadge}>
          <Text style={styles.aiText}>🤖 AI</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

interface AIInsightsCarouselProps {
  insights: any[];
  loading?: boolean;
  onInsightAction?: (insight: any) => void;
  onInsightDismiss?: (index: number) => void;
}

export const AIInsightsCarousel: React.FC<AIInsightsCarouselProps> = ({
  insights,
  loading = false,
  onInsightAction,
  onInsightDismiss,
}) => {
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Analyzing your patterns...</Text>
      </View>
    );
  }

  if (!insights || insights.length === 0) {
    return null;
  }

  return (
    <View style={styles.carouselContainer}>
      <Text style={styles.carouselTitle}>✨ AI Suggestions Just For You</Text>
      {insights.map((insight, index) => (
        <AIInsightCard
          key={index}
          type={insight.type}
          title={insight.title}
          message={insight.message}
          confidence={insight.confidence_score}
          actionLabel={insight.action_label}
          onAction={() => onInsightAction?.(insight)}
          onDismiss={() => onInsightDismiss?.(index)}
        />
      ))}
    </View>
  );
};

interface AIAlertBannerProps {
  type: "info" | "warning" | "success" | "error";
  message: string;
  icon?: string;
  onClose?: () => void;
  autoClose?: boolean;
  autoCloseDuration?: number;
}

export const AIAlertBanner: React.FC<AIAlertBannerProps> = ({
  type,
  message,
  icon,
  onClose,
  autoClose = true,
  autoCloseDuration = 5000,
}) => {
  const slideAnim = new Animated.Value(-100);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 80,
      friction: 10,
      useNativeDriver: true,
    }).start();

    if (autoClose) {
      const timer = setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 300,
          useNativeDriver: true,
        }).start(() => onClose?.());
      }, autoCloseDuration);

      return () => clearTimeout(timer);
    }
  }, []);

  const getBannerColor = () => {
    switch (type) {
      case "warning":
        return "#FFA500";
      case "success":
        return "#4CAF50";
      case "error":
        return "#F44336";
      case "info":
      default:
        return "#2196F3";
    }
  };

  const getIconName = () => {
    switch (type) {
      case "warning":
        return "alert-circle";
      case "success":
        return "check-circle";
      case "error":
        return "close-circle";
      case "info":
      default:
        return "information";
    }
  };

  return (
    <Animated.View
      style={[
        styles.bannerContainer,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={[styles.banner, { backgroundColor: getBannerColor() }]}>
        <MaterialCommunityIcons
          name={icon || getIconName()}
          size={20}
          color="#fff"
          style={{ marginRight: 12 }}
        />
        <Text style={styles.bannerText}>{message}</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={{ marginLeft: "auto" }}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  gradientContainer: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  titleSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  icon: {
    marginRight: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  message: {
    fontSize: 14,
    color: "#fff",
    opacity: 0.95,
    marginBottom: 12,
    lineHeight: 20,
  },
  confidenceSection: {
    marginBottom: 12,
  },
  confidenceBar: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 6,
  },
  confidenceFill: {
    height: "100%",
    backgroundColor: "#fff",
  },
  confidenceText: {
    fontSize: 12,
    color: "#fff",
    opacity: 0.8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  aiBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  aiText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  carouselContainer: {
    marginVertical: 8,
  },
  carouselTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginHorizontal: 16,
    marginBottom: 12,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
    fontSize: 14,
  },
  bannerContainer: {
    paddingHorizontal: 16,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  bannerText: {
    color: "#fff",
    fontSize: 14,
    flex: 1,
  },
});

export default AIInsightCard;
