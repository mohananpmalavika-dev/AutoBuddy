import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export enum ExpenseCategory {
  COMMUTE = 'commute',
  BUSINESS = 'business',
  SOCIAL = 'social',
  PERSONAL = 'personal',
  MEDICAL = 'medical',
  SHOPPING = 'shopping',
  ENTERTAINMENT = 'entertainment',
  FOOD = 'food',
  OTHER = 'other',
}

export interface CategorizedExpense {
  id: string;
  rideId: string;
  date: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  isPersonal: boolean;
  tags: string[];
}

export interface CategoryStats {
  category: ExpenseCategory;
  totalAmount: number;
  count: number;
  percentage: number;
  averageAmount: number;
}

export const useExpenseCategories = (token: string | null, userId: string) => {
  const [expenses, setExpenses] = useState<CategorizedExpense[]>([]);
  const [categories, setCategories] = useState<CategoryStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token && userId) {
      loadExpenses();
    }
  }, [token, userId]);

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const cached = await AsyncStorage.getItem(`autobuddy_cache_expenses_${userId}`);
      if (cached) {
        const data = JSON.parse(cached);
        setExpenses(data.expenses || []);
        calculateStats(data.expenses || []);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const calculateStats = useCallback((expenseList: CategorizedExpense[]) => {
    const stats: Record<string, CategoryStats> = {};
    const total = expenseList.reduce((sum, e) => sum + e.amount, 0);

    Object.values(ExpenseCategory).forEach(cat => {
      const catExpenses = expenseList.filter(e => e.category === cat);
      const catTotal = catExpenses.reduce((sum, e) => sum + e.amount, 0);

      stats[cat] = {
        category: cat,
        totalAmount: catTotal,
        count: catExpenses.length,
        percentage: total > 0 ? (catTotal / total) * 100 : 0,
        averageAmount: catExpenses.length > 0 ? catTotal / catExpenses.length : 0,
      };
    });

    setCategories(Object.values(stats).filter(s => s.count > 0));
  }, []);

  const getExpensesByCategory = useCallback(
    (category: ExpenseCategory): CategorizedExpense[] => {
      return expenses.filter(e => e.category === category);
    },
    [expenses]
  );

  const getExpensesByDateRange = useCallback(
    (startDate: string, endDate: string): CategorizedExpense[] => {
      return expenses.filter(e => {
        const eDate = new Date(e.date);
        return eDate >= new Date(startDate) && eDate <= new Date(endDate);
      });
    },
    [expenses]
  );

  const assignCategory = useCallback(
    async (expenseId: string, category: ExpenseCategory): Promise<boolean> => {
      if (!token) {return false;}

      try {
        const response = await fetch(
          `https://api.autobuddy.com/v1/expenses/${expenseId}/category`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ category }),
          }
        );

        if (!response.ok) {throw new Error('Failed to assign');}

        const updated = expenses.map(e =>
          e.id === expenseId ? { ...e, category } : e
        );
        setExpenses(updated);
        calculateStats(updated);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
        return false;
      }
    },
    [token, expenses]
  );

  const getWorkExpenses = useCallback((): number => {
    return expenses
      .filter(e => !e.isPersonal && (e.category === ExpenseCategory.BUSINESS || e.category === ExpenseCategory.COMMUTE))
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const getPersonalExpenses = useCallback((): number => {
    return expenses
      .filter(e => e.isPersonal)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const getCategoryBreakdown = useCallback((): Record<string, number> => {
    const breakdown: Record<string, number> = {};

    Object.values(ExpenseCategory).forEach(cat => {
      breakdown[cat] = getExpensesByCategory(cat).reduce((sum, e) => sum + e.amount, 0);
    });

    return breakdown;
  }, [getExpensesByCategory]);

  const filterByTag = useCallback(
    (tag: string): CategorizedExpense[] => {
      return expenses.filter(e => e.tags.includes(tag));
    },
    [expenses]
  );

  const getTotalByPeriod = useCallback(
    (period: 'week' | 'month' | 'year'): number => {
      const now = new Date();
      const startDate = new Date();

      if (period === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else if (period === 'month') {
        startDate.setMonth(now.getMonth() - 1);
      } else if (period === 'year') {
        startDate.setFullYear(now.getFullYear() - 1);
      }

      return expenses
        .filter(e => new Date(e.date) >= startDate)
        .reduce((sum, e) => sum + e.amount, 0);
    },
    [expenses]
  );

  const getExpenseStats = useCallback((): {
    total: number;
    average: number;
    highest: number;
    count: number;
  } => {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    return {
      total,
      average: expenses.length > 0 ? total / expenses.length : 0,
      highest: expenses.length > 0 ? Math.max(...expenses.map(e => e.amount)) : 0,
      count: expenses.length,
    };
  }, [expenses]);

  return {
    expenses,
    categories,
    loading,
    error,
    getExpensesByCategory,
    getExpensesByDateRange,
    assignCategory,
    getWorkExpenses,
    getPersonalExpenses,
    getCategoryBreakdown,
    filterByTag,
    getTotalByPeriod,
    getExpenseStats,
    loadExpenses,
  };
};
