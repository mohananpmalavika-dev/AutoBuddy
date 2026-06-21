import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface InsuranceCoverage {
  id: string;
  type: 'basic' | 'premium' | 'comprehensive';
  name: string;
  description: string;
  monthlyPremium: number;
  deductible: number;
  coverageLimit: number;
  coverageDetails: {
    accidentCoverage: boolean;
    theftCoverage: boolean;
    damageCoverage: boolean;
    passengerInjury: boolean;
    propertyDamage: boolean;
    liabilityLimit: number;
  };
  activeSince: Date;
  renewalDate: Date;
  status: 'active' | 'inactive' | 'expired';
}

export interface InsuranceClaim {
  id: string;
  claimNumber: string;
  rideId?: string;
  date: Date;
  incidentType:
    | 'accident'
    | 'theft'
    | 'damage'
    | 'injury'
    | 'property_damage'
    | 'other';
  description: string;
  location: string;
  amount: number;
  status: 'filed' | 'under_review' | 'approved' | 'rejected' | 'settled';
  evidence: {
    photos: string[];
    documents: string[];
    description: string;
  };
  estimatedAmount?: number;
  approvedAmount?: number;
  rejectionReason?: string;
  filedDate: Date;
  lastUpdated: Date;
  notes?: string;
}

export interface ClaimHistory extends InsuranceClaim {
  resolvedDate?: Date;
  resolution?: string;
}

const INSURANCE_COVERAGE_STORAGE = 'insurance_coverage';
const INSURANCE_CLAIMS_STORAGE = 'insurance_claims';
const CLAIM_HISTORY_STORAGE = 'insurance_claim_history';

export const useInsuranceCoverage = (token: string | null, userId: string) => {
  const [coverage, setCoverage] = useState<InsuranceCoverage | null>(null);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [claimHistory, setClaimHistory] = useState<ClaimHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const savedCoverage = await AsyncStorage.getItem(INSURANCE_COVERAGE_STORAGE);
        const savedClaims = await AsyncStorage.getItem(INSURANCE_CLAIMS_STORAGE);
        const savedHistory = await AsyncStorage.getItem(CLAIM_HISTORY_STORAGE);

        if (savedCoverage) {
          const parsedCoverage = JSON.parse(savedCoverage);
          parsedCoverage.activeSince = new Date(parsedCoverage.activeSince);
          parsedCoverage.renewalDate = new Date(parsedCoverage.renewalDate);
          setCoverage(parsedCoverage);
        } else {
          // Initialize default coverage
          await initializeDefaultCoverage();
        }

        if (savedClaims) {
          const parsedClaims = JSON.parse(savedClaims).map((c: any) => ({
            ...c,
            date: new Date(c.date),
            filedDate: new Date(c.filedDate),
            lastUpdated: new Date(c.lastUpdated),
          }));
          setClaims(parsedClaims);
        }

        if (savedHistory) {
          const parsedHistory = JSON.parse(savedHistory).map((h: any) => ({
            ...h,
            date: new Date(h.date),
            filedDate: new Date(h.filedDate),
            lastUpdated: new Date(h.lastUpdated),
            resolvedDate: h.resolvedDate ? new Date(h.resolvedDate) : undefined,
          }));
          setClaimHistory(parsedHistory);
        }
      } catch (err) {
        setError(`Init failed: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    if (token && userId) initialize();
  }, [token, userId]);

  // Initialize default coverage
  const initializeDefaultCoverage = useCallback(async () => {
    try {
      const defaultCoverage: InsuranceCoverage = {
        id: `coverage_${Date.now()}`,
        type: 'premium',
        name: 'AutoBuddy Premium Protection',
        description: 'Comprehensive coverage for all ride-related incidents',
        monthlyPremium: 299,
        deductible: 1000,
        coverageLimit: 100000,
        coverageDetails: {
          accidentCoverage: true,
          theftCoverage: true,
          damageCoverage: true,
          passengerInjury: true,
          propertyDamage: true,
          liabilityLimit: 100000,
        },
        activeSince: new Date(),
        renewalDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'active',
      };

      setCoverage(defaultCoverage);
      await AsyncStorage.setItem(INSURANCE_COVERAGE_STORAGE, JSON.stringify(defaultCoverage));
    } catch (err) {
      console.error('Failed to initialize coverage:', err);
    }
  }, []);

  // Get coverage details
  const getCoverageDetails = useCallback((): InsuranceCoverage | null => {
    return coverage;
  }, [coverage]);

  // Get active claims
  const getActiveClaims = useCallback((): InsuranceClaim[] => {
    return claims.filter(c => c.status !== 'settled' && c.status !== 'rejected');
  }, [claims]);

  // Get claims by status
  const getClaimsByStatus = useCallback(
    (status: InsuranceClaim['status']): InsuranceClaim[] => {
      return claims.filter(c => c.status === status);
    },
    [claims]
  );

  // File insurance claim
  const fileInsuranceClaim = useCallback(
    async (claimData: {
      rideId?: string;
      incidentType: InsuranceClaim['incidentType'];
      description: string;
      location: string;
      amount: number;
      evidence: InsuranceClaim['evidence'];
    }): Promise<InsuranceClaim> => {
      try {
        const newClaim: InsuranceClaim = {
          id: `claim_${Date.now()}`,
          claimNumber: `CLM-${Date.now().toString().slice(-6)}`,
          rideId: claimData.rideId,
          date: new Date(),
          incidentType: claimData.incidentType,
          description: claimData.description,
          location: claimData.location,
          amount: claimData.amount,
          status: 'filed',
          evidence: claimData.evidence,
          filedDate: new Date(),
          lastUpdated: new Date(),
        };

        const updatedClaims = [newClaim, ...claims];
        setClaims(updatedClaims);
        await AsyncStorage.setItem(INSURANCE_CLAIMS_STORAGE, JSON.stringify(updatedClaims));

        return newClaim;
      } catch (err) {
        const errorMsg = `Claim filing failed: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [claims]
  );

  // Update claim status
  const updateClaimStatus = useCallback(
    async (
      claimId: string,
      newStatus: InsuranceClaim['status'],
      approvedAmount?: number,
      rejectionReason?: string
    ): Promise<void> => {
      try {
        const updatedClaims = claims.map(c => {
          if (c.id === claimId) {
            return {
              ...c,
              status: newStatus,
              approvedAmount: approvedAmount || c.approvedAmount,
              rejectionReason: rejectionReason || c.rejectionReason,
              lastUpdated: new Date(),
            };
          }
          return c;
        });

        setClaims(updatedClaims);
        await AsyncStorage.setItem(INSURANCE_CLAIMS_STORAGE, JSON.stringify(updatedClaims));

        // If settled or rejected, move to history
        if (newStatus === 'settled' || newStatus === 'rejected') {
          const claim = updatedClaims.find(c => c.id === claimId);
          if (claim) {
            const historyEntry: ClaimHistory = {
              ...claim,
              resolvedDate: new Date(),
              resolution: newStatus === 'settled' ? 'approved' : 'rejected',
            };
            const updatedHistory = [historyEntry, ...claimHistory];
            setClaimHistory(updatedHistory);
            await AsyncStorage.setItem(CLAIM_HISTORY_STORAGE, JSON.stringify(updatedHistory));
          }
        }
      } catch (err) {
        const errorMsg = `Status update failed: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [claims, claimHistory]
  );

  // Get claim history
  const getClaimHistory = useCallback((): ClaimHistory[] => {
    return claimHistory;
  }, [claimHistory]);

  // Get claim by ID
  const getClaimById = useCallback(
    (claimId: string): InsuranceClaim | null => {
      return claims.find(c => c.id === claimId) || null;
    },
    [claims]
  );

  // Get coverage summary
  const getCoverageSummary = useCallback(() => {
    if (!coverage) return null;

    const totalClaims = claims.length;
    const pendingClaims = claims.filter(c => c.status === 'under_review').length;
    const approvedClaims = claims.filter(c => c.status === 'approved').length;
    const settledClaims = claimHistory.filter(h => h.resolution === 'approved').length;
    const totalApprovedAmount = claims
      .filter(c => c.status === 'approved')
      .reduce((sum, c) => sum + (c.approvedAmount || 0), 0);

    return {
      coverageType: coverage.type,
      coverageName: coverage.name,
      monthlyPremium: coverage.monthlyPremium,
      status: coverage.status,
      renewalDate: coverage.renewalDate,
      totalClaims,
      pendingClaims,
      approvedClaims,
      settledClaims,
      totalApprovedAmount,
      coverageDetails: coverage.coverageDetails,
    };
  }, [coverage, claims, claimHistory]);

  // Upgrade coverage plan
  const upgradeCoveragePlan = useCallback(
    async (newType: 'basic' | 'premium' | 'comprehensive'): Promise<void> => {
      try {
        if (!coverage) throw new Error('No coverage found');

        const premiumMap = {
          basic: 199,
          premium: 299,
          comprehensive: 499,
        };

        const updatedCoverage: InsuranceCoverage = {
          ...coverage,
          type: newType,
          monthlyPremium: premiumMap[newType],
          lastUpdated: new Date() as any,
        };

        setCoverage(updatedCoverage);
        await AsyncStorage.setItem(INSURANCE_COVERAGE_STORAGE, JSON.stringify(updatedCoverage));
      } catch (err) {
        const errorMsg = `Upgrade failed: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [coverage]
  );

  // Add claim notes
  const addClaimNotes = useCallback(
    async (claimId: string, notes: string): Promise<void> => {
      try {
        const updatedClaims = claims.map(c => {
          if (c.id === claimId) {
            return { ...c, notes };
          }
          return c;
        });

        setClaims(updatedClaims);
        await AsyncStorage.setItem(INSURANCE_CLAIMS_STORAGE, JSON.stringify(updatedClaims));
      } catch (err) {
        const errorMsg = `Add notes failed: ${err}`;
        setError(errorMsg);
        throw new Error(errorMsg);
      }
    },
    [claims]
  );

  return {
    // Methods
    getCoverageDetails,
    getActiveClaims,
    getClaimsByStatus,
    fileInsuranceClaim,
    updateClaimStatus,
    getClaimHistory,
    getClaimById,
    getCoverageSummary,
    upgradeCoveragePlan,
    addClaimNotes,

    // Data
    coverage,
    claims,
    claimHistory,

    // State
    loading,
    error,
  };
};
