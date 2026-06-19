import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

export interface SystemAlert {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  target_role?: string;
  timestamp: string;
  read?: boolean;
}

export interface FleetStats {
  online_drivers: number;
  active_rides: number;
  total_drivers: number;
  rating: number;
  utilization: number;
  earnings_today: number;
  timestamp: string;
}

/**
 * Hook for real-time system alerts (Admin & Operator)
 */
export function useRealtimeAlerts() {
  const { isAuthenticated, emit, on } = useWebSocket();
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Subscribe to alerts
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    setIsLoading(true);

    try {
      // Emit subscription based on user role (will be determined by backend)
      emit('admin:subscribe_alerts');
      emit('admin:subscribe_system_health');

      // Listen for alert events
      const unsubscribeAlerts = on('alert:received', (data: SystemAlert) => {
        setAlerts(prev => [
          {
            id: data.id || `alert_${Date.now()}`,
            ...data,
            read: false,
          },
          ...prev,
        ].slice(0, 100)); // Keep last 100 alerts

        // Auto-dismiss non-critical alerts after 10 seconds
        if (data.severity !== 'critical') {
          setTimeout(() => {
            markAlertAsRead(data.id);
          }, 10000);
        }
      });

      setIsLoading(false);

      return () => {
        unsubscribeAlerts();
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsLoading(false);
    }
  }, [isAuthenticated, emit, on]);

  // Mark alert as read
  const markAlertAsRead = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  // Get alerts by severity
  const getCriticalAlerts = useCallback(() => {
    return alerts.filter(a => a.severity === 'critical');
  }, [alerts]);

  const getHighPriorityAlerts = useCallback(() => {
    return alerts.filter(a => a.severity === 'high' || a.severity === 'critical');
  }, [alerts]);

  return {
    alerts,
    isLoading,
    error,
    markAlertAsRead,
    getCriticalAlerts,
    getHighPriorityAlerts,
  };
}

/**
 * Hook for real-time fleet stats (Operator)
 */
export function useFleetStats(operatorId?: string) {
  const { isAuthenticated, emit, on } = useWebSocket();
  const [stats, setStats] = useState<FleetStats>({
    online_drivers: 0,
    active_rides: 0,
    total_drivers: 0,
    rating: 0,
    utilization: 0,
    earnings_today: 0,
    timestamp: new Date().toISOString(),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Subscribe to fleet updates
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    setIsLoading(true);

    try {
      emit('operator:subscribe_fleet');

      // Listen for fleet stats updates
      const unsubscribeFleetStats = on('operator:fleet_updated', (data: Partial<FleetStats>) => {
        setStats(prev => ({
          ...prev,
          ...data,
          timestamp: new Date().toISOString(),
        }));
        setIsLoading(false);
      });

      // Listen for subscription confirmation
      const unsubscribeConfirm = on('operator:fleet_subscription_confirmed', () => {
        setIsLoading(false);
      });

      return () => {
        unsubscribeFleetStats();
        unsubscribeConfirm();
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsLoading(false);
    }
  }, [isAuthenticated, emit, on]);

  // Calculate utilization percentage
  const getUtilization = useCallback(() => {
    if (stats.total_drivers === 0) return 0;
    return (stats.active_rides / stats.total_drivers) * 100;
  }, [stats.active_rides, stats.total_drivers]);

  // Refresh stats
  const refreshStats = useCallback(() => {
    setIsLoading(true);
    // Server will push updated stats
  }, []);

  return {
    stats,
    isLoading,
    error,
    utilization: getUtilization(),
    refreshStats,
  };
}

/**
 * Hook for operator driver notifications (driver status changes, incentives, etc.)
 */
export function useOperatorNotifications() {
  const { isAuthenticated, on } = useWebSocket();
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const unsubscribeStatus = on('driver:status_changed', (data: any) => {
      addNotification({
        type: 'driver_status',
        driver_id: data.driver_id,
        message: `Driver is now ${data.online ? 'online' : 'offline'}`,
        severity: 'info',
        timestamp: new Date(),
      });
    });

    const unsubscribeAlert = on('alert:received', (data: any) => {
      addNotification({
        type: 'system_alert',
        ...data,
        timestamp: new Date(),
      });
    });

    return () => {
      unsubscribeStatus();
      unsubscribeAlert();
    };
  }, [isAuthenticated, on]);

  const addNotification = useCallback((notification: any) => {
    setNotifications(prev => [notification, ...prev].slice(0, 50));

    // Auto-dismiss non-critical after 5 seconds
    if (notification.severity !== 'critical') {
      setTimeout(() => {
        removeNotification(notification.id || notification.driver_id);
      }, 5000);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id && n.driver_id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    removeNotification,
    clearAll,
  };
}

/**
 * Hook for admin system health monitoring
 */
export function useSystemHealth() {
  const { isAuthenticated, emit, on } = useWebSocket();
  const [health, setHealth] = useState({
    api_status: 'healthy',
    database_status: 'healthy',
    cache_status: 'healthy',
    payment_gateway_status: 'healthy',
    timestamp: new Date().toISOString(),
  });
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Subscribe to health updates
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    emit('admin:subscribe_system_health');
    setIsMonitoring(true);

    const unsubscribeHealth = on('admin:health_update', (data: any) => {
      setHealth(prev => ({
        ...prev,
        ...data,
        timestamp: new Date().toISOString(),
      }));
    });

    return () => {
      unsubscribeHealth();
      setIsMonitoring(false);
    };
  }, [isAuthenticated, emit, on]);

  // Check if all systems are healthy
  const isAllHealthy = useCallback(() => {
    return (
      health.api_status === 'healthy' &&
      health.database_status === 'healthy' &&
      health.cache_status === 'healthy' &&
      health.payment_gateway_status === 'healthy'
    );
  }, [health]);

  // Get unhealthy systems
  const getUnhealthySystems = useCallback(() => {
    const unhealthy = [];
    if (health.api_status !== 'healthy') unhealthy.push('API');
    if (health.database_status !== 'healthy') unhealthy.push('Database');
    if (health.cache_status !== 'healthy') unhealthy.push('Cache');
    if (health.payment_gateway_status !== 'healthy') unhealthy.push('Payment Gateway');
    return unhealthy;
  }, [health]);

  return {
    health,
    isMonitoring,
    isAllHealthy: isAllHealthy(),
    unhealthySystems: getUnhealthySystems(),
  };
}

export default useRealtimeAlerts;
