import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CoverageOption {
  id: string;
  name: string;
  description: string;
  limit: number;
  premium: number;
  deductible: number;
  coverageType: 'liability' | 'collision' | 'comprehensive' | 'uninsured';
}

export interface InsuranceClaim {
  id: string;
  date: string;
  rideId: string;
  status: 'filed' | 'under_review' | 'approved' | 'rejected' | 'settled';
  claimType: string;
  description: string;
  amount: number;
  approvalDate?: string;
  notes?: string;
}

export interface InsuranceCoverage {
  policyNumber: string;
  provider: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'cancelled';
  coverages: CoverageOption[];
  claims: InsuranceClaim[];
  totalCovered: number;
  nextRenewalDate: string;
}

export const useInsuranceCoverage = (token: string | null, userId: string) => {
  const [coverage, setCoverage] = useState<InsuranceCoverage | null>(null);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token && userId) {
      loadCoverageData();
    }
  }, [token, userId]);

  const loadCoverageData = useCallback(async () => {
    try {
      setLoading(true);
      const cached = await AsyncStorage.getItem(`autobuddy_cache_insurance_${userId}`);
      if (cached) {
        const data = JSON.parse(cached);
        setCoverage(data.coverage);
        setClaims(data.claims || []);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load insurance data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const getCoverageDetails = useCallback(async (): Promise<InsuranceCoverage | null> => {
    if (!token) return null;
    try {
      const response = await fetch(
        `https://api.autobuddy.com/v1/user/${userId}/insurance/coverage`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Failed to fetch coverage');
      const data = await response.json();
      const coverageData: InsuranceCoverage = data.data;
      setCoverage(coverageData);
      await AsyncStorage.setItem(
        `autobuddy_cache_insurance_${userId}`,
        JSON.stringify({ coverage: coverageData, claims })
      );
      return coverageData;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      return null;
    }
  }, [token, userId, claims]);

  const getActiveClaims = useCallback(async (): Promise<InsuranceClaim[]> => {
    if (!token) return [];
    try {
      const response = await fetch(
        `https://api.autobuddy.com/v1/user/${userId}/insurance/claims`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Failed to fetch claims');
      const data = await response.json();
      const claimsList: InsuranceClaim[] = data.data || [];
      setClaims(claimsList);
      return claimsList;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      return [];
    }
  }, [token, userId]);

  const fileInsuranceClaim = useCallback(
    async (rideId: string, claimType: string, description: string, amount: number): Promise<InsuranceClaim | null> => {
      if (!token) return null;
      try {
        const response = await fetch(
          `https://api.autobuddy.com/v1/user/${userId}/insurance/claims`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ride_id: rideId, claim_type: claimType, description, amount }),
          }
        );
        if (!response.ok) throw new Error('Failed to file claim');
        const data = await response.json();
        const newClaim: InsuranceClaim = data.data;
        setClaims([newClaim, ...claims]);
        return newClaim;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
        return null;
      }
    },
    [token, userId, claims]
  );

  const updateClaimStatus = useCallback(
    async (claimId: string, status: string, notes?: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await fetch(
          `https://api.autobuddy.com/v1/insurance/claims/${claimId}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status, notes }),
          }
        );
        if (!response.ok) throw new Error('Failed to update');
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
        return false;
      }
    },
    [token]
  );

  const getClaimHistory = useCallback(
    (status?: string): InsuranceClaim[] => {
      if (status) {
        return claims.filter(c => c.status === status);
      }
      return claims;
    },
    [claims]
  );

  const getCoverageStatus = useCallback((): string => {
    if (!coverage) return 'unknown';
    if (coverage.status === 'active') return 'active';
    if (coverage.status === 'expired') return 'expired';
    return 'unknown';
  }, [coverage]);

  const getTotalClaimedAmount = useCallback((): number => {
    return claims.reduce((sum, claim) => sum + claim.amount, 0);
  }, [claims]);

  const getPendingClaimsCount = useCallback((): number => {
    return claims.filter(c => c.status === 'under_review' || c.status === 'filed').length;
  }, [claims]);

  return {
    coverage,
    claims,
    loading,
    error,
    getCoverageDetails,
    getActiveClaims,
    fileInsuranceClaim,
    updateClaimStatus,
    getClaimHistory,
    getCoverageStatus,
    getTotalClaimedAmount,
    getPendingClaimsCount,
    loadCoverageData,
  };
};
