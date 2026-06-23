import { useState, useCallback } from 'react';
import axios from 'axios';

export interface Ride {
  id: string;
  userId: string;
  date: Date;
  pickupLocation: string;
  dropoffLocation: string;
  distance: number;
  duration: number;
  baseFare: number;
  discount: number;
  tax: number;
  totalAmount: number;
  paymentMethod: string;
}

export interface Receipt {
  id: string;
  rideId: string;
  userId: string;
  type: 'receipt' | 'invoice' | 'tax_document';
  generatedAt: Date;
  expiresAt: Date;
  fileUrl: string;
  format: 'pdf' | 'html' | 'email';
}

export interface TaxSummary {
  period: {
    startDate: Date;
    endDate: Date;
  };
  totalIncome: number;
  totalTax: number;
  deductibleExpenses: number;
  netIncome: number;
  taxRate: number;
  receiptsCount: number;
}

interface UseRideReceiptsReturn {
  rides: Ride[];
  receipts: Receipt[];
  taxSummary: TaxSummary | null;
  loading: boolean;
  error: Error | null;
  fetchRides: (userId: string, startDate?: Date, endDate?: Date) => Promise<void>;
  generateReceipt: (rideId: string, format: 'pdf' | 'html' | 'email') => Promise<boolean>;
  generateTaxInvoice: (startDate: Date, endDate: Date) => Promise<boolean>;
  downloadReceipt: (receiptId: string) => Promise<Blob | null>;
  emailReceipt: (receiptId: string, email: string) => Promise<boolean>;
  getTaxSummary: (startDate: Date, endDate: Date) => Promise<void>;
  generateTaxReport: (year: number) => Promise<boolean>;
  getReceiptsByRide: (rideId: string) => Receipt[];
  bulkGenerateReceipts: (rideIds: string[]) => Promise<boolean>;
}

export const useRideReceipts = (token: string | null, userId: string): UseRideReceiptsReturn => {
  const [rides, setRides] = useState<Ride[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchRides = useCallback(
    async (userId: string, startDate?: Date, endDate?: Date) => {
      if (!token) {return;}
      setLoading(true);
      try {
        const params = startDate && endDate ? { startDate, endDate } : {};
        const response = await axios.get(
          `${API_BASE_URL}/rides/${userId}/history`,
          {
            params,
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setRides(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch rides'));
      } finally {
        setLoading(false);
      }
    },
    [token, API_BASE_URL]
  );

  const generateReceipt = useCallback(
    async (rideId: string, format: 'pdf' | 'html' | 'email'): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/receipts/generate`,
          { rideId, format },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setReceipts((prev) => [response.data, ...prev]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate receipt'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const generateTaxInvoice = useCallback(
    async (startDate: Date, endDate: Date): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/receipts/tax-invoice`,
          { userId, startDate, endDate },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setReceipts((prev) => [response.data, ...prev]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate tax invoice'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const downloadReceipt = useCallback(
    async (receiptId: string): Promise<Blob | null> => {
      if (!token) {return null;}
      try {
        const response = await axios.get(
          `${API_BASE_URL}/receipts/${receiptId}/download`,
          {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob',
          }
        );
        return response.data;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to download receipt'));
        return null;
      }
    },
    [token, API_BASE_URL]
  );

  const emailReceipt = useCallback(
    async (receiptId: string, email: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/receipts/${receiptId}/email`,
          { email },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to email receipt'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const getTaxSummary = useCallback(
    async (startDate: Date, endDate: Date) => {
      if (!token) {return;}
      try {
        const response = await axios.get(
          `${API_BASE_URL}/tax/summary/${userId}`,
          {
            params: { startDate, endDate },
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setTaxSummary(response.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch tax summary'));
      }
    },
    [token, userId, API_BASE_URL]
  );

  const generateTaxReport = useCallback(
    async (year: number): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/tax/report`,
          { userId, year },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate tax report'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const getReceiptsByRide = useCallback(
    (rideId: string) => {
      return receipts.filter((r) => r.rideId === rideId);
    },
    [receipts]
  );

  const bulkGenerateReceipts = useCallback(
    async (rideIds: string[]): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/receipts/bulk-generate`,
          { rideIds },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setReceipts((prev) => [...prev, ...response.data]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate receipts'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  return {
    rides,
    receipts,
    taxSummary,
    loading,
    error,
    fetchRides,
    generateReceipt,
    generateTaxInvoice,
    downloadReceipt,
    emailReceipt,
    getTaxSummary,
    generateTaxReport,
    getReceiptsByRide,
    bulkGenerateReceipts,
  };
};
