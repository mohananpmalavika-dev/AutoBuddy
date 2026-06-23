import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ReceiptLineItem {
  description: string;
  amount: number;
  quantity?: number;
}

export interface Receipt {
  id: string;
  rideId: string;
  date: string;
  driver: string;
  driverRating: number;
  pickup: string;
  dropoff: string;
  distance: number;
  duration: number;
  baseFare: number;
  surgeMultiplier: number;
  tolls: number;
  tips: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  lineItems: ReceiptLineItem[];
  paymentMethod: string;
  receiptNumber: string;
  vehicleType: string;
  status: 'completed' | 'cancelled' | 'pending';
}

export const useReceiptGeneration = (token: string | null, userId: string) => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token && userId) {
      loadReceiptHistory();
    }
  }, [token, userId]);

  const loadReceiptHistory = useCallback(async () => {
    try {
      setLoading(true);
      const cached = await AsyncStorage.getItem(`autobuddy_cache_receipts_${userId}`);
      if (cached) {
        const data = JSON.parse(cached);
        setReceipts(data.receipts || []);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load receipts');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const generateReceipt = useCallback(async (rideId: string): Promise<Receipt | null> => {
    if (!token) {return null;}
    try {
      const response = await fetch(
        `https://api.autobuddy.com/v1/rides/${rideId}/receipt`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) {throw new Error('Failed to generate');}
      const data = await response.json();
      const receipt: Receipt = { ...data } as Receipt;
      setReceipts([...receipts, receipt]);
      return receipt;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      return null;
    }
  }, [token, receipts]);

  const getReceiptHistory = useCallback(async (limit: number = 50): Promise<Receipt[]> => {
    if (!token) {return [];}
    try {
      const response = await fetch(
        `https://api.autobuddy.com/v1/user/${userId}/receipts?limit=${limit}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) {throw new Error('Failed');}
      const data = await response.json();
      const history = data.data || [];
      setReceipts(history);
      return history;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      return [];
    }
  }, [token, userId]);

  const downloadReceipt = useCallback(async (receipt: Receipt): Promise<boolean> => {
    try {
      await AsyncStorage.setItem(`autobuddy_receipt_${receipt.id}`, JSON.stringify(receipt));
      return true;
    } catch (err) {
      return false;
    }
  }, []);

  const emailReceipt = useCallback(async (receipt: Receipt, email: string): Promise<boolean> => {
    if (!token) {return false;}
    try {
      const response = await fetch(`https://api.autobuddy.com/v1/receipts/${receipt.id}/email`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_address: email }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [token]);

  const getTotalExpenses = useCallback((period?: string): number => {
    let filtered = receipts;
    if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = receipts.filter(r => new Date(r.date) >= weekAgo);
    }
    return filtered.reduce((sum, r) => sum + r.total, 0);
  }, [receipts]);

  return {
    receipts,
    loading,
    error,
    generateReceipt,
    getReceiptHistory,
    downloadReceipt,
    emailReceipt,
    getTotalExpenses,
  };
};
