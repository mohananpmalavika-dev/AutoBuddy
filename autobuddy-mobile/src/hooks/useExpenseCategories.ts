import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ExpenseCategory = 'work' | 'personal' | 'commute' | 'business' | 'social' | 'other';
export type ExpenseType = 'ride' | 'maintenance' | 'fuel' | 'tolls' | 'parking' | 'food' | 'entertainment';

export interface CategorizedExpense {
  id: string;
  rideId?: string;
  date: Date;
  amount: number;
  category: ExpenseCategory;
  type: ExpenseType;
  description: string;
  location?: string;
  paymentMethod: string;
  notes?: string;
  receipt?: {
    url: string;
    uploadedAt: Date;
  };
  isWork: boolean;
  isPersonal: boolean;
}

export interface ExpenseCategoryStats {
  category: ExpenseCategory;
  count: number;
  totalAmount: number;
  averageAmount: number;
  percentageOfTotal: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface ExpenseBreakdown {
  totalExpenses: number;
  totalAmount: number;
  byCategory: ExpenseCategoryStats[];
  byType: Record<ExpenseType, { count: number; amount: number }>;
  workExpenses: { count: number; amount: number };
  personalExpenses: { count: number; amount: number };
  monthlyTrend: Array<{
    month: string;
    amount: number;
    count: number;
  }>;
}

const EXPENSES_STORAGE = 'categorized_expenses';
const CATEGORY_PREFERENCES_STORAGE = 'expense_category_preferences';

export const useExpenseCategories = (token: string | null, userId: string) => {
  const [expenses, setExpenses] = useState<CategorizedExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryPreferences, setCategoryPreferences] = useState({
    defaultWorkCategory: true,
    autoTagWork: true,
    autoTagPersonal: false,
  });

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const savedExpenses = await AsyncStorage.getItem(EXPENSES_STORAGE);
        const savedPreferences = await AsyncStorage.getItem(CATEGORY_PREFERENCES_STORAGE);

        if (savedExpenses) {
          const parsedExpenses = JSON.parse(savedExpenses).map((e: any) => ({
            ...e,
            date: new Date(e.date),
            receipt: e.receipt ? { ...e.receipt, uploadedAt: new Date(e.receipt.uploadedAt) } : undefined,
          }));
          setExpenses(parsedExpenses);
        }

        if (savedPreferences) {
          setCategoryPreferences(JSON.parse(savedPreferences));
        }
      } catch (err) {
        setError(`Init failed: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    if (token && userId) initialize();
  }, [token, userId]);

  // Add categorized expense
  const addCategorizedExpense = useCallback(
    async (expenseData: {
      rideId?: string;
      date: Date;
      amount: number;
      category: ExpenseCategory;
      type: ExpenseType;
      description: string;
      location?: string;
      paymentMethod: string;
      notes?: string;
      isWork: boolean;
      isPersonal: boolean;
    }): Promise<CategorizedExpense> => {
      try {
        const newExpense: CategorizedExpense = {
          id: `expense_${Date.now()}`,
          ...expenseData,
        };

        const updatedExpenses = [newExpense, ...expenses];
        setExpenses(updatedExpenses);
        await AsyncStorage.setItem(EXPENSES_STORAGE, JSON.stringify(updatedExpenses));

        return newExpense;
      } catch (err) {
        const errorMsg = `Failed to add expense: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [expenses]
  );

  // Get expenses by category
  const getExpensesByCategory = useCallback(
    (category: ExpenseCategory): CategorizedExpense[] => {
      return expenses.filter(e => e.category === category);
    },
    [expenses]
  );

  // Get expenses by type
  const getExpensesByType = useCallback(
    (type: ExpenseType): CategorizedExpense[] => {
      return expenses.filter(e => e.type === type);
    },
    [expenses]
  );

  // Assign or change category
  const assignCategory = useCallback(
    async (expenseId: string, newCategory: ExpenseCategory): Promise<void> => {
      try {
        const updatedExpenses = expenses.map(e => {
          if (e.id === expenseId) {
            return { ...e, category: newCategory };
          }
          return e;
        });

        setExpenses(updatedExpenses);
        await AsyncStorage.setItem(EXPENSES_STORAGE, JSON.stringify(updatedExpenses));
      } catch (err) {
        const errorMsg = `Failed to assign category: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [expenses]
  );

  // Tag expense as work
  const tagAsWork = useCallback(
    async (expenseId: string): Promise<void> => {
      try {
        const updatedExpenses = expenses.map(e => {
          if (e.id === expenseId) {
            return { ...e, isWork: true, isPersonal: false, category: 'work' };
          }
          return e;
        });

        setExpenses(updatedExpenses);
        await AsyncStorage.setItem(EXPENSES_STORAGE, JSON.stringify(updatedExpenses));
      } catch (err) {
        const errorMsg = `Failed to tag as work: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [expenses]
  );

  // Tag expense as personal
  const tagAsPersonal = useCallback(
    async (expenseId: string): Promise<void> => {
      try {
        const updatedExpenses = expenses.map(e => {
          if (e.id === expenseId) {
            return { ...e, isWork: false, isPersonal: true, category: 'personal' };
          }
          return e;
        });

        setExpenses(updatedExpenses);
        await AsyncStorage.setItem(EXPENSES_STORAGE, JSON.stringify(updatedExpenses));
      } catch (err) {
        const errorMsg = `Failed to tag as personal: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [expenses]
  );

  // Get category breakdown
  const getCategoryBreakdown = useCallback((): Record<ExpenseCategory, { count: number; amount: number }> => {
    const categories: ExpenseCategory[] = ['work', 'personal', 'commute', 'business', 'social', 'other'];
    const breakdown: Record<ExpenseCategory, { count: number; amount: number }> = {
      work: { count: 0, amount: 0 },
      personal: { count: 0, amount: 0 },
      commute: { count: 0, amount: 0 },
      business: { count: 0, amount: 0 },
      social: { count: 0, amount: 0 },
      other: { count: 0, amount: 0 },
    };

    expenses.forEach(expense => {
      breakdown[expense.category].count += 1;
      breakdown[expense.category].amount += expense.amount;
    });

    return breakdown;
  }, [expenses]);

  // Get category statistics
  const getCategoryStats = useCallback((): ExpenseCategoryStats[] => {
    const breakdown = getCategoryBreakdown();
    const totalAmount = Object.values(breakdown).reduce((sum, cat) => sum + cat.amount, 0);

    const stats: ExpenseCategoryStats[] = Object.entries(breakdown).map(([category, data]) => {
      const previousMonthExpenses = expenses.filter(e => {
        const expenseDate = new Date(e.date);
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return (
          e.category === (category as ExpenseCategory) &&
          expenseDate > oneMonthAgo &&
          expenseDate <= new Date()
        );
      });

      const previousMonthTotal = previousMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (data.amount > previousMonthTotal * 1.1) {
        trend = 'increasing';
      } else if (data.amount < previousMonthTotal * 0.9) {
        trend = 'decreasing';
      }

      return {
        category: category as ExpenseCategory,
        count: data.count,
        totalAmount: data.amount,
        averageAmount: data.count > 0 ? data.amount / data.count : 0,
        percentageOfTotal: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
        trend,
      };
    });

    return stats.filter(s => s.count > 0);
  }, [expenses, getCategoryBreakdown]);

  // Get complete expense breakdown
  const getExpenseBreakdown = useCallback((): ExpenseBreakdown => {
    const categoryBreakdown = getCategoryBreakdown();
    const totalAmount = Object.values(categoryBreakdown).reduce((sum, cat) => sum + cat.amount, 0);
    const totalCount = Object.values(categoryBreakdown).reduce((sum, cat) => sum + cat.count, 0);

    // Type breakdown
    const types: ExpenseType[] = ['ride', 'maintenance', 'fuel', 'tolls', 'parking', 'food', 'entertainment'];
    const typeBreakdown: Record<ExpenseType, { count: number; amount: number }> = {
      ride: { count: 0, amount: 0 },
      maintenance: { count: 0, amount: 0 },
      fuel: { count: 0, amount: 0 },
      tolls: { count: 0, amount: 0 },
      parking: { count: 0, amount: 0 },
      food: { count: 0, amount: 0 },
      entertainment: { count: 0, amount: 0 },
    };

    expenses.forEach(expense => {
      typeBreakdown[expense.type].count += 1;
      typeBreakdown[expense.type].amount += expense.amount;
    });

    // Work vs Personal
    const workExpenses = expenses.filter(e => e.isWork);
    const personalExpenses = expenses.filter(e => e.isPersonal);

    // Monthly trend (last 6 months)
    const monthlyData: Record<string, { amount: number; count: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      monthlyData[monthKey] = { amount: 0, count: 0 };
    }

    expenses.forEach(expense => {
      const expenseDate = new Date(expense.date);
      const monthKey = expenseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].amount += expense.amount;
        monthlyData[monthKey].count += 1;
      }
    });

    const monthlyTrend = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      amount: data.amount,
      count: data.count,
    }));

    return {
      totalExpenses: totalCount,
      totalAmount,
      byCategory: getCategoryStats(),
      byType: typeBreakdown,
      workExpenses: {
        count: workExpenses.length,
        amount: workExpenses.reduce((sum, e) => sum + e.amount, 0),
      },
      personalExpenses: {
        count: personalExpenses.length,
        amount: personalExpenses.reduce((sum, e) => sum + e.amount, 0),
      },
      monthlyTrend,
    };
  }, [expenses, getCategoryStats, getCategoryBreakdown]);

  // Get filtered expenses
  const getFilteredExpenses = useCallback(
    (filters: {
      category?: ExpenseCategory;
      type?: ExpenseType;
      startDate?: Date;
      endDate?: Date;
      minAmount?: number;
      maxAmount?: number;
      isWork?: boolean;
      isPersonal?: boolean;
    }): CategorizedExpense[] => {
      return expenses.filter(e => {
        if (filters.category && e.category !== filters.category) return false;
        if (filters.type && e.type !== filters.type) return false;
        if (filters.startDate && new Date(e.date) < filters.startDate) return false;
        if (filters.endDate && new Date(e.date) > filters.endDate) return false;
        if (filters.minAmount !== undefined && e.amount < filters.minAmount) return false;
        if (filters.maxAmount !== undefined && e.amount > filters.maxAmount) return false;
        if (filters.isWork !== undefined && e.isWork !== filters.isWork) return false;
        if (filters.isPersonal !== undefined && e.isPersonal !== filters.isPersonal) return false;
        return true;
      });
    },
    [expenses]
  );

  // Search expenses
  const searchExpenses = useCallback(
    (query: string): CategorizedExpense[] => {
      const lowerQuery = query.toLowerCase();
      return expenses.filter(
        e =>
          e.description.toLowerCase().includes(lowerQuery) ||
          e.location?.toLowerCase().includes(lowerQuery) ||
          e.notes?.toLowerCase().includes(lowerQuery)
      );
    },
    [expenses]
  );

  // Update category preferences
  const updateCategoryPreferences = useCallback(
    async (newPreferences: Partial<typeof categoryPreferences>): Promise<void> => {
      try {
        const updated = { ...categoryPreferences, ...newPreferences };
        setCategoryPreferences(updated);
        await AsyncStorage.setItem(CATEGORY_PREFERENCES_STORAGE, JSON.stringify(updated));
      } catch (err) {
        const errorMsg = `Failed to update preferences: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [categoryPreferences]
  );

  // Export expenses
  const exportExpenses = useCallback(
    async (format: 'csv' | 'json' = 'csv', filters?: any): Promise<string> => {
      try {
        const toExport = filters ? getFilteredExpenses(filters) : expenses;

        let content = '';
        if (format === 'csv') {
          content = 'Date,Description,Category,Type,Amount,Payment Method,Work,Personal,Notes\n';
          content += toExport
            .map(
              e =>
                `${e.date.toISOString()},${e.description},${e.category},${e.type},${e.amount},${e.paymentMethod},${e.isWork},${e.isPersonal},"${e.notes || ''}"`
            )
            .join('\n');
        } else {
          content = JSON.stringify(toExport, null, 2);
        }

        return `expenses_${Date.now()}.${format === 'csv' ? 'csv' : 'json'}`;
      } catch (err) {
        const errorMsg = `Export failed: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [expenses, getFilteredExpenses]
  );

  return {
    // Methods
    addCategorizedExpense,
    getExpensesByCategory,
    getExpensesByType,
    assignCategory,
    tagAsWork,
    tagAsPersonal,
    getCategoryBreakdown,
    getCategoryStats,
    getExpenseBreakdown,
    getFilteredExpenses,
    searchExpenses,
    updateCategoryPreferences,
    exportExpenses,

    // Data
    expenses,
    categoryPreferences,

    // State
    loading,
    error,
  };
};
