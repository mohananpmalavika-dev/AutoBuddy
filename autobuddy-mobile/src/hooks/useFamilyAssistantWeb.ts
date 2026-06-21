import { useState, useCallback, useEffect } from 'react';
import {
  FamilyAppointment,
  FamilyNotification,
  FamilyMember,
  QuickActionBookingRequest,
  QuickActionBookingResponse,
  DashboardData,
} from '../services/familyAssistantService';

interface UseFamilyAssistantWebReturn {
  // Family Members
  familyMembers: FamilyMember[];
  addFamilyMember: (data: Omit<FamilyMember, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_sync'>) => Promise<void>;
  removeFamilyMember: (memberId: string) => Promise<void>;
  updateFamilyMember: (memberId: string, data: Partial<FamilyMember>) => Promise<void>;

  // Appointments
  appointments: FamilyAppointment[];
  upcomingAppointments: FamilyAppointment[];
  addAppointment: (memberId: string, data: Omit<FamilyAppointment, 'id' | 'status' | 'created_at' | 'updated_at' | 'member_id'>) => Promise<void>;
  updateAppointment: (appointmentId: string, data: Partial<FamilyAppointment>) => Promise<void>;
  cancelAppointment: (appointmentId: string) => Promise<void>;
  refreshAppointments: () => Promise<void>;

  // Notifications
  notifications: FamilyNotification[];
  unreadCount: number;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;

  // One-Click Booking
  quickBookRide: (request: QuickActionBookingRequest) => Promise<QuickActionBookingResponse>;
  bookingLoading: boolean;
  bookingError: string | null;

  // Dashboard
  dashboardData: DashboardData | null;
  refreshDashboard: () => Promise<void>;

  // Analytics
  getAnalytics: (timeRange: 'week' | 'month' | 'year') => Promise<any>;

  // Calendar Sync
  initializeCalendarSync: (memberId: string, provider: 'google' | 'apple' | 'outlook') => Promise<void>;
  syncCalendar: (memberId: string) => Promise<void>;

  // State
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
}

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export const useFamilyAssistantWeb = (userId: string, token?: string): UseFamilyAssistantWebReturn => {
  // State
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [appointments, setAppointments] = useState<FamilyAppointment[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<FamilyAppointment[]>([]);
  const [notifications, setNotifications] = useState<FamilyNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Fetch helper
  const fetchAPI = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
      };

      if (token) {
        (headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/family${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API error: ${response.status}`);
      }

      return response.json();
    },
    [token]
  );

  // Family Members Operations
  const fetchFamilyMembers = useCallback(async () => {
    try {
      const data = await fetchAPI('/members/list');
      setFamilyMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch family members');
    }
  }, [fetchAPI]);

  const addFamilyMember = useCallback(
    async (data: Omit<FamilyMember, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_sync'>) => {
      try {
        setLoading(true);
        await fetchAPI('/members/add', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        await fetchFamilyMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add family member');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAPI, fetchFamilyMembers]
  );

  const removeFamilyMember = useCallback(
    async (memberId: string) => {
      try {
        setLoading(true);
        await fetchAPI(`/members/${memberId}`, { method: 'DELETE' });
        await fetchFamilyMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove family member');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAPI, fetchFamilyMembers]
  );

  const updateFamilyMember = useCallback(
    async (memberId: string, data: Partial<FamilyMember>) => {
      try {
        setLoading(true);
        await fetchAPI(`/members/${memberId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        await fetchFamilyMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update family member');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAPI, fetchFamilyMembers]
  );

  // Appointments Operations
  const fetchAppointments = useCallback(async () => {
    try {
      if (familyMembers.length === 0) return;
      const allAppointments: FamilyAppointment[] = [];
      for (const member of familyMembers) {
        const data = await fetchAPI(`/appointments/${member.id}`);
        allAppointments.push(...data);
      }
      setAppointments(allAppointments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch appointments');
    }
  }, [fetchAPI, familyMembers]);

  const fetchUpcomingAppointments = useCallback(async () => {
    try {
      const data = await fetchAPI('/appointments/upcoming?limit=10');
      setUpcomingAppointments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch upcoming appointments');
    }
  }, [fetchAPI]);

  const addAppointment = useCallback(
    async (memberId: string, data: Omit<FamilyAppointment, 'id' | 'status' | 'created_at' | 'updated_at' | 'member_id'>) => {
      try {
        setLoading(true);
        await fetchAPI('/appointments/add', {
          method: 'POST',
          body: JSON.stringify({ member_id: memberId, ...data }),
        });
        await fetchAppointments();
        await fetchUpcomingAppointments();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add appointment');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAPI, fetchAppointments, fetchUpcomingAppointments]
  );

  const updateAppointment = useCallback(
    async (appointmentId: string, data: Partial<FamilyAppointment>) => {
      try {
        setLoading(true);
        await fetchAPI(`/appointments/${appointmentId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        await fetchAppointments();
        await fetchUpcomingAppointments();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update appointment');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAPI, fetchAppointments, fetchUpcomingAppointments]
  );

  const cancelAppointment = useCallback(
    async (appointmentId: string) => {
      try {
        setLoading(true);
        await fetchAPI(`/appointments/${appointmentId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await fetchAppointments();
        await fetchUpcomingAppointments();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to cancel appointment');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAPI, fetchAppointments, fetchUpcomingAppointments]
  );

  const refreshAppointments = useCallback(async () => {
    await Promise.all([fetchAppointments(), fetchUpcomingAppointments()]);
  }, [fetchAppointments, fetchUpcomingAppointments]);

  // Notifications Operations
  const fetchNotifications = useCallback(async () => {
    try {
      const data = await fetchAPI('/notifications?limit=20');
      setNotifications(data);
      const unread = data.filter((n: FamilyNotification) => !n.read).length;
      setUnreadCount(unread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications');
    }
  }, [fetchAPI]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      try {
        await fetchAPI(`/notifications/${notificationId}/read`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await fetchNotifications();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to mark notification as read');
      }
    },
    [fetchAPI, fetchNotifications]
  );

  const markAllRead = useCallback(async () => {
    try {
      await fetchAPI('/notifications/mark-all-read', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await fetchNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all notifications as read');
    }
  }, [fetchAPI, fetchNotifications]);

  const refreshNotifications = fetchNotifications;

  // One-Click Booking
  const handleQuickBookRide = useCallback(
    async (request: QuickActionBookingRequest) => {
      try {
        setBookingLoading(true);
        setBookingError(null);
        const response = await fetchAPI('/quick-actions/book-ride', {
          method: 'POST',
          body: JSON.stringify(request),
        });
        await Promise.all([fetchNotifications(), fetchUpcomingAppointments()]);
        return response;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to book ride';
        setBookingError(errorMsg);
        throw err;
      } finally {
        setBookingLoading(false);
      }
    },
    [fetchAPI, fetchNotifications, fetchUpcomingAppointments]
  );

  // Dashboard
  const fetchDashboardData = useCallback(async () => {
    try {
      const data = await fetchAPI('/dashboard');
      setDashboardData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    }
  }, [fetchAPI]);

  // Analytics
  const getAnalytics = useCallback(
    async (timeRange: 'week' | 'month' | 'year' = 'month') => {
      try {
        return await fetchAPI(`/analytics?timeRange=${timeRange}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
        throw err;
      }
    },
    [fetchAPI]
  );

  // Calendar Sync
  const initializeCalendarSync = useCallback(
    async (memberId: string, provider: 'google' | 'apple' | 'outlook') => {
      try {
        setLoading(true);
        await fetchAPI(`/members/${memberId}/calendar/initialize`, {
          method: 'POST',
          body: JSON.stringify({ provider }),
        });
        await fetchFamilyMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize calendar sync');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAPI, fetchFamilyMembers]
  );

  const syncCalendar = useCallback(
    async (memberId: string) => {
      try {
        setLoading(true);
        await fetchAPI(`/members/${memberId}/calendar/sync`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await fetchAppointments();
        await fetchUpcomingAppointments();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to sync calendar');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAPI, fetchAppointments, fetchUpcomingAppointments]
  );

  // Refresh All
  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchFamilyMembers(),
        fetchAppointments(),
        fetchUpcomingAppointments(),
        fetchNotifications(),
        fetchDashboardData(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setLoading(false);
    }
  }, [fetchFamilyMembers, fetchAppointments, fetchUpcomingAppointments, fetchNotifications, fetchDashboardData]);

  // Initial load
  useEffect(() => {
    if (userId) {
      refreshAll();
    }
  }, [userId]);

  return {
    // Family Members
    familyMembers,
    addFamilyMember,
    removeFamilyMember,
    updateFamilyMember,

    // Appointments
    appointments,
    upcomingAppointments,
    addAppointment,
    updateAppointment,
    cancelAppointment,
    refreshAppointments,

    // Notifications
    notifications,
    unreadCount,
    markNotificationRead,
    markAllRead,
    refreshNotifications,

    // One-Click Booking
    quickBookRide: handleQuickBookRide,
    bookingLoading,
    bookingError,

    // Dashboard
    dashboardData,
    refreshDashboard: fetchDashboardData,

    // Analytics
    getAnalytics,

    // Calendar Sync
    initializeCalendarSync,
    syncCalendar,

    // State
    loading,
    error,
    refreshAll,
  };
};
