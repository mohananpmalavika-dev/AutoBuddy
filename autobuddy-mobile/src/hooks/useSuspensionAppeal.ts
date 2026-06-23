import { useState, useEffect, useCallback } from 'react';

export interface Suspension {
  suspension_id: string;
  driver_id: string;
  reason: string;
  date_suspended: string;
  suspension_status: 'active' | 'appealed' | 'lifted';
  can_appeal: boolean;
  appeal_deadline?: string;
}

export interface Appeal {
  appeal_id: string;
  suspension_id: string;
  driver_id: string;
  appeal_reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at?: string;
  decision_message?: string;
  reviewed_by?: string;
  supporting_documents?: string[];
}

export interface AppealState {
  activeSuspension: Suspension | null;
  appealHistory: Appeal[];
  pendingAppeal: Appeal | null;
  isAppealingNow: boolean;
  isLoading: boolean;
  error: string | null;
}

const API_BASE = 'http://localhost:8000/api';

export function useSuspensionAppeal(userId: string | undefined, authToken: string) {
  const [state, setState] = useState<AppealState>({
    activeSuspension: null,
    appealHistory: [],
    pendingAppeal: null,
    isAppealingNow: false,
    isLoading: false,
    error: null,
  });

  const fetchActiveSuspension = useCallback(async () => {
    if (!userId || !authToken) {return;}

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`${API_BASE}/v3/kyc/suspension/${userId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) {
        // No suspension - 404 is expected
        if (response.status === 404) {
          setState(prev => ({
            ...prev,
            activeSuspension: null,
            isLoading: false,
          }));
          return;
        }
        throw new Error('Failed to fetch suspension');
      }

      const data = await response.json();
      setState(prev => ({
        ...prev,
        activeSuspension: data.suspension || null,
        isLoading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unknown error',
        isLoading: false,
      }));
    }
  }, [userId, authToken]);

  const fetchAppealHistory = useCallback(async () => {
    if (!userId || !authToken) {return;}

    try {
      const response = await fetch(`${API_BASE}/v3/kyc/appeals/${userId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) {throw new Error('Failed to fetch appeal history');}

      const data = await response.json();
      const appeals = data.appeals || [];
      const pending = appeals.find((a: Appeal) => a.status === 'pending') || null;

      setState(prev => ({
        ...prev,
        appealHistory: appeals,
        pendingAppeal: pending,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [userId, authToken]);

  const submitAppeal = useCallback(
    async (reason: string, documents?: File[]): Promise<Appeal | null> => {
      if (!userId || !authToken || !state.activeSuspension) {return null;}

      setState(prev => ({ ...prev, isAppealingNow: true, error: null }));
      try {
        const formData = new FormData();
        formData.append('suspension_id', state.activeSuspension.suspension_id);
        formData.append('appeal_reason', reason);

        if (documents && documents.length > 0) {
          documents.forEach((doc, index) => {
            formData.append(`document_${index}`, doc);
          });
        }

        const response = await fetch(`${API_BASE}/v3/kyc/appeal/submit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body: formData,
        });

        if (!response.ok) {throw new Error('Failed to submit appeal');}

        const data = await response.json();
        const newAppeal = data.appeal;

        setState(prev => ({
          ...prev,
          pendingAppeal: newAppeal,
          appealHistory: [newAppeal, ...prev.appealHistory],
          isAppealingNow: false,
        }));

        return newAppeal;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to submit appeal',
          isAppealingNow: false,
        }));
        return null;
      }
    },
    [userId, authToken, state.activeSuspension]
  );

  const getAppealStatus = useCallback(
    (appealId: string): Appeal | null => {
      return state.appealHistory.find(a => a.appeal_id === appealId) || null;
    },
    [state.appealHistory]
  );

  const getAppealDecision = useCallback((appealId: string): string | null => {
    const appeal = state.appealHistory.find(a => a.appeal_id === appealId);
    return appeal?.decision_message || null;
  }, [state.appealHistory]);

  const calculateDaysSinceSuspension = useCallback((suspensionDate: string): number => {
    const now = new Date();
    const suspended = new Date(suspensionDate);
    const diffTime = Math.abs(now.getTime() - suspended.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, []);

  const calculateDaysUntilDeadline = useCallback((suspensionDate: string): number => {
    const suspended = new Date(suspensionDate);
    const deadline = new Date(suspended.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const now = new Date();
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, []);

  useEffect(() => {
    if (userId && authToken) {
      fetchActiveSuspension();
      fetchAppealHistory();

      // Refresh every 30 seconds
      const interval = setInterval(() => {
        fetchActiveSuspension();
        fetchAppealHistory();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [userId, authToken, fetchActiveSuspension, fetchAppealHistory]);

  return {
    ...state,
    fetchActiveSuspension,
    fetchAppealHistory,
    submitAppeal,
    getAppealStatus,
    getAppealDecision,
    calculateDaysSinceSuspension,
    calculateDaysUntilDeadline,
  };
}
