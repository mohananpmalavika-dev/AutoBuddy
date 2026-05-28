import { useCallback, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

const EXPENSE_TYPES = {
  toll: 'Toll',
  parking: 'Parking',
  fuel: 'Fuel',
  maintenance: 'Maintenance',
  other: 'Other',
};

export function useExpenseTracking({ token, rideId }) {
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const totalExpense = useMemo(
    () =>
      expenses.reduce((sum, expense) => {
        return sum + (Number(expense.amount) || 0);
      }, 0),
    [expenses],
  );

  // Add expense
  const addExpense = useCallback(
    async (type, amount, description = '', receiptUrl = null) => {
      if (!token || !rideId) {
        setError('Missing required data');
        return false;
      }

      if (!EXPENSE_TYPES[type]) {
        setError('Invalid expense type');
        return false;
      }

      const newExpense = {
        id: `exp_${Date.now()}`,
        type,
        amount: Number(amount),
        description,
        receipt_url: receiptUrl,
        timestamp: new Date().toISOString(),
      };

      setIsLoading(true);
      setError('');

      try {
        await apiRequest('/drivers/expenses', {
          method: 'POST',
          token,
          body: {
            ride_id: rideId,
            type,
            amount: Number(amount),
            description,
            receipt_url: receiptUrl,
            timestamp: newExpense.timestamp,
          },
        });

        // Optimistically add to local state
        setExpenses((prev) => [...prev, newExpense]);
        setIsLoading(false);
        return true;
      } catch (err) {
        setError(`Failed to add expense: ${err.message}`);
        setIsLoading(false);
        return false;
      }
    },
    [token, rideId]
  );

  // Remove expense
  const removeExpense = useCallback(
    async (expenseId) => {
      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers/expenses/${expenseId}`, {
          method: 'DELETE',
          token,
        });

        setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
        setIsLoading(false);
        return true;
      } catch (err) {
        setError(`Failed to remove expense: ${err.message}`);
        setIsLoading(false);
        return false;
      }
    },
    [token]
  );

  // Edit expense
  const editExpense = useCallback(
    async (expenseId, updates) => {
      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers/expenses/${expenseId}`, {
          method: 'PATCH',
          token,
          body: updates,
        });

        setExpenses((prev) =>
          prev.map((e) => (e.id === expenseId ? { ...e, ...updates } : e))
        );
        setIsLoading(false);
        return true;
      } catch (err) {
        setError(`Failed to update expense: ${err.message}`);
        setIsLoading(false);
        return false;
      }
    },
    [token]
  );

  // Fetch expenses for ride
  const fetchExpenses = useCallback(async () => {
    if (!token || !rideId) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers/rides/${rideId}/expenses`, {
        method: 'GET',
        token,
      });

      setExpenses(response?.expenses || []);
      setIsLoading(false);
    } catch (err) {
      setError(`Failed to fetch expenses: ${err.message}`);
      setIsLoading(false);
    }
  }, [token, rideId]);

  return {
    expenses,
    totalExpense,
    isLoading,
    error,
    addExpense,
    removeExpense,
    editExpense,
    fetchExpenses,
    expenseTypes: EXPENSE_TYPES,
  };
}
