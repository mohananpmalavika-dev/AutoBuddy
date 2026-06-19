import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

export interface EarningsUpdate {
  amount: number;
  ride_id: string;
  timestamp: string;
}

export interface DriverEarnings {
  today: number;
  week: number;
  month: number;
  average_rating: number;
  total_rides: number;
  acceptance_rate: number;
  recent_updates: EarningsUpdate[];
}

/**
 * Hook for real-time driver earnings updates
 * Listens for earning notifications when rides complete
 */
export function useRealtimeEarnings(initialEarnings?: Partial<DriverEarnings>) {
  const { isAuthenticated, on, off } = useWebSocket();
  const [earnings, setEarnings] = useState<DriverEarnings>({
    today: initialEarnings?.today || 0,
    week: initialEarnings?.week || 0,
    month: initialEarnings?.month || 0,
    average_rating: initialEarnings?.average_rating || 4.5,
    total_rides: initialEarnings?.total_rides || 0,
    acceptance_rate: initialEarnings?.acceptance_rate || 0.9,
    recent_updates: initialEarnings?.recent_updates || [],
  });
  const [latestEarning, setLatestEarning] = useState<EarningsUpdate | null>(null);

  // Listen for earning updates
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const unsubscribe = on('driver:earning_updated', (data: EarningsUpdate) => {
      setEarnings(prev => {
        const updatedToday = prev.today + data.amount;
        const updatedWeek = prev.week + data.amount;
        const updatedMonth = prev.month + data.amount;

        return {
          ...prev,
          today: updatedToday,
          week: updatedWeek,
          month: updatedMonth,
          total_rides: prev.total_rides + 1,
          recent_updates: [data, ...prev.recent_updates.slice(0, 9)],
        };
      });

      setLatestEarning(data);

      // Clear latest earning notification after 5 seconds
      setTimeout(() => {
        setLatestEarning(null);
      }, 5000);
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, on, off]);

  // Listen for incentive notifications
  const [incentive, setIncentive] = useState<any | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const unsubscribe = on('driver:incentive_updated', (data: any) => {
      setIncentive(data);

      // Clear incentive notification after 5 seconds
      setTimeout(() => {
        setIncentive(null);
      }, 5000);
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, on, off]);

  // Reset earnings
  const resetEarnings = useCallback(() => {
    setEarnings({
      today: 0,
      week: 0,
      month: 0,
      average_rating: 4.5,
      total_rides: 0,
      acceptance_rate: 0.9,
      recent_updates: [],
    });
  }, []);

  // Manual update (for sync with backend)
  const updateEarnings = useCallback((newEarnings: Partial<DriverEarnings>) => {
    setEarnings(prev => ({
      ...prev,
      ...newEarnings,
    }));
  }, []);

  return {
    earnings,
    latestEarning,
    incentive,
    resetEarnings,
    updateEarnings,
  };
}

/**
 * Hook for real-time driver status changes
 */
export function useDriverStatus() {
  const { isAuthenticated, emit, on } = useWebSocket();
  const [isOnline, setIsOnline] = useState(false);
  const [statusChangeInProgress, setStatusChangeInProgress] = useState(false);

  // Listen for status change confirmations
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const unsubscribe = on('driver:status_changed', (data: any) => {
      setIsOnline(data.online);
      setStatusChangeInProgress(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, on]);

  // Toggle online status
  const toggleStatus = useCallback(async () => {
    setStatusChangeInProgress(true);
    const newStatus = !isOnline;

    try {
      emit('driver:online_status_changed', { online: newStatus });

      // Timeout after 3 seconds if no response
      setTimeout(() => {
        setStatusChangeInProgress(false);
      }, 3000);
    } catch (err) {
      console.error('Error toggling status:', err);
      setStatusChangeInProgress(false);
    }
  }, [isOnline, emit]);

  return {
    isOnline,
    statusChangeInProgress,
    toggleStatus,
  };
}

/**
 * Hook for real-time driver alerts and notifications
 */
export function useDriverAlerts() {
  const { isAuthenticated, on } = useWebSocket();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const unsubscribeAlert = on('alert:received', (data: any) => {
      setAlerts(prev => [
        {
          id: data.id || `alert_${Date.now()}`,
          ...data,
          read: false,
          createdAt: new Date(),
        },
        ...prev,
      ].slice(0, 50)); // Keep last 50 alerts

      setUnresolvedCount(prev => prev + 1);
    });

    return () => {
      unsubscribeAlert();
    };
  }, [isAuthenticated, on]);

  // Mark alert as read
  const markAsRead = useCallback((alertId: string) => {
    setAlerts(prev =>
      prev.map(a =>
        a.id === alertId ? { ...a, read: true } : a
      )
    );
    setUnresolvedCount(prev => Math.max(0, prev - 1));
  }, []);

  // Clear all alerts
  const clearAlerts = useCallback(() => {
    setAlerts([]);
    setUnresolvedCount(0);
  }, []);

  return {
    alerts,
    unresolvedCount,
    markAsRead,
    clearAlerts,
  };
}

export default useRealtimeEarnings;
