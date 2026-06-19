import { useState, useCallback } from 'react';
import axios from 'axios';

export interface Expense {
  id: string;
  userId: string;
  amount: number;
  category: 'fuel' | 'maintenance' | 'insurance' | 'toll' | 'cleaning' | 'other';
  description: string;
  date: Date;
  receiptUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ExpenseCategory {
  name: string;
  icon: string;
  limit: number;
  spent: number;
  color: string;
}

export interface ExpenseSummary {
  period: {
    startDate: Date;
    endDate: Date;
  };
  totalExpenses: number;
  byCategory: {
    [key: string]: number;
  };
  averageDaily: number;
  highestCategory: string;
  expenses: Expense[];
}

interface UseExpenseTrackingReturn {
  expenses: Expense[];
  categories: ExpenseCategory[];
  summary: ExpenseSummary | null;
  loading: boolean;
  error: Error | null;
  fetchExpenses: (userId: string, startDate?: Date, endDate?: Date) => Promise<void>;
  addExpense: (expense: Partial<Expense>) => Promise<boolean>;
  updateExpense: (expenseId: string, updates: Partial<Expense>) => Promise<boolean>;
  deleteExpense: (expenseId: string) => Promise<boolean>;
  categorizeExpense: (expenseId: string, category: string) => Promise<boolean>;
  uploadReceipt: (expenseId: string, filePath: string) => Promise<boolean>;
  getSummary: (startDate: Date, endDate: Date) => Promise<void>;
  getExpensesByCategory: (category: string) => Expense[];
  setExpenseLimit: (category: string, limit: number) => Promise<boolean>;
  getExpenseAlerts: () => string[];
}

export const useExpenseTracking = (token: string | null, userId: string): UseExpenseTrackingReturn => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchExpenses = useCallback(
    async (userId: string, startDate?: Date, endDate?: Date) => {
      if (!token) return;
      setLoading(true);
      try {
        const params = startDate && endDate ? { startDate, endDate } : {};
        const response = await axios.get(
          `${API_BASE_URL}/expenses/${userId}`,
          {
            params,
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setExpenses(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch expenses'));
      } finally {
        setLoading(false);
      }
    },
    [token, API_BASE_URL]
  );

  const addExpense = useCallback(
    async (expense: Partial<Expense>): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/expenses`,
          { ...expense, userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setExpenses((prev) => [response.data, ...prev]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add expense'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const updateExpense = useCallback(
    async (expenseId: string, updates: Partial<Expense>): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.put(
          `${API_BASE_URL}/expenses/${expenseId}`,
          updates,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setExpenses((prev) =>
          prev.map((e) => (e.id === expenseId ? response.data : e))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update expense'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const deleteExpense = useCallback(
    async (expenseId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.delete(`${API_BASE_URL}/expenses/${expenseId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to delete expense'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const categorizeExpense = useCallback(
    async (expenseId: string, category: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/expenses/${expenseId}/categorize`,
          { category },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setExpenses((prev) =>
          prev.map((e) => (e.id === expenseId ? response.data : e))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to categorize expense'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const uploadReceipt = useCallback(
    async (expenseId: string, filePath: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const formData = new FormData();
        formData.append('receipt', {
          uri: filePath,
          type: 'application/pdf',
          name: `receipt_${expenseId}.pdf`,
        } as any);

        await axios.post(
          `${API_BASE_URL}/expenses/${expenseId}/receipt`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to upload receipt'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const getSummary = useCallback(
    async (startDate: Date, endDate: Date) => {
      if (!token) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/expenses/${userId}/summary`,
          {
            params: { startDate, endDate },
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setSummary(response.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch summary'));
      }
    },
    [token, userId, API_BASE_URL]
  );

  const getExpensesByCategory = useCallback(
    (category: string) => {
      return expenses.filter((e) => e.category === category);
    },
    [expenses]
  );

  const setExpenseLimit = useCallback(
    async (category: string, limit: number): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/expenses/categories/${category}/limit`,
          { limit },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to set limit'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const getExpenseAlerts = useCallback(() => {
    const alerts: string[] = [];
    if (summary) {
      Object.entries(summary.byCategory).forEach(([category, spent]) => {
        const cat = categories.find((c) => c.name === category);
        if (cat && spent > cat.limit * 0.8) {
          alerts.push(`${category} expenses are high (${spent}/${cat.limit})`);
        }
      });
    }
    return alerts;
  }, [summary, categories]);

  return {
    expenses,
    categories,
    summary,
    loading,
    error,
    fetchExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    categorizeExpense,
    uploadReceipt,
    getSummary,
    getExpensesByCategory,
    setExpenseLimit,
    getExpenseAlerts,
  };
};
