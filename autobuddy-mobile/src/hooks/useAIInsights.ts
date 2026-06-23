/* useAIInsights Hook - Fetches and manages AI-powered suggestions for the user. */

import { useState, useEffect, useCallback } from "react";
import axios from "axios";

export interface AIInsight {
  type: "travel_pattern" | "predictive_offer" | "weather_alert" | "destination_recognition";
  title: string;
  message: string;
  destination_lat?: number;
  destination_lng?: number;
  metadata?: Record<string, any>;
  confidence_score: number;
  action_label?: string;
  action_type?: string;
}

interface UseAIInsightsReturn {
  insights: AIInsight[];
  loading: boolean;
  error: string | null;
  fetchInsights: () => Promise<void>;
  dismissInsight: (index: number) => void;
  submitFeedback: (insightId: string, helpful: boolean) => Promise<void>;
  travelPatterns: any[];
}

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export const useAIInsights = (userId: string): UseAIInsightsReturn => {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travelPatterns, setTravelPatterns] = useState([]);

  const fetchInsights = useCallback(async () => {
    if (!userId) {return;}

    setLoading(true);
    setError(null);

    try {
      // Fetch AI insights
      const insightsResponse = await axios.get(
        `${API_BASE_URL}/api/v1/ai-visibility/insights/${userId}?limit=5`
      );

      setInsights(insightsResponse.data);

      // Fetch travel patterns for context
      const patternsResponse = await axios.get(
        `${API_BASE_URL}/api/v1/ai-visibility/travel-patterns/${userId}?days=30`
      );

      setTravelPatterns(patternsResponse.data);
    } catch (err) {
      console.error("Failed to fetch AI insights:", err);
      setError("Failed to load AI suggestions");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const dismissInsight = useCallback((index: number) => {
    setInsights((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const submitFeedback = useCallback(
    async (insightId: string, helpful: boolean) => {
      try {
        await axios.post(
          `${API_BASE_URL}/api/v1/ai-visibility/insights/${userId}/feedback`,
          {
            insight_id: insightId,
            helpful,
          }
        );
      } catch (err) {
        console.error("Failed to submit feedback:", err);
      }
    },
    [userId]
  );

  // Fetch insights on mount and refresh every 5 minutes
  useEffect(() => {
    fetchInsights();

    const interval = setInterval(fetchInsights, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchInsights]);

  return {
    insights,
    loading,
    error,
    fetchInsights,
    dismissInsight,
    submitFeedback,
    travelPatterns,
  };
};

/**
 * Get predictions for next ride
 */
export const useRidePredictions = (userId: string) => {
  const [predictions, setPredictions] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchPredictions = useCallback(async () => {
    if (!userId) {return;}

    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v1/ai-visibility/predictions/${userId}`
      );
      setPredictions(response.data);
    } catch (err) {
      console.error("Failed to fetch predictions:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  return { predictions, loading, fetchPredictions };
};

/**
 * Get travel patterns for visualization
 */
export const useTravelPatterns = (userId: string, days: number = 30) => {
  const [patterns, setPatterns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {return;}

    setLoading(true);
    axios
      .get(
        `${API_BASE_URL}/api/v1/ai-visibility/travel-patterns/${userId}?days=${days}`
      )
      .then((res) => {
        setPatterns(res.data);
      })
      .catch((err) => {
        console.error("Failed to fetch travel patterns:", err);
      })
      .finally(() => setLoading(false));
  }, [userId, days]);

  return { patterns, loading };
};

/**
 * Helper to format insight message with variables
 */
export const formatInsightMessage = (
  template: string,
  variables: Record<string, any>
): string => {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] ?? match;
  });
};

/**
 * Helper to get insight icon based on type
 */
export const getInsightIcon = (
  type: "travel_pattern" | "predictive_offer" | "weather_alert" | "destination_recognition"
): string => {
  const iconMap = {
    travel_pattern: "map-marker-path",
    predictive_offer: "lightning-bolt",
    weather_alert: "cloud-alert",
    destination_recognition: "star",
  };

  return iconMap[type] || "lightbulb";
};

/**
 * Helper to get insight color based on type
 */
export const getInsightColor = (
  type: "travel_pattern" | "predictive_offer" | "weather_alert" | "destination_recognition"
): [string, string] => {
  const colorMap = {
    travel_pattern: ["#667eea", "#764ba2"],
    predictive_offer: ["#f093fb", "#f5576c"],
    weather_alert: ["#fa709a", "#fee140"],
    destination_recognition: ["#30cfd0", "#330867"],
  };

  return colorMap[type] || ["#667eea", "#764ba2"];
};
