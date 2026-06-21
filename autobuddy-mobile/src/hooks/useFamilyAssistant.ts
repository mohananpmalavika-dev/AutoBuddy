import { useState, useCallback, useEffect } from 'react';
import {
  FamilyAssistantService,
  FamilyAppointment,
  FamilyNotification,
  FamilyMember,
  QuickActionBookingRequest,
  QuickActionBookingResponse,
  DashboardData,
} from '../services/familyAssistantService';

interface UseFamilyAssistantReturn {
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

  // Calendar Sync
  initializeCalendarSync: (memberId: string, provider: 'google' | 'apple' | 'outlook') => Promise<void>;
  syncCalendar: (memberId: string) => Promise<void>;

  // State
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
}

export const useFamilyAssistant = (userId: string): UseFamilyAssistantReturn => {
  const service = new FamilyAssistantService();

  // Family Members State
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  // Appointments State
  const [appointments, setAppointments] = useState<FamilyAppointment[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<FamilyAppointment[]>([]);

  // Notifications State
  const [notifications, setNotifications] = useState<FamilyNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Dashboard State
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  // Loading/Error State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Fetch Family Members
  const fetchFamilyMembers = useCallback(async () => {
    try {
      const members = await service.getFamilyMembers();
      setFamilyMembers(members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch family members');
    }
  }, []);

  // Add Family Member
  const addFamilyMember = useCallback(
    async (data: Omit<FamilyMember, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_sync'>) => {
      try {
        setLoading(true);
        await service.addFamilyMember(data);
        await fetchFamilyMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add family member');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchFamilyMembers]
  );

  // Remove Family Member
  const removeFamilyMember = useCallback(async (memberId: string) => {
    try {
      setLoading(true);
      await service.removeFamilyMember(memberId);
      await fetchFamilyMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove family member');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchFamilyMembers]);

  // Update Family Member
  const updateFamilyMember = useCallback(
    async (memberId: string, data: Partial<FamilyMember>) => {
      try {
        setLoading(true);
        await service.updateFamilyMember(memberId, data);
        await fetchFamilyMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update family member');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchFamilyMembers]
  );

  // Fetch Appointments
  const fetchAppointments = useCallback(async () => {
    try {
      if (familyMembers.length > 0) {
        const allAppointments: FamilyAppointment[] = [];
        for (const member of familyMembers) {
          const memberAppointments = await service.getAppointments(member.id);
          allAppointments.push(...memberAppointments);
        }
        setAppointments(allAppointments);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch appointments');
    }
  }, [familyMembers]);

  // Fetch Upcoming Appointments
  const fetchUpcomingAppointments = useCallback(async () => {
    try {
      const upcoming = await service.getUpcomingAppointments(10);
      setUpcomingAppointments(upcoming);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch upcoming appointments');
    }
  }, []);

  // Add Appointment
  const addAppointment = useCallback(
    async (memberId: string, data: Omit<FamilyAppointment, 'id' | 'status' | 'created_at' | 'updated_at' | 'member_id'>) => {
      try {
        setLoading(true);
        await service.addAppointment(memberId, data);
        await fetchAppointments();
        await fetchUpcomingAppointments();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add appointment');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAppointments, fetchUpcomingAppointments]
  );

  // Update Appointment
  const updateAppointment = useCallback(
    async (appointmentId: string, data: Partial<FamilyAppointment>) => {
      try {
        setLoading(true);
        await service.updateAppointment(appointmentId, data);
        await fetchAppointments();
        await fetchUpcomingAppointments();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update appointment');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAppointments, fetchUpcomingAppointments]
  );

  // Cancel Appointment
  const cancelAppointment = useCallback(
    async (appointmentId: string) => {
      try {
        setLoading(true);
        await service.cancelAppointment(appointmentId);
        await fetchAppointments();
        await fetchUpcomingAppointments();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to cancel appointment');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAppointments, fetchUpcomingAppointments]
  );

  const refreshAppointments = useCallback(async () => {
    await Promise.all([fetchAppointments(), fetchUpcomingAppointments()]);
  }, [fetchAppointments, fetchUpcomingAppointments]);

  // Fetch Notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const notifs = await service.getNotifications(20);
      setNotifications(notifs);
      const unread = notifs.filter(n => !n.read).length;
      setUnreadCount(unread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications');
    }
  }, []);

  // Mark Notification as Read
  const markNotificationRead = useCallback(async (notificationId: string) => {
    try {
      await service.markNotificationRead(notificationId);
      await fetchNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark notification as read');
    }
  }, [fetchNotifications]);

  // Mark All Notifications as Read
  const markAllRead = useCallback(async () => {
    try {
      await service.markAllNotificationsRead();
      await fetchNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all notifications as read');
    }
  }, [fetchNotifications]);

  const refreshNotifications = fetchNotifications;

  // Quick Book Ride
  const handleQuickBookRide = useCallback(async (request: QuickActionBookingRequest) => {
    try {
      setBookingLoading(true);
      setBookingError(null);
      const response = await service.quickBookRide(request);
      await Promise.all([fetchNotifications(), fetchUpcomingAppointments()]);
      return response;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to book ride';
      setBookingError(errorMsg);
      throw err;
    } finally {
      setBookingLoading(false);
    }
  }, [fetchNotifications, fetchUpcomingAppointments]);

  // Fetch Dashboard Data
  const fetchDashboardData = useCallback(async () => {
    try {
      const data = await service.getDashboardData();
      setDashboardData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    }
  }, []);

  const refreshDashboard = fetchDashboardData;

  // Calendar Sync Operations
  const initializeCalendarSync = useCallback(
    async (memberId: string, provider: 'google' | 'apple' | 'outlook') => {
      try {
        setLoading(true);
        await service.initializeCalendarSync(memberId, provider);
        await fetchFamilyMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize calendar sync');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchFamilyMembers]
  );

  const syncCalendar = useCallback(
    async (memberId: string) => {
      try {
        setLoading(true);
        await service.syncCalendar(memberId);
        await fetchAppointments();
        await fetchUpcomingAppointments();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to sync calendar');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchAppointments, fetchUpcomingAppointments]
  );

  // Refresh All Data
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

  // Initial Load
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
    refreshDashboard,

    // Calendar Sync
    initializeCalendarSync,
    syncCalendar,

    // State
    loading,
    error,
    refreshAll,
  };
};
