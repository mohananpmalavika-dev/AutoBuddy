import { useState, useEffect, useCallback } from 'react';

export interface DriverInsurancePlan {
  plan_id: string;
  driver_id: string;
  plan_name: string;
  coverage_type: 'bronze' | 'silver' | 'gold';
  status: 'active' | 'inactive' | 'suspended' | 'expired';
  monthly_premium: number;
  trip_deductible: number;
  trip_limit: number;
  coverage_limits: {
    accident: number;
    liability: number;
    injury: number;
    theft: number;
  };
  accident_coverage: boolean;
  liability_coverage: boolean;
  injury_coverage: boolean;
  theft_coverage: boolean;
  active_from: string;
  active_until: string;
  auto_renew: boolean;
}

export interface InsuranceClaim {
  claim_id: string;
  trip_id: string;
  driver_id: string;
  claim_type: string;
  claim_description: string;
  claim_amount: number;
  claim_status: 'submitted' | 'under_review' | 'approved' | 'rejected';
  incident_datetime: string;
  incident_location: string;
  document_count: number;
  approved_amount?: number;
  rejection_reason?: string;
  decision_message?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface TripsInsured {
  trip_id: string;
  booking_id: string;
  driver_id: string;
  insurance_premium: number;
  ride_type: string;
  start_time: string;
  end_time?: string;
  claim_filed: boolean;
  claim_id?: string;
}

export interface PolicyTerms {
  policy_id: string;
  plan_name: string;
  coverage_type: string;
  coverage_limits: {
    accident: number;
    liability: number;
    injury: number;
    theft: number;
  };
  deductible: number;
  what_covered: string[];
  what_not_covered: string[];
  claim_process: string;
  max_claims_per_year: number;
  document_upload_limit: number;
  claim_processing_days: number;
  terms_html: string;
}

export interface InsuranceState {
  activePlan: DriverInsurancePlan | null;
  policyTerms: PolicyTerms | null;
  tripsInsured: TripsInsured[];
  claims: InsuranceClaim[];
  pendingClaimCount: number;
  approvedClaimCount: number;
  totalClaimsPaid: number;
  isLoading: boolean;
  error: string | null;
}

const API_BASE = 'http://localhost:8000/api/v3/insurance';

export function useDriverInsurance(userId: string | undefined, authToken: string) {
  const [state, setState] = useState<InsuranceState>({
    activePlan: null,
    policyTerms: null,
    tripsInsured: [],
    claims: [],
    pendingClaimCount: 0,
    approvedClaimCount: 0,
    totalClaimsPaid: 0,
    isLoading: false,
    error: null,
  });

  const fetchActivePlan = useCallback(async () => {
    if (!userId || !authToken) {return;}

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`${API_BASE}/driver/${userId}/plan`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setState(prev => ({ ...prev, activePlan: null, isLoading: false }));
          return;
        }
        throw new Error('Failed to fetch insurance plan');
      }

      const data = await response.json();
      setState(prev => ({
        ...prev,
        activePlan: data.plan || null,
        isLoading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unknown error',
        isLoading: false,
      }));
    }
  }, [userId, authToken]);

  const fetchPolicyTerms = useCallback(async (planType: string) => {
    if (!authToken) {return;}

    try {
      const response = await fetch(`${API_BASE}/plans/${planType}/terms`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) {throw new Error('Failed to fetch policy terms');}

      const data = await response.json();
      setState(prev => ({
        ...prev,
        policyTerms: data.policy || null,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [authToken]);

  const fetchTripsInsured = useCallback(async (days?: number) => {
    if (!userId || !authToken) {return;}

    try {
      let url = `${API_BASE}/driver/${userId}/trips-insured`;
      if (days) {
        const endDate = new Date().toISOString();
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        url += `?start_date=${startDate}&end_date=${endDate}`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) {throw new Error('Failed to fetch trips');}

      const data = await response.json();
      setState(prev => ({
        ...prev,
        tripsInsured: data.trips || [],
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [userId, authToken]);

  const fetchClaims = useCallback(
    async (status?: string) => {
      if (!userId || !authToken) {return;}

      setState(prev => ({ ...prev, isLoading: true }));
      try {
        let url = `${API_BASE}/claims/${userId}`;
        if (status && status !== 'all') {
          url += `?status=${status}`;
        }

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (!response.ok) {throw new Error('Failed to fetch claims');}

        const data = await response.json();
        const claims = data.claims || [];
        const stats = data.statistics || {};

        setState(prev => ({
          ...prev,
          claims,
          pendingClaimCount: stats.pending_count || 0,
          approvedClaimCount: stats.approved_count || 0,
          totalClaimsPaid: stats.approved_amount || 0,
          isLoading: false,
        }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Unknown error',
          isLoading: false,
        }));
      }
    },
    [userId, authToken]
  );

  const fileClaimWithDocuments = useCallback(
    async (
      tripId: string,
      claimType: string,
      description: string,
      incidentDateTime: string,
      incidentLocation: string,
      claimAmount: number,
      documents?: File[]
    ) => {
      if (!authToken) {return null;}

      try {
        const formData = new FormData();
        formData.append('trip_id', tripId);
        formData.append('claim_type', claimType);
        formData.append('claim_description', description);
        formData.append('incident_datetime', incidentDateTime);
        formData.append('incident_location', incidentLocation);
        formData.append('claim_amount', claimAmount.toString());

        if (documents) {
          for (let i = 0; i < Math.min(documents.length, 5); i++) {
            formData.append('documents', documents[i]);
          }
        }

        const response = await fetch(`${API_BASE}/claim/file`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body: formData,
        });

        if (!response.ok) {throw new Error('Failed to file claim');}

        const data = await response.json();

        // Refresh claims list
        await fetchClaims();

        return data;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to file claim',
        }));
        return null;
      }
    },
    [authToken, fetchClaims]
  );

  const getClaimStatus = useCallback(
    async (claimId: string) => {
      if (!authToken) {return null;}

      try {
        const response = await fetch(`${API_BASE}/claims/${claimId}/status`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (!response.ok) {throw new Error('Failed to fetch claim status');}

        const data = await response.json();
        return data.claim || null;
      } catch (err) {
        setState(prev => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Unknown error',
        }));
        return null;
      }
    },
    [authToken]
  );

  const calculateDaysUntilExpiry = useCallback((activeUntil: string): number => {
    const now = new Date();
    const expiry = new Date(activeUntil);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, []);

  const formatCoverageLimit = useCallback((amount: number): string => {
    return `₹${amount.toLocaleString('en-IN')}`;
  }, []);

  const calculatePremiumForFare = useCallback((fare: number, planType: string): number => {
    // Premium calculation based on plan type
    const premiumPercentage: { [key: string]: number } = {
      bronze: 0.02,   // 2% of fare
      silver: 0.03,   // 3% of fare
      gold: 0.04,     // 4% of fare
    };

    const percentage = premiumPercentage[planType.toLowerCase()] || 0.02;
    return Math.round(fare * percentage * 100) / 100;
  }, []);

  const getCoverageStatus = useCallback((coverage: boolean): string => {
    return coverage ? '✓ Covered' : '✗ Not Covered';
  }, []);

  useEffect(() => {
    if (userId && authToken) {
      fetchActivePlan();
      fetchTripsInsured();
      fetchClaims();

      // Refresh every 30 seconds
      const interval = setInterval(() => {
        fetchActivePlan();
        fetchClaims();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [userId, authToken, fetchActivePlan, fetchTripsInsured, fetchClaims]);

  return {
    ...state,
    fetchActivePlan,
    fetchPolicyTerms,
    fetchTripsInsured,
    fetchClaims,
    fileClaimWithDocuments,
    getClaimStatus,
    calculateDaysUntilExpiry,
    formatCoverageLimit,
    calculatePremiumForFare,
    getCoverageStatus,
  };
}
