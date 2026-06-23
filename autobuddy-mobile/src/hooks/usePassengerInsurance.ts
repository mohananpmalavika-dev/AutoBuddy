import { useState, useCallback } from 'react';
import axios from 'axios';

export interface InsurancePlan {
  id: string;
  name: string;
  type: 'basic' | 'standard' | 'premium';
  monthlyPremium: number;
  coverageAmount: number;
  coverageTypes: string[];
  deductible: number;
  features: string[];
  status: 'active' | 'inactive' | 'expired';
  startDate: Date;
  endDate: Date;
}

export interface InsuranceClaim {
  id: string;
  passengerId: string;
  insurancePlanId: string;
  claimType: string;
  description: string;
  amount: number;
  status: 'submitted' | 'pending' | 'approved' | 'rejected' | 'paid';
  submittedDate: Date;
  resolvedDate?: Date;
  documents: string[];
}

interface UsePassengerInsuranceReturn {
  activePlans: InsurancePlan[];
  availablePlans: InsurancePlan[];
  claims: InsuranceClaim[];
  loading: boolean;
  error: Error | null;
  fetchActivePlans: () => Promise<void>;
  fetchAvailablePlans: () => Promise<void>;
  fetchClaims: () => Promise<void>;
  purchasePlan: (planId: string) => Promise<boolean>;
  cancelPlan: (planId: string) => Promise<boolean>;
  submitClaim: (planId: string, claimType: string, description: string, documents: string[]) => Promise<boolean>;
  updateClaim: (claimId: string, updates: Partial<InsuranceClaim>) => Promise<boolean>;
  uploadClaimDocument: (claimId: string, filePath: string) => Promise<boolean>;
  getCoverageAmount: (planId: string) => number;
  getClaimsHistory: () => InsuranceClaim[];
  calculatePremium: (planType: string, coverage: number) => number;
}

export const usePassengerInsurance = (token: string | null, passengerId: string): UsePassengerInsuranceReturn => {
  const [activePlans, setActivePlans] = useState<InsurancePlan[]>([]);
  const [availablePlans, setAvailablePlans] = useState<InsurancePlan[]>([]);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchActivePlans = useCallback(async () => {
    if (!token) {return;}
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/passengers/${passengerId}/insurance/active`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActivePlans(response.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch active plans'));
    } finally {
      setLoading(false);
    }
  }, [token, passengerId, API_BASE_URL]);

  const fetchAvailablePlans = useCallback(async () => {
    if (!token) {return;}
    try {
      const response = await axios.get(
        `${API_BASE_URL}/insurance/plans`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAvailablePlans(response.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch available plans'));
    }
  }, [token, API_BASE_URL]);

  const fetchClaims = useCallback(async () => {
    if (!token) {return;}
    try {
      const response = await axios.get(
        `${API_BASE_URL}/passengers/${passengerId}/insurance/claims`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setClaims(response.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch claims'));
    }
  }, [token, passengerId, API_BASE_URL]);

  const purchasePlan = useCallback(
    async (planId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/passengers/${passengerId}/insurance/plans/${planId}/purchase`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const plan = response.data;
        setActivePlans((prev) => [...prev, plan]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to purchase plan'));
        return false;
      }
    },
    [token, passengerId, API_BASE_URL]
  );

  const cancelPlan = useCallback(
    async (planId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/passengers/${passengerId}/insurance/plans/${planId}/cancel`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setActivePlans((prev) => prev.filter((p) => p.id !== planId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to cancel plan'));
        return false;
      }
    },
    [token, passengerId, API_BASE_URL]
  );

  const submitClaim = useCallback(
    async (
      planId: string,
      claimType: string,
      description: string,
      documents: string[]
    ): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/passengers/${passengerId}/insurance/claims`,
          { planId, claimType, description, documents },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setClaims((prev) => [...prev, response.data]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to submit claim'));
        return false;
      }
    },
    [token, passengerId, API_BASE_URL]
  );

  const updateClaim = useCallback(
    async (claimId: string, updates: Partial<InsuranceClaim>): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.put(
          `${API_BASE_URL}/passengers/${passengerId}/insurance/claims/${claimId}`,
          updates,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setClaims((prev) =>
          prev.map((c) => (c.id === claimId ? response.data : c))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update claim'));
        return false;
      }
    },
    [token, passengerId, API_BASE_URL]
  );

  const uploadClaimDocument = useCallback(
    async (claimId: string, filePath: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: filePath,
          type: 'application/pdf',
          name: `claim_${claimId}_${Date.now()}.pdf`,
        } as any);

        await axios.post(
          `${API_BASE_URL}/passengers/${passengerId}/insurance/claims/${claimId}/document`,
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
        setError(err instanceof Error ? err : new Error('Failed to upload document'));
        return false;
      }
    },
    [token, passengerId, API_BASE_URL]
  );

  const getCoverageAmount = useCallback(
    (planId: string): number => {
      const plan = activePlans.find((p) => p.id === planId);
      return plan?.coverageAmount || 0;
    },
    [activePlans]
  );

  const getClaimsHistory = useCallback(() => {
    return claims.filter((c) => c.status === 'paid' || c.status === 'rejected');
  }, [claims]);

  const calculatePremium = useCallback((planType: string, coverage: number): number => {
    const basePremiums = {
      basic: 100,
      standard: 200,
      premium: 400,
    };
    const basePremium = (basePremiums as any)[planType] || 100;
    return Math.round(basePremium * (coverage / 100000));
  }, []);

  return {
    activePlans,
    availablePlans,
    claims,
    loading,
    error,
    fetchActivePlans,
    fetchAvailablePlans,
    fetchClaims,
    purchasePlan,
    cancelPlan,
    submitClaim,
    updateClaim,
    uploadClaimDocument,
    getCoverageAmount,
    getClaimsHistory,
    calculatePremium,
  };
};
