import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

const PAYMENT_METHODS = {
  bank_transfer: 'Bank Transfer',
  upi: 'UPI',
  wallet: 'Wallet',
  razorpay: 'Razorpay',
};

const SCHEDULE_TYPES = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  manual: 'Manual (On Demand)',
};

export function usePaymentMethods({ token, driverId }) {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [payoutSchedule, setPayoutSchedule] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load all payment methods
  const loadPaymentMethods = useCallback(async () => {
    if (!token || !driverId) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier2/payment-methods`, {
        method: 'GET',
        token,
      });

      const payload = response?.data || response;
      setPaymentMethods(payload?.methods || []);
    } catch (err) {
      setError(`Failed to load payment methods: ${err.message}`);
      console.warn('Load payment methods error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Add new payment method
  const addPaymentMethod = useCallback(
    async (methodType, accountDetails) => {
      if (!token || !driverId) {
        setError('Missing required data');
        return false;
      }

      if (!PAYMENT_METHODS[methodType]) {
        setError('Invalid payment method type');
        return false;
      }

      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers-tier2/payment-methods`, {
          method: 'POST',
          token,
          body: {
            method_type: methodType,
            ...accountDetails,
          },
        });

        await loadPaymentMethods();
        return true;
      } catch (err) {
        setError(`Failed to add payment method: ${err.message}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [token, driverId, loadPaymentMethods]
  );

  // Update payment method
  const updatePaymentMethod = useCallback(
    async (methodId, updates) => {
      if (!token || !driverId) {
        setError('Missing required data');
        return false;
      }

      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers-tier2/payment-methods/${methodId}`, {
          method: 'PATCH',
          token,
          body: updates,
        });

        await loadPaymentMethods();
        return true;
      } catch (err) {
        setError(`Failed to update payment method: ${err.message}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [token, driverId, loadPaymentMethods]
  );

  // Delete payment method
  const deletePaymentMethod = useCallback(
    async (methodId) => {
      if (!token || !driverId) {
        setError('Missing required data');
        return false;
      }

      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers-tier2/payment-methods/${methodId}`, {
          method: 'DELETE',
          token,
        });

        await loadPaymentMethods();
        return true;
      } catch (err) {
        setError(`Failed to delete payment method: ${err.message}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [token, driverId, loadPaymentMethods]
  );

  // Set default payment method
  const setDefaultPaymentMethod = useCallback(
    async (methodId) => {
      return updatePaymentMethod(methodId, { is_default: true });
    },
    [updatePaymentMethod]
  );

  // Load payout schedule
  const loadPayoutSchedule = useCallback(async () => {
    if (!token || !driverId) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier2/payout-schedule`, {
        method: 'GET',
        token,
      });

      const payload = response?.data || response;
      setPayoutSchedule(payload || null);
    } catch (err) {
      console.warn('Failed to load payout schedule:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Update payout schedule
  const updatePayoutSchedule = useCallback(
    async (paymentMethodId, scheduleConfig) => {
      if (!token || !driverId) {
        setError('Missing required data');
        return false;
      }

      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers-tier2/payout-schedule`, {
          method: 'POST',
          token,
          body: {
            payment_method_id: paymentMethodId,
            ...scheduleConfig,
          },
        });

        await loadPayoutSchedule();
        return true;
      } catch (err) {
        setError(`Failed to update payout schedule: ${err.message}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [token, driverId, loadPayoutSchedule]
  );

  // Load payout history
  const loadPayoutHistory = useCallback(async () => {
    if (!token || !driverId) return;

    setIsLoading(true);

    try {
      const response = await apiRequest(`/drivers-tier2/payouts/history`, {
        method: 'GET',
        token,
      });

      const payload = response?.data || response;
      setPayoutHistory(payload?.payouts || []);
    } catch (err) {
      console.warn('Failed to load payout history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Request manual payout
  const requestManualPayout = useCallback(
    async (amount, paymentMethodId) => {
      if (!token || !driverId) {
        setError('Missing required data');
        return false;
      }

      if (amount <= 0) {
        setError('Payout amount must be greater than 0');
        return false;
      }

      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers-tier2/payouts/request`, {
          method: 'POST',
          token,
          body: {
            amount,
            payment_method_id: paymentMethodId,
          },
        });

        await loadPayoutHistory();
        return true;
      } catch (err) {
        setError(`Failed to request payout: ${err.message}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [token, driverId, loadPayoutHistory]
  );

  return {
    paymentMethods,
    payoutSchedule,
    payoutHistory,
    isLoading,
    error,
    PAYMENT_METHODS,
    SCHEDULE_TYPES,
    loadPaymentMethods,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
    loadPayoutSchedule,
    updatePayoutSchedule,
    loadPayoutHistory,
    requestManualPayout,
  };
}
