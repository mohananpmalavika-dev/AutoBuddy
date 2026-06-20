import { useEffect, useCallback, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface Scorecard {
  overall_score: number;
  acceptance_rate_score: number;
  completion_rate_score: number;
  rating_score: number;
  consistency_score: number;
  efficiency_score: number;
  reliability_score: number;
  trend: 'up' | 'down' | 'stable';
  peer_percentile: number;
  last_updated: string;
}

interface TripAnalytic {
  trip_id: string;
  date: string;
  duration_minutes: number;
  distance_km: number;
  earnings: number;
  rating?: number;
  efficiency_score: number;
  on_time_score: number;
}

interface TripAnalyticsResponse {
  trips: TripAnalytic[];
  aggregated_stats: {
    total_trips: number;
    total_earnings: number;
    total_distance: number;
    total_duration_minutes: number;
    average_earnings_per_trip: number;
    average_distance_per_trip: number;
    average_duration_per_trip: number;
    average_efficiency_score: number;
    average_rating?: number;
  };
}

interface BehaviorPattern {
  pattern_type: 'peak_hours' | 'zone_preference' | 'consistency' | 'acceptance_pattern';
  description: string;
  frequency_percentage: number;
  trend: 'up' | 'down' | 'stable';
}

interface BehaviorPatternsResponse {
  patterns: BehaviorPattern[];
  last_updated: string;
}

interface BenchmarkComparison {
  driver_score: number;
  peer_percentiles: {
    [key: string]: number;
  };
  interpretation: {
    your_position: string;
    top_metric: string;
    needs_improvement: string;
  };
}

interface ImprovementSuggestion {
  category: string;
  priority: 'high' | 'medium' | 'low';
  suggestion_text: string;
  expected_impact: string;
  confidence_score: number;
}

interface SuggestionsResponse {
  suggestions: ImprovementSuggestion[];
  total_count: number;
  by_priority: {
    high: number;
    medium: number;
    low: number;
  };
}

interface FullDashboard {
  scorecard: Scorecard;
  trip_summary: {
    total_trips: number;
    total_earnings: number;
    average_rating?: number;
  };
  behavior_patterns: BehaviorPattern[];
  suggestions: ImprovementSuggestion[];
  benchmarks: {
    your_position: string;
    peer_50th: number;
    peer_75th: number;
  };
}

export const useDriverInsights = (driverId: string | null, authToken: string | null) => {
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [tripAnalytics, setTripAnalytics] = useState<TripAnalyticsResponse | null>(null);
  const [behaviorPatterns, setBehaviorPatterns] = useState<BehaviorPattern[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkComparison | null>(null);
  const [suggestions, setSuggestions] = useState<ImprovementSuggestion[]>([]);
  const [fullDashboard, setFullDashboard] = useState<FullDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScorecard = useCallback(
    async (period: number = 30) => {
      if (!driverId || !authToken) return;
      try {
        setIsLoading(true);
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-insights/scorecard/${driverId}`,
          {
            params: { period },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        setScorecard(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching scorecard:', err);
        setError('Failed to load scorecard');
      } finally {
        setIsLoading(false);
      }
    },
    [driverId, authToken]
  );

  const fetchTripAnalytics = useCallback(
    async (days: number = 30) => {
      if (!driverId || !authToken) return;
      try {
        setIsLoading(true);
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-insights/trip-analytics/${driverId}`,
          {
            params: { days },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        setTripAnalytics(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching trip analytics:', err);
        setError('Failed to load trip analytics');
      } finally {
        setIsLoading(false);
      }
    },
    [driverId, authToken]
  );

  const fetchBehaviorPatterns = useCallback(
    async (days: number = 30) => {
      if (!driverId || !authToken) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-insights/behavior-patterns/${driverId}`,
          {
            params: { days },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        setBehaviorPatterns(response.data.patterns);
        setError(null);
      } catch (err) {
        console.error('Error fetching behavior patterns:', err);
        setError('Failed to load behavior patterns');
      }
    },
    [driverId, authToken]
  );

  const fetchBenchmarks = useCallback(
    async () => {
      if (!driverId || !authToken) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-insights/benchmarks/${driverId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setBenchmarks(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching benchmarks:', err);
        setError('Failed to load benchmarks');
      }
    },
    [driverId, authToken]
  );

  const fetchSuggestions = useCallback(
    async () => {
      if (!driverId || !authToken) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-insights/suggestions/${driverId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setSuggestions(response.data.suggestions);
        setError(null);
      } catch (err) {
        console.error('Error fetching suggestions:', err);
        setError('Failed to load suggestions');
      }
    },
    [driverId, authToken]
  );

  const fetchFullDashboard = useCallback(
    async (days: number = 30) => {
      if (!driverId || !authToken) return;
      try {
        setIsLoading(true);
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-insights/dashboard/${driverId}`,
          {
            params: { days },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        setFullDashboard(response.data);
        setScorecard(response.data.scorecard);
        setBehaviorPatterns(response.data.behavior_patterns);
        setSuggestions(response.data.suggestions);
        setError(null);
      } catch (err) {
        console.error('Error fetching full dashboard:', err);
        setError('Failed to load dashboard');
      } finally {
        setIsLoading(false);
      }
    },
    [driverId, authToken]
  );

  const regenerateInsights = useCallback(
    async () => {
      if (!driverId || !authToken) return;
      try {
        setIsLoading(true);
        await axios.post(
          `${API_BASE_URL}/api/v3/driver-insights/regenerate/${driverId}`,
          {},
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        await fetchFullDashboard();
      } catch (err) {
        console.error('Error regenerating insights:', err);
        setError('Failed to regenerate insights');
      } finally {
        setIsLoading(false);
      }
    },
    [driverId, authToken, fetchFullDashboard]
  );

  const getTripDetails = useCallback(
    async (tripId: string) => {
      if (!authToken) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-insights/trip-details/${tripId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        return response.data;
      } catch (err) {
        console.error('Error fetching trip details:', err);
        return null;
      }
    },
    [authToken]
  );

  const getScorecardTrend = useCallback(
    async (days: number = 7) => {
      if (!driverId || !authToken) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-insights/history/${driverId}`,
          {
            params: { metric_type: 'scorecard' },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        return response.data.insights.slice(0, Math.ceil(days / 30 * 10));
      } catch (err) {
        console.error('Error fetching scorecard trend:', err);
        return [];
      }
    },
    [driverId, authToken]
  );

  const getAverageTripMetrics = useCallback(
    (days: number = 30) => {
      if (!tripAnalytics) return null;
      return tripAnalytics.aggregated_stats;
    },
    [tripAnalytics]
  );

  const compareWithBenchmark = useCallback(
    (metric: string) => {
      if (!scorecard || !benchmarks) return null;

      const scoreValue = scorecard[metric as keyof Scorecard] as number;
      const peerValue = benchmarks.peer_percentiles[`50th_percentile`] || 0;

      return {
        your_score: scoreValue,
        peer_50th: peerValue,
        difference: scoreValue - peerValue,
        percentile_rank: benchmarks.peer_percentiles[`your_position`] || 'unknown'
      };
    },
    [scorecard, benchmarks]
  );

  // Initial fetch on mount
  useEffect(() => {
    if (driverId && authToken) {
      fetchFullDashboard();
    }
  }, [driverId, authToken, fetchFullDashboard]);

  return {
    // State
    scorecard,
    tripAnalytics,
    behaviorPatterns,
    benchmarks,
    suggestions,
    fullDashboard,
    isLoading,
    error,

    // Functions
    fetchScorecard,
    fetchTripAnalytics,
    fetchBehaviorPatterns,
    fetchBenchmarks,
    fetchSuggestions,
    fetchFullDashboard,
    regenerateInsights,
    getTripDetails,
    getScorecardTrend,
    getAverageTripMetrics,
    compareWithBenchmark
  };
};
