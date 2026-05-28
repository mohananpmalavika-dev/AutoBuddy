import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

export function useTaxReporting({ token, driverId }) {
  const [taxReports, setTaxReports] = useState([]);
  const [currentReport, setCurrentReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Generate new tax report
  const generateTaxReport = useCallback(async (startDate, endDate, reportType = 'monthly') => {
    if (!token || !driverId) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier3/tax-reports/generate`, {
        method: 'POST',
        token,
        body: {
          start_date: startDate,
          end_date: endDate,
          report_type: reportType,
          include_expenses: true,
        },
      });

      const payload = response?.data || response;
      if (payload) {
        setCurrentReport(payload);
        setTaxReports(prev => [payload, ...prev]);
        return payload;
      }
    } catch (err) {
      setError(`Failed to generate report: ${err.message}`);
      console.warn('Report generation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Load tax report history
  const loadTaxReportHistory = useCallback(async (limit = 12) => {
    if (!token || !driverId) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier3/tax-reports/history?limit=${limit}`, {
        method: 'GET',
        token,
      });

      const payload = response?.data || response;
      if (payload?.reports) {
        setTaxReports(payload.reports);
        return payload.reports;
      }
    } catch (err) {
      setError(`Failed to load tax history: ${err.message}`);
      console.warn('Tax history error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Download tax report PDF
  const downloadTaxReport = useCallback(async (reportId) => {
    if (!token) return null;

    try {
      const response = await apiRequest(`/drivers-tier3/tax-reports/download/${reportId}`, {
        method: 'POST',
        token,
      });

      const payload = response?.data || response;
      if (payload) {
        return payload.download_url;
      }
    } catch (err) {
      setError(`Failed to download report: ${err.message}`);
      console.warn('Download error:', err);
    }
  }, [token]);

  // Calculate tax summary
  const calculateTaxSummary = useCallback(() => {
    if (!taxReports || taxReports.length === 0) {
      return {
        totalEarnings: 0,
        totalTaxLiability: 0,
        averageTaxRate: 0,
        deductibleExpenses: 0,
      };
    }

    const totalEarnings = taxReports.reduce((sum, r) => sum + (r.gross_earnings || 0), 0);
    const totalTaxLiability = taxReports.reduce((sum, r) => sum + (r.tax_liability || 0), 0);
    const deductibleExpenses = taxReports.reduce((sum, r) => sum + (r.deductible_expenses || 0), 0);
    const averageTaxRate = totalEarnings > 0 ? (totalTaxLiability / totalEarnings) * 100 : 0;

    return {
      totalEarnings,
      totalTaxLiability,
      averageTaxRate: averageTaxRate.toFixed(2),
      deductibleExpenses,
    };
  }, [taxReports]);

  return {
    taxReports,
    currentReport,
    isLoading,
    error,
    generateTaxReport,
    loadTaxReportHistory,
    downloadTaxReport,
    calculateTaxSummary,
  };
}
