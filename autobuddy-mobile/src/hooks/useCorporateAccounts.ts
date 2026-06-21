import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CorporateAccount {
  id: string;
  companyName: string;
  companyEmail: string;
  employeeId: string;
  department: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  linkedDate?: number;
  verificationToken?: string;
}

export interface CorporateBenefit {
  id: string;
  name: string;
  description: string;
  type: 'discount' | 'reimbursement' | 'policy';
  value: number;
  currency: string;
  isActive: boolean;
  validFrom: number;
  validUntil: number;
  terms: string;
}

export interface ExpenseReimbursement {
  id: string;
  employeeId: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  receiptUrl?: string;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'reimbursed';
  submittedDate: number;
  approvalDate?: number;
  rejectReason?: string;
}

export interface CompliancePolicy {
  id: string;
  title: string;
  description: string;
  category: 'safety' | 'expense' | 'usage';
  requirements: string[];
  penalties?: string;
  createdDate: number;
}

interface UseCorporateAccountsReturn {
  account: CorporateAccount | null;
  benefits: CorporateBenefit[];
  reimbursements: ExpenseReimbursement[];
  policies: CompliancePolicy[];
  linkCorporateAccount: (account: CorporateAccount) => Promise<void>;
  unlinkAccount: () => Promise<void>;
  getBenefits: () => Promise<CorporateBenefit[]>;
  submitExpenseReimbursement: (expense: Omit<ExpenseReimbursement, 'id' | 'submittedDate'>) => Promise<void>;
  getReimbursements: () => Promise<ExpenseReimbursement[]>;
  getPolicies: () => Promise<CompliancePolicy[]>;
  getCorporateSummary: () => Promise<{
    accountStatus: string;
    totalBenefits: number;
    activeBenefits: number;
    pendingReimbursements: number;
    totalReimbursed: number;
  }>;
}

const CORPORATE_STORAGE_KEY = 'corporate_account';
const CORPORATE_BENEFITS_KEY = 'corporate_benefits';
const CORPORATE_REIMBURSEMENTS_KEY = 'corporate_reimbursements';
const CORPORATE_POLICIES_KEY = 'corporate_policies';

const DEFAULT_POLICIES: CompliancePolicy[] = [
  {
    id: 'policy_1',
    title: 'Business Ride Guidelines',
    description: 'Guidelines for using corporate ride benefits for business travel',
    category: 'usage',
    requirements: [
      'Only for business-related travel',
      'Must use corporate account profile',
      'Receipts required for reimbursement',
    ],
    createdDate: Date.now(),
  },
  {
    id: 'policy_2',
    title: 'Expense Submission Policy',
    description: 'Requirements for submitting expense reimbursement requests',
    category: 'expense',
    requirements: [
      'Submit within 30 days of expense',
      'Include valid receipt',
      'Provide business purpose',
      'Require manager approval',
    ],
    penalties: 'Expenses not submitted within 30 days will not be reimbursed',
    createdDate: Date.now(),
  },
  {
    id: 'policy_3',
    title: 'Safety Standards',
    description: 'Safety requirements for all corporate rides',
    category: 'safety',
    requirements: [
      'Share ride details with corporate',
      'Use registered corporate account',
      'Report incidents immediately',
    ],
    createdDate: Date.now(),
  },
];

const DEFAULT_BENEFITS: CorporateBenefit[] = [
  {
    id: 'benefit_1',
    name: 'Corporate Ride Discount',
    description: '15% discount on all rides for business travel',
    type: 'discount',
    value: 15,
    currency: '%',
    isActive: true,
    validFrom: Date.now(),
    validUntil: Date.now() + 365 * 24 * 60 * 60 * 1000,
    terms: 'Valid for employees with active corporate account',
  },
  {
    id: 'benefit_2',
    name: 'Weekly Ride Allowance',
    description: '₹1000 monthly ride allowance for commuting',
    type: 'reimbursement',
    value: 1000,
    currency: '₹',
    isActive: true,
    validFrom: Date.now(),
    validUntil: Date.now() + 365 * 24 * 60 * 60 * 1000,
    terms: 'Automatic monthly allowance credited to account',
  },
  {
    id: 'benefit_3',
    name: 'Emergency Ride Coverage',
    description: '24/7 emergency ride assistance (no cost)',
    type: 'policy',
    value: 0,
    currency: '₹',
    isActive: true,
    validFrom: Date.now(),
    validUntil: Date.now() + 365 * 24 * 60 * 60 * 1000,
    terms: 'Available for emergency situations during work travel',
  },
];

export const useCorporateAccounts = (userId: string): UseCorporateAccountsReturn => {
  const [account, setAccount] = useState<CorporateAccount | null>(null);
  const [benefits, setBenefits] = useState<CorporateBenefit[]>([]);
  const [reimbursements, setReimbursements] = useState<ExpenseReimbursement[]>([]);
  const [policies, setPolicies] = useState<CompliancePolicy[]>([]);

  useEffect(() => {
    initializeCorporateData();
  }, [userId]);

  const initializeCorporateData = async () => {
    try {
      const storedAccount = await AsyncStorage.getItem(`${CORPORATE_STORAGE_KEY}_${userId}`);
      if (storedAccount) {
        setAccount(JSON.parse(storedAccount));
      }

      const storedBenefits = await AsyncStorage.getItem(`${CORPORATE_BENEFITS_KEY}_${userId}`);
      setBenefits(storedBenefits ? JSON.parse(storedBenefits) : DEFAULT_BENEFITS);

      const storedReimbursements = await AsyncStorage.getItem(`${CORPORATE_REIMBURSEMENTS_KEY}_${userId}`);
      setReimbursements(storedReimbursements ? JSON.parse(storedReimbursements) : []);

      const storedPolicies = await AsyncStorage.getItem(`${CORPORATE_POLICIES_KEY}_${userId}`);
      setPolicies(storedPolicies ? JSON.parse(storedPolicies) : DEFAULT_POLICIES);
    } catch (error) {
      console.error('Failed to initialize corporate data:', error);
    }
  };

  const linkCorporateAccount = useCallback(
    async (newAccount: CorporateAccount) => {
      try {
        const accountToStore = {
          ...newAccount,
          linkedDate: Date.now(),
        };
        await AsyncStorage.setItem(
          `${CORPORATE_STORAGE_KEY}_${userId}`,
          JSON.stringify(accountToStore),
        );
        setAccount(accountToStore);
      } catch (error) {
        console.error('Failed to link corporate account:', error);
        throw error;
      }
    },
    [userId],
  );

  const unlinkAccount = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(`${CORPORATE_STORAGE_KEY}_${userId}`);
      setAccount(null);
    } catch (error) {
      console.error('Failed to unlink corporate account:', error);
      throw error;
    }
  }, [userId]);

  const getBenefits = useCallback(async (): Promise<CorporateBenefit[]> => {
    try {
      const storedBenefits = await AsyncStorage.getItem(`${CORPORATE_BENEFITS_KEY}_${userId}`);
      const result = storedBenefits ? JSON.parse(storedBenefits) : DEFAULT_BENEFITS;
      setBenefits(result);
      return result;
    } catch (error) {
      console.error('Failed to get benefits:', error);
      return benefits;
    }
  }, [userId, benefits]);

  const submitExpenseReimbursement = useCallback(
    async (expense: Omit<ExpenseReimbursement, 'id' | 'submittedDate'>) => {
      try {
        const newReimbursement: ExpenseReimbursement = {
          ...expense,
          id: `reimbursement_${Date.now()}`,
          submittedDate: Date.now(),
        };

        const updatedReimbursements = [...reimbursements, newReimbursement];
        await AsyncStorage.setItem(
          `${CORPORATE_REIMBURSEMENTS_KEY}_${userId}`,
          JSON.stringify(updatedReimbursements),
        );
        setReimbursements(updatedReimbursements);
      } catch (error) {
        console.error('Failed to submit expense reimbursement:', error);
        throw error;
      }
    },
    [userId, reimbursements],
  );

  const getReimbursements = useCallback(async (): Promise<ExpenseReimbursement[]> => {
    try {
      const storedReimbursements = await AsyncStorage.getItem(
        `${CORPORATE_REIMBURSEMENTS_KEY}_${userId}`,
      );
      const result = storedReimbursements ? JSON.parse(storedReimbursements) : [];
      setReimbursements(result);
      return result;
    } catch (error) {
      console.error('Failed to get reimbursements:', error);
      return reimbursements;
    }
  }, [userId, reimbursements]);

  const getPolicies = useCallback(async (): Promise<CompliancePolicy[]> => {
    try {
      const storedPolicies = await AsyncStorage.getItem(`${CORPORATE_POLICIES_KEY}_${userId}`);
      const result = storedPolicies ? JSON.parse(storedPolicies) : DEFAULT_POLICIES;
      setPolicies(result);
      return result;
    } catch (error) {
      console.error('Failed to get policies:', error);
      return policies;
    }
  }, [userId, policies]);

  const getCorporateSummary = useCallback(async () => {
    try {
      const currentBenefits = await getBenefits();
      const currentReimbursements = await getReimbursements();

      const activeBenefits = currentBenefits.filter((b) => b.isActive).length;
      const pendingReimbursements = currentReimbursements.filter(
        (r) => r.status === 'submitted' || r.status === 'under_review',
      ).length;
      const totalReimbursed = currentReimbursements
        .filter((r) => r.status === 'reimbursed')
        .reduce((sum, r) => sum + r.amount, 0);

      return {
        accountStatus: account?.approvalStatus || 'not_linked',
        totalBenefits: currentBenefits.length,
        activeBenefits,
        pendingReimbursements,
        totalReimbursed,
      };
    } catch (error) {
      console.error('Failed to get corporate summary:', error);
      return {
        accountStatus: 'error',
        totalBenefits: 0,
        activeBenefits: 0,
        pendingReimbursements: 0,
        totalReimbursed: 0,
      };
    }
  }, [account, getBenefits, getReimbursements]);

  return {
    account,
    benefits,
    reimbursements,
    policies,
    linkCorporateAccount,
    unlinkAccount,
    getBenefits,
    submitExpenseReimbursement,
    getReimbursements,
    getPolicies,
    getCorporateSummary,
  };
};
