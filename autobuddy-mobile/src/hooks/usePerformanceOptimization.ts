import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';

export interface PerformanceMetrics {
  timestamp: Date;
  memoryUsage: number;
  batteryLevel: number;
  batteryState: 'charging' | 'full' | 'unplugged';
  websocketLatency: number;
  activeConnections: number;
  droppedFrames: number;
  appState: AppStateStatus;
}

export interface OptimizationState {
  lowPowerMode: boolean;
  reducedFrequency: boolean;
  pausedLocationTracking: boolean;
  pausedRealTimeUpdates: boolean;
  optimizationLevel: 'aggressive' | 'moderate' | 'minimal';
}

/**
 * Hook for performance monitoring and optimization of real-time features
 */
export function usePerformanceOptimization() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [optimization, setOptimization] = useState<OptimizationState>({
    lowPowerMode: false,
    reducedFrequency: false,
    pausedLocationTracking: false,
    pausedRealTimeUpdates: false,
    optimizationLevel: 'minimal',
  });

  const appStateRef = useRef<AppStateStatus>('active');
  const metricsHistoryRef = useRef<PerformanceMetrics[]>([]);
  const websocketLatenciesRef = useRef<number[]>([]);

  // Monitor app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => subscription.remove();
  }, []);

  const handleAppStateChange = useCallback((state: AppStateStatus) => {
    appStateRef.current = state;

    if (state === 'background') {
      // Pause non-critical real-time updates when app is in background
      setOptimization((prev) => ({
        ...prev,
        pausedRealTimeUpdates: true,
      }));
    } else if (state === 'active') {
      // Resume updates when app comes back to foreground
      setOptimization((prev) => ({
        ...prev,
        pausedRealTimeUpdates: false,
      }));
    }
  }, []);

  // Monitor battery and memory
  useEffect(() => {
    const monitorInterval = setInterval(async () => {
      try {
        const batteryLevel = await Battery.getBatteryLevelAsync();
        const batteryState = await Battery.getBatteryStateAsync();
        const isLowPowerModeEnabled = await Battery.isLowPowerModeEnabledAsync();

        // Calculate avg latency from recent measurements
        const recentLatencies = websocketLatenciesRef.current.slice(-10);
        const avgLatency =
          recentLatencies.length > 0
            ? recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length
            : 0;

        const newMetric: PerformanceMetrics = {
          timestamp: new Date(),
          memoryUsage: 0, // Will be set by native module in real app
          batteryLevel: batteryLevel * 100,
          batteryState:
            batteryState === 1
              ? 'charging'
              : batteryState === 2
              ? 'full'
              : 'unplugged',
          websocketLatency: avgLatency,
          activeConnections: 1, // WebSocket + others
          droppedFrames: 0, // Will be measured by performance observer
          appState: appStateRef.current,
        };

        setMetrics(newMetric);
        metricsHistoryRef.current.push(newMetric);

        // Keep only last 100 metrics
        if (metricsHistoryRef.current.length > 100) {
          metricsHistoryRef.current.shift();
        }

        // Determine optimization level
        const shouldOptimize = determinOptimizationLevel(
          batteryLevel,
          isLowPowerModeEnabled,
          avgLatency
        );

        if (shouldOptimize !== optimization.optimizationLevel) {
          applyOptimizations(shouldOptimize);
        }
      } catch (error) {
        console.error('[Performance] Monitoring error:', error);
      }
    }, 5000); // Monitor every 5 seconds

    return () => clearInterval(monitorInterval);
  }, [optimization.optimizationLevel]);

  const determinOptimizationLevel = (
    batteryLevel: number,
    lowPowerMode: boolean,
    latency: number
  ): 'aggressive' | 'moderate' | 'minimal' => {
    // Aggressive optimization: battery < 15%, low power mode, or high latency
    if (batteryLevel < 0.15 || lowPowerMode || latency > 500) {
      return 'aggressive';
    }

    // Moderate optimization: battery < 30% or moderate latency
    if (batteryLevel < 0.3 || latency > 250) {
      return 'moderate';
    }

    // Minimal optimization: good battery and latency
    return 'minimal';
  };

  const applyOptimizations = useCallback(
    (level: 'aggressive' | 'moderate' | 'minimal') => {
      setOptimization((prev) => {
        let updates: Partial<OptimizationState> = {
          optimizationLevel: level,
        };

        if (level === 'aggressive') {
          updates = {
            ...updates,
            lowPowerMode: true,
            reducedFrequency: true,
            pausedLocationTracking: true,
            pausedRealTimeUpdates: true,
          };
        } else if (level === 'moderate') {
          updates = {
            ...updates,
            lowPowerMode: false,
            reducedFrequency: true,
            pausedLocationTracking: false,
            pausedRealTimeUpdates: false,
          };
        } else {
          updates = {
            ...updates,
            lowPowerMode: false,
            reducedFrequency: false,
            pausedLocationTracking: false,
            pausedRealTimeUpdates: false,
          };
        }

        console.log(
          `[Performance] Applied ${level} optimizations:`,
          updates
        );
        return { ...prev, ...updates };
      });
    },
    []
  );

  // Record WebSocket latency
  const recordWebSocketLatency = useCallback((latency: number) => {
    websocketLatenciesRef.current.push(latency);
    // Keep only last 50 measurements
    if (websocketLatenciesRef.current.length > 50) {
      websocketLatenciesRef.current.shift();
    }
  }, []);

  // Get performance summary
  const getPerformanceSummary = useCallback(() => {
    if (metricsHistoryRef.current.length === 0) return null;

    const history = metricsHistoryRef.current;
    const battery = history.map((m) => m.batteryLevel);
    const latencies = websocketLatenciesRef.current;

    return {
      avgBattery: battery.reduce((a, b) => a + b, 0) / battery.length,
      minBattery: Math.min(...battery),
      avgLatency:
        latencies.length > 0
          ? latencies.reduce((a, b) => a + b, 0) / latencies.length
          : 0,
      maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
      sampleCount: history.length,
    };
  }, []);

  // Manual optimization trigger
  const setManualOptimization = useCallback(
    (level: 'aggressive' | 'moderate' | 'minimal') => {
      applyOptimizations(level);
    },
    [applyOptimizations]
  );

  return {
    metrics,
    optimization,
    recordWebSocketLatency,
    getPerformanceSummary,
    setManualOptimization,
  };
}

/**
 * Hook for monitoring network conditions and adapting update frequency
 */
export function useAdaptiveNetworking() {
  const [networkQuality, setNetworkQuality] = useState<'excellent' | 'good' | 'poor'>('good');
  const [updateFrequency, setUpdateFrequency] = useState({
    locationUpdate: 5000, // 5 seconds
    earningsUpdate: 3000, // 3 seconds
    statusUpdate: 10000, // 10 seconds
  });

  const latencyHistoryRef = useRef<number[]>([]);

  const updateNetworkQuality = useCallback((latency: number) => {
    latencyHistoryRef.current.push(latency);
    if (latencyHistoryRef.current.length > 20) {
      latencyHistoryRef.current.shift();
    }

    const avgLatency =
      latencyHistoryRef.current.reduce((a, b) => a + b, 0) /
      latencyHistoryRef.current.length;

    let quality: 'excellent' | 'good' | 'poor';
    if (avgLatency < 100) {
      quality = 'excellent';
    } else if (avgLatency < 250) {
      quality = 'good';
    } else {
      quality = 'poor';
    }

    setNetworkQuality(quality);

    // Adjust update frequencies based on quality
    if (quality === 'excellent') {
      setUpdateFrequency({
        locationUpdate: 3000,
        earningsUpdate: 2000,
        statusUpdate: 5000,
      });
    } else if (quality === 'poor') {
      setUpdateFrequency({
        locationUpdate: 10000,
        earningsUpdate: 8000,
        statusUpdate: 15000,
      });
    } else {
      setUpdateFrequency({
        locationUpdate: 5000,
        earningsUpdate: 3000,
        statusUpdate: 10000,
      });
    }

    console.log(`[Networking] Quality: ${quality}, Latency: ${avgLatency}ms`);
  }, []);

  return {
    networkQuality,
    updateFrequency,
    updateNetworkQuality,
  };
}

/**
 * Hook for memory leak detection and cleanup validation
 */
export function useMemoryLeakDetection() {
  const [suspectedLeaks, setSuspectedLeaks] = useState<string[]>([]);
  const listenerCountRef = useRef<Map<string, number>>(new Map());

  const registerListener = useCallback((name: string) => {
    const current = listenerCountRef.current.get(name) || 0;
    listenerCountRef.current.set(name, current + 1);
  }, []);

  const unregisterListener = useCallback((name: string) => {
    const current = listenerCountRef.current.get(name) || 0;
    if (current > 0) {
      listenerCountRef.current.set(name, current - 1);
    } else {
      console.warn(`[Memory] Unregistering non-existent listener: ${name}`);
    }
  }, []);

  const validateCleanup = useCallback(() => {
    const leaks: string[] = [];

    listenerCountRef.current.forEach((count, name) => {
      if (count > 0) {
        leaks.push(`${name} (${count} listeners)`);
      }
    });

    setSuspectedLeaks(leaks);

    if (leaks.length > 0) {
      console.warn('[Memory] Suspected leaks:', leaks);
    }

    return leaks;
  }, []);

  return {
    suspectedLeaks,
    registerListener,
    unregisterListener,
    validateCleanup,
  };
}

/**
 * Hook for frame rate monitoring during real-time updates
 */
export function useFrameRateMonitoring() {
  const [frameRate, setFrameRate] = useState(60);
  const [droppedFrameCount, setDroppedFrameCount] = useState(0);

  const frameCountRef = useRef(0);
  const dropCountRef = useRef(0);

  useEffect(() => {
    const monitorInterval = setInterval(() => {
      setFrameRate(frameCountRef.current);
      setDroppedFrameCount(dropCountRef.current);

      frameCountRef.current = 0;
      dropCountRef.current = 0;
    }, 1000);

    return () => clearInterval(monitorInterval);
  }, []);

  const recordFrame = useCallback((duration: number) => {
    frameCountRef.current++;

    // If frame took longer than 16.67ms (60fps), count as dropped
    if (duration > 16.67) {
      dropCountRef.current++;
    }
  }, []);

  return {
    frameRate,
    droppedFrameCount,
    recordFrame,
  };
}

export default {
  usePerformanceOptimization,
  useAdaptiveNetworking,
  useMemoryLeakDetection,
  useFrameRateMonitoring,
};
