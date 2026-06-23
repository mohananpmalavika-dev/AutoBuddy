import { useState, useCallback, useEffect } from 'react';
import api from '../api/apiClient';

export interface CorporateAccount {
  id: string;
  company_name: string;
  admin_email: string;
  monthly_budget: number;
}

export interface CorporateEmployee {
  id: string;
  employee_id: string;
  name: string;
  email: string;
  department: string;
  job_title: string;
  monthly_ride_budget: number;
  rides_per_month_limit: number;
  role_in_program: string;
  is_active: boolean;
  rides_used_this_month: number;
  budget_spent_this_month: number;
}

export interface CorporateInvoice {
  invoice_id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  total_amount: number;
  total_rides: number;
  invoice_status: 'generated' | 'sent' | 'viewed' | 'paid' | 'overdue';
  issued_date: string;
  due_date: string;
  payment_received_date?: string;
}

export interface DashboardSummary {
  total_budget: number;
  spent_this_month: number;
  remaining_budget: number;
  budget_utilization_pct: number;
  total_employees: number;
  active_employees: number;
  pending_approvals: number;
  current_month_rides: number;
  current_month_expense: number;
}

export interface ExpenseBreakdown {
  category: string;
  ride_count: number;
  total_amount: number;
  avg_per_ride: number;
  trend: string;
}

export interface CorporateRideRequest {
  id: string;
  employee_id: string;
  ride_date: string;
  pickup_location: string;
  dropoff_location: string;
  estimated_cost: number;
  actual_cost?: number;
  approval_status: string;
  status: string;
}

export interface UseCorpAdminReturn {
  account: CorporateAccount | null;
  employees: CorporateEmployee[];
  invoices: CorporateInvoice[];
  dashboardSummary: DashboardSummary | null;
  expenses: ExpenseBreakdown[];
  pendingApprovals: CorporateRideRequest[];
  isLoading: boolean;
  error: string | null;
  fetchDashboardSummary: (accountId: string) => Promise<void>;
  fetchEmployees: (accountId: string) => Promise<void>;
  bulkAddEmployees: (accountId: string, employees: any[]) => Promise<{added_count: number; failed_count: number}>;
  bulkRemoveEmployees: (accountId: string, employeeIds: string[]) => Promise<{removed_count: number; failed_count: number}>;
  importEmployeeCSV: (accountId: string, file: File) => Promise<{parsed_count: number; preview: any[]}>;
  fetchInvoices: (accountId: string, month?: string) => Promise<void>;
  generateInvoice: (accountId: string, periodStart: string, periodEnd: string) => Promise<CorporateInvoice>;
  payInvoice: (accountId: string, invoiceId: string, paymentMethod: string) => Promise<void>;
  fetchExpenses: (accountId: string, groupBy: 'employee' | 'department' | 'date', month?: string) => Promise<void>;
  fetchPendingApprovals: (accountId: string) => Promise<void>;
  clearError: () => void;
}

export const useCorporateAdmin = (): UseCorpAdminReturn => {
  const [account, setAccount] = useState<CorporateAccount | null>(null);
  const [employees, setEmployees] = useState<CorporateEmployee[]>([]);
  const [invoices, setInvoices] = useState<CorporateInvoice[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseBreakdown[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<CorporateRideRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchDashboardSummary = useCallback(async (accountId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/v3/corporate/${accountId}/dashboard/summary`);
      setDashboardSummary(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch dashboard summary');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async (accountId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/v3/corporate/${accountId}/employees`);
      setEmployees(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch employees');
      setEmployees([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const bulkAddEmployees = useCallback(async (accountId: string, employees: any[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.post(`/api/v3/corporate/${accountId}/employees/bulk-add`, {
        employees
      });
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add employees');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const bulkRemoveEmployees = useCallback(async (accountId: string, employeeIds: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.delete(`/api/v3/corporate/${accountId}/employees/bulk-remove`, {
        data: { employee_ids: employeeIds }
      });
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove employees');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const importEmployeeCSV = useCallback(async (accountId: string, file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post(`/api/v3/corporate/${accountId}/employees/import-csv`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to import CSV');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async (accountId: string, month?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = { month, status: 'all' };
      const response = await api.get(`/api/v3/corporate/${accountId}/invoices`, { params });
      setInvoices(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch invoices');
      setInvoices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateInvoice = useCallback(async (accountId: string, periodStart: string, periodEnd: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.post(`/api/v3/corporate/${accountId}/invoices/generate`, null, {
        params: { billing_period_start: periodStart, billing_period_end: periodEnd }
      });
      return response.data;
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate invoice');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const payInvoice = useCallback(async (accountId: string, invoiceId: string, paymentMethod: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.post(`/api/v3/corporate/${accountId}/invoices/${invoiceId}/pay`, {
        payment_method: paymentMethod,
        transaction_id: `TXN-${Date.now()}`
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process payment');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchExpenses = useCallback(async (accountId: string, groupBy: 'employee' | 'department' | 'date', month?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = { group_by: groupBy };
      if (month) {params.month = month;}
      const response = await api.get(`/api/v3/corporate/${accountId}/dashboard/expenses`, { params });
      setExpenses(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch expenses');
      setExpenses([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPendingApprovals = useCallback(async (accountId: string) => {
    setError(null);
    try {
      const response = await api.get(`/api/v3/corporate/${accountId}/approvals/pending`);
      setPendingApprovals(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch approvals');
      setPendingApprovals([]);
    }
  }, []);

  return {
    account,
    employees,
    invoices,
    dashboardSummary,
    expenses,
    pendingApprovals,
    isLoading,
    error,
    fetchDashboardSummary,
    fetchEmployees,
    bulkAddEmployees,
    bulkRemoveEmployees,
    importEmployeeCSV,
    fetchInvoices,
    generateInvoice,
    payInvoice,
    fetchExpenses,
    fetchPendingApprovals,
    clearError
  };
};
