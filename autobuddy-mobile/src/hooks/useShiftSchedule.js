import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function useShiftSchedule({ token, driverId }) {
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load all shift schedules
  const loadSchedules = useCallback(async () => {
    if (!token || !driverId) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier3/shift-schedule`, {
        method: 'GET',
        token,
      });

      const payload = response?.data || response;
      if (payload?.schedules) {
        setSchedules(payload.schedules);
        return payload.schedules;
      }
    } catch (err) {
      setError(`Failed to load schedules: ${err.message}`);
      console.warn('Load schedules error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Create new shift schedule
  const createSchedule = useCallback(async (dayOfWeek, startTime, endTime, isRecurring = true) => {
    if (!token || !driverId) return null;

    try {
      const response = await apiRequest(`/drivers-tier3/shift-schedule`, {
        method: 'POST',
        token,
        body: {
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          is_active: true,
          is_recurring: isRecurring,
        },
      });

      const payload = response?.data || response;
      if (payload) {
        setSchedules(prev => [...prev, payload]);
        return payload;
      }
    } catch (err) {
      setError(`Failed to create schedule: ${err.message}`);
      console.warn('Create schedule error:', err);
    }
  }, [token, driverId]);

  // Update shift schedule
  const updateSchedule = useCallback(async (scheduleId, startTime, endTime, isActive) => {
    if (!token) return null;

    try {
      const response = await apiRequest(`/drivers-tier3/shift-schedule/${scheduleId}`, {
        method: 'PATCH',
        token,
        body: {
          start_time: startTime,
          end_time: endTime,
          is_active: isActive,
        },
      });

      const payload = response?.data || response;
      if (payload) {
        setSchedules(prev =>
          prev.map(sch => (sch.id === scheduleId ? payload : sch))
        );
        return payload;
      }
    } catch (err) {
      setError(`Failed to update schedule: ${err.message}`);
      console.warn('Update schedule error:', err);
    }
  }, [token]);

  // Delete shift schedule
  const deleteSchedule = useCallback(async (scheduleId) => {
    if (!token) return null;

    try {
      await apiRequest(`/drivers-tier3/shift-schedule/${scheduleId}`, {
        method: 'DELETE',
        token,
      });

      setSchedules(prev => prev.filter(sch => sch.id !== scheduleId));
      return true;
    } catch (err) {
      setError(`Failed to delete schedule: ${err.message}`);
      console.warn('Delete schedule error:', err);
    }
  }, [token]);

  // Get total weekly hours
  const getTotalWeeklyHours = useCallback(() => {
    if (!schedules || schedules.length === 0) return 0;

    return schedules.reduce((total, sch) => {
      const [startH, startM] = sch.start_time.split(':').map(Number);
      const [endH, endM] = sch.end_time.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const hours = (endMinutes - startMinutes) / 60;
      return total + hours;
    }, 0);
  }, [schedules]);

  // Get schedule for specific day
  const getScheduleForDay = useCallback((dayOfWeek) => {
    return schedules.find(sch => sch.day_of_week === dayOfWeek);
  }, [schedules]);

  // Get formatted schedule summary
  const getScheduleSummary = useCallback(() => {
    return schedules.map(sch => ({
      day: DAYS[sch.day_of_week] || `Day ${sch.day_of_week}`,
      startTime: sch.start_time,
      endTime: sch.end_time,
      isActive: sch.is_active,
    }));
  }, [schedules]);

  return {
    schedules,
    isLoading,
    error,
    loadSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    getTotalWeeklyHours,
    getScheduleForDay,
    getScheduleSummary,
  };
}
