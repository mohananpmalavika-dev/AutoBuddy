import { useState, useCallback } from 'react';
import axios from 'axios';

export interface WalletTransaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: Date;
}

export interface Payout {
  id: string;
  userId: string;
  amount: number;
  bankAccount: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  failureReason?: string;
}

export interface WalletBalance {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  lastUpdated: Date;
}

interface UseWalletAndPayoutReturn {
  balance: WalletBalance | null;
  transactions: WalletTransaction[];
  payouts: Payout[];
  loading: boolean;
  error: Error | null;
  fetchBalance: () => Promise<void>;
  fetchTransactions: (limit?: number) => Promise<void>;
  fetchPayouts: () => Promise<void>;
  addMoneyToWallet: (amount: number, paymentMethod: string) => Promise<boolean>;
  requestPayout: (amount: number, bankAccountId: string) => Promise<Payout | null>;
  instantPayout: (amount: number) => Promise<Payout | null>;
  setAutoRecharge: (enabled: boolean, amount?: number, threshold?: number) => Promise<boolean>;
  getAutoRechargeSettings: () => Promise<any>;
  getPayoutAccounts: () => Promise<any[]>;
  addPayoutAccount: (accountDetails: any) => Promise<boolean>;
  removePayoutAccount: (accountId: string) => Promise<boolean>;
  calculatePayoutFee: (amount: number) => Promise<number>;
  getPayoutHistory: (limit?: number) => Promise<Payout[]>;
}

export const useWalletAndPayout = (token: string | null, userId: string): UseWalletAndPayoutReturn => {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchBalance = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/wallet/${userId}/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBalance(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch balance'));
    } finally {
      setLoading(false);
    }
  }, [token, userId, API_BASE_URL]);

  const fetchTransactions = useCallback(
    async (limit = 50) => {
      if (!token) return;
      try {
        const response = await axios.get(`${API_BASE_URL}/wallet/${userId}/transactions`, {
          params: { limit },
          headers: { Authorization: `Bearer ${token}` },
        });
        setTransactions(response.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch transactions'));
      }
    },
    [token, userId, API_BASE_URL]
  );

  const fetchPayouts = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/payouts/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPayouts(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch payouts'));
    }
  }, [token, userId, API_BASE_URL]);

  const addMoneyToWallet = useCallback(
    async (amount: number, paymentMethod: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/wallet/${userId}/topup`,
          { amount, paymentMethod },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // Update local balance
        if (response.data.newBalance) {
          setBalance((prev) =>
            prev ? { ...prev, balance: response.data.newBalance, lastUpdated: new Date() } : null
          );
        }

        // Add to transactions
        const transaction: WalletTransaction = {
          id: response.data.transactionId || '',
          type: 'credit',
          amount,
          description: `Wallet top-up via ${paymentMethod}`,
          status: 'completed',
          createdAt: new Date(),
        };
        setTransactions((prev) => [transaction, ...prev]);

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add money'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const requestPayout = useCallback(
    async (amount: number, bankAccountId: string): Promise<Payout | null> => {
      if (!token) return null;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/payouts/request`,
          { userId, amount, bankAccountId },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const payout = response.data;
        setPayouts((prev) => [payout, ...prev]);

        // Deduct from wallet
        if (balance) {
          setBalance({
            ...balance,
            balance: balance.balance - amount,
            lastUpdated: new Date(),
          });
        }

        return payout;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to request payout'));
        return null;
      }
    },
    [token, userId, API_BASE_URL, balance]
  );

  const instantPayout = useCallback(
    async (amount: number): Promise<Payout | null> => {
      if (!token) return null;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/payouts/instant`,
          { userId, amount },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const payout = response.data;
        setPayouts((prev) => [payout, ...prev]);

        if (balance) {
          setBalance({
            ...balance,
            balance: balance.balance - amount,
            lastUpdated: new Date(),
          });
        }

        return payout;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Instant payout failed'));
        return null;
      }
    },
    [token, userId, API_BASE_URL, balance]
  );

  const setAutoRecharge = useCallback(
    async (enabled: boolean, amount = 1000, threshold = 500): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/wallet/${userId}/auto-recharge`,
          { enabled, amount, threshold },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to set auto-recharge'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const getAutoRechargeSettings = useCallback(async () => {
    if (!token) return null;
    try {
      const response = await axios.get(`${API_BASE_URL}/wallet/${userId}/auto-recharge`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch auto-recharge settings'));
      return null;
    }
  }, [token, userId, API_BASE_URL]);

  const getPayoutAccounts = useCallback(async () => {
    if (!token) return [];
    try {
      const response = await axios.get(`${API_BASE_URL}/payout-accounts/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch payout accounts'));
      return [];
    }
  }, [token, userId, API_BASE_URL]);

  const addPayoutAccount = useCallback(
    async (accountDetails: any): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/payout-accounts`,
          { userId, ...accountDetails },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add payout account'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const removePayoutAccount = useCallback(
    async (accountId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.delete(`${API_BASE_URL}/payout-accounts/${accountId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to remove account'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const calculatePayoutFee = useCallback(
    async (amount: number): Promise<number> => {
      try {
        const response = await axios.get(`${API_BASE_URL}/payouts/fee`, {
          params: { amount },
        });
        return response.data.fee || 0;
      } catch (err) {
        return 0;
      }
    },
    [API_BASE_URL]
  );

  const getPayoutHistory = useCallback(
    async (limit = 20): Promise<Payout[]> => {
      if (!token) return [];
      try {
        const response = await axios.get(`${API_BASE_URL}/payouts/${userId}/history`, {
          params: { limit },
          headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
      } catch (err) {
        return [];
      }
    },
    [token, userId, API_BASE_URL]
  );

  return {
    balance,
    transactions,
    payouts,
    loading,
    error,
    fetchBalance,
    fetchTransactions,
    fetchPayouts,
    addMoneyToWallet,
    requestPayout,
    instantPayout,
    setAutoRecharge,
    getAutoRechargeSettings,
    getPayoutAccounts,
    addPayoutAccount,
    removePayoutAccount,
    calculatePayoutFee,
    getPayoutHistory,
  };
};
