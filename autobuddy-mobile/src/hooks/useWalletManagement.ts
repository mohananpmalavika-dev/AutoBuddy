import { useEffect, useCallback, useState } from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface WalletBalance {
  current_balance: number;
  total_topups: number;
  total_spent: number;
  total_cashback_received: number;
  max_balance: number;
  can_topup: boolean;
  last_transaction_at: string | null;
}

interface WalletTransaction {
  transaction_id: string;
  type: string;
  status: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string;
  created_at: string;
  ride_id?: string;
}

interface WalletSummary {
  current_balance: number;
  max_balance: number;
  total_topups: number;
  total_spent: number;
  total_cashback_received: number;
  auto_recharge_enabled: boolean;
  this_month_spent: number;
  recent_transactions: WalletTransaction[];
}

interface AutoRechargeConfig {
  status: string;
  is_enabled: boolean;
  threshold_amount?: number;
  recharge_amount?: number;
  last_recharge_at?: string;
  total_auto_recharged: number;
}

/**
 * Hook for managing user wallet and in-app balance
 * Handles:
 * - Balance display and updates
 * - Wallet topup flow
 * - Auto-recharge configuration
 * - Transaction history with pagination
 * - Cashback tracking
 * - Refund processing
 */
export const useWalletManagement = (userId: string | null, authToken: string | null) => {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [autoRecharge, setAutoRecharge] = useState<AutoRechargeConfig | null>(null);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch wallet balance
  const fetchBalance = useCallback(async () => {
    if (!userId || !authToken) return;

    try {
      setIsLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/wallet/balance/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setBalance(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching balance:', err);
      setError('Failed to load wallet balance');
    } finally {
      setIsLoading(false);
    }
  }, [userId, authToken]);

  // Fetch transaction history with pagination
  const fetchTransactionHistory = useCallback(async (page: number = 1, type?: string) => {
    if (!userId || !authToken) return;

    try {
      setIsLoading(true);
      const url = `${API_BASE_URL}/api/v3/wallet/transactions/${userId}?page=${page}&per_page=10`;
      const response = await axios.get(
        type ? `${url}&type=${type}` : url,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setTransactions(response.data.transactions);
      setCurrentPage(page);
      setTotalPages(response.data.total_pages);
      setError(null);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Failed to load transaction history');
    } finally {
      setIsLoading(false);
    }
  }, [userId, authToken]);

  // Fetch wallet summary for dashboard
  const fetchSummary = useCallback(async () => {
    if (!userId || !authToken) return;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/wallet/summary/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setSummary(response.data);
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  }, [userId, authToken]);

  // Fetch auto-recharge config
  const fetchAutoRecharge = useCallback(async () => {
    if (!userId || !authToken) return;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/wallet/auto-recharge/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setAutoRecharge(response.data);
    } catch (err) {
      console.error('Error fetching auto-recharge config:', err);
    }
  }, [userId, authToken]);

  // Initiate wallet topup
  const initiateTopup = useCallback(async (amount: number, paymentMethod: string = 'card', promoCode?: string) => {
    if (!userId || !authToken) return null;

    try {
      setIsLoading(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/v3/wallet/topup`,
        {
          user_id: userId,
          amount,
          payment_method: paymentMethod,
          promo_code: promoCode
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      return {
        topup_id: response.data.topup_id,
        total_charged: response.data.total_charged,
        discount_amount: response.data.discount_amount
      };
    } catch (err) {
      console.error('Error initiating topup:', err);
      setError('Failed to initiate topup');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, authToken]);

  // Confirm topup after Stripe payment
  const confirmTopup = useCallback(async (topupId: string, stripePaymentId: string) => {
    if (!authToken) return false;

    try {
      setIsLoading(true);
      await axios.post(
        `${API_BASE_URL}/api/v3/wallet/topup/${topupId}/confirm`,
        { stripe_payment_id: stripePaymentId },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Refresh balance
      await fetchBalance();
      await fetchTransactionHistory();
      return true;
    } catch (err) {
      console.error('Error confirming topup:', err);
      setError('Failed to confirm topup');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [authToken, fetchBalance, fetchTransactionHistory]);

  // Setup auto-recharge
  const setupAutoRecharge = useCallback(async (threshold: number, amount: number, paymentMethodId: string) => {
    if (!userId || !authToken) return false;

    try {
      setIsLoading(true);
      await axios.post(
        `${API_BASE_URL}/api/v3/wallet/auto-recharge/setup`,
        {
          user_id: userId,
          threshold_amount: threshold,
          recharge_amount: amount,
          payment_method_id: paymentMethodId
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      await fetchAutoRecharge();
      return true;
    } catch (err) {
      console.error('Error setting up auto-recharge:', err);
      setError('Failed to setup auto-recharge');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userId, authToken, fetchAutoRecharge]);

  // Disable auto-recharge
  const disableAutoRecharge = useCallback(async () => {
    if (!userId || !authToken) return false;

    try {
      await axios.post(
        `${API_BASE_URL}/api/v3/wallet/auto-recharge/${userId}/disable`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      await fetchAutoRecharge();
      return true;
    } catch (err) {
      console.error('Error disabling auto-recharge:', err);
      return false;
    }
  }, [userId, authToken, fetchAutoRecharge]);

  // Calculate cashback for amount
  const calculateCashback = useCallback(async (amount: number) => {
    if (!userId || !authToken) return null;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/wallet/cashback/calculate?user_id=${userId}&transaction_amount=${amount}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      return {
        total_cashback: response.data.total_cashback,
        percentage: response.data.cashback_percentage,
        breakdown: response.data.breakdown
      };
    } catch (err) {
      console.error('Error calculating cashback:', err);
      return null;
    }
  }, [userId, authToken]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2)}`;
  };

  // Initial fetch on mount
  useEffect(() => {
    if (userId && authToken) {
      fetchBalance();
      fetchSummary();
      fetchTransactionHistory();
      fetchAutoRecharge();
    }
  }, [userId, authToken, fetchBalance, fetchSummary, fetchTransactionHistory, fetchAutoRecharge]);

  return {
    // Data
    balance,
    transactions,
    autoRecharge,
    summary,
    currentPage,
    totalPages,

    // State
    isLoading,
    error,

    // Functions
    fetchBalance,
    fetchTransactionHistory,
    fetchSummary,
    fetchAutoRecharge,
    initiateTopup,
    confirmTopup,
    setupAutoRecharge,
    disableAutoRecharge,
    calculateCashback,
    setCurrentPage,

    // Utilities
    formatCurrency
  };
};
