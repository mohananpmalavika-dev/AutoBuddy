import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FamilyRelation = 'parent' | 'child' | 'spouse' | 'sibling' | 'friend';

export interface FamilyMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  phone: string;
  relation: FamilyRelation;
  status: 'pending' | 'active' | 'inactive';
  joinedAt?: Date;
  linkedAt?: Date;
  emergencyAccess: boolean;
  sharedPayment: boolean;
}

export interface SharedPaymentMethod {
  id: string;
  type: 'credit_card' | 'debit_card' | 'upi' | 'wallet';
  lastFour: string;
  ownerName: string;
  ownerId: string;
  sharedWith: string[];
  isDefault: boolean;
  createdAt: Date;
}

const FAMILY_ACCOUNTS_STORAGE = 'family_accounts';
const SHARED_PAYMENTS_STORAGE = 'shared_payment_methods';

export const useFamilyAccounts = (token: string | null, userId: string) => {
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [sharedPayments, setSharedPayments] = useState<SharedPaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const saved = await AsyncStorage.getItem(FAMILY_ACCOUNTS_STORAGE);
        const payments = await AsyncStorage.getItem(SHARED_PAYMENTS_STORAGE);
        if (saved) {setFamilyMembers(JSON.parse(saved));}
        if (payments) {setSharedPayments(JSON.parse(payments));}
      } catch (err) {
        setError(`Init: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    if (token && userId) {init();}
  }, [token, userId]);

  const linkMember = useCallback(
    async (email: string, name: string, phone: string, relation: FamilyRelation) => {
      const member: FamilyMember = {
        id: `fam_${Date.now()}`,
        userId,
        email,
        name,
        phone,
        relation,
        status: 'pending',
        emergencyAccess: false,
        sharedPayment: false,
      };
      const updated = [member, ...familyMembers];
      setFamilyMembers(updated);
      await AsyncStorage.setItem(FAMILY_ACCOUNTS_STORAGE, JSON.stringify(updated));
      return member;
    },
    [familyMembers, userId]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      const updated = familyMembers.filter(m => m.id !== memberId);
      setFamilyMembers(updated);
      await AsyncStorage.setItem(FAMILY_ACCOUNTS_STORAGE, JSON.stringify(updated));
    },
    [familyMembers]
  );

  const getMembers = useCallback(() => familyMembers, [familyMembers]);

  const updateStatus = useCallback(
    async (memberId: string, status: 'pending' | 'active' | 'inactive') => {
      const updated = familyMembers.map(m =>
        m.id === memberId ? { ...m, status, joinedAt: status === 'active' ? new Date() : m.joinedAt } : m
      );
      setFamilyMembers(updated);
      await AsyncStorage.setItem(FAMILY_ACCOUNTS_STORAGE, JSON.stringify(updated));
    },
    [familyMembers]
  );

  const enableEmergency = useCallback(
    async (memberId: string) => {
      const updated = familyMembers.map(m =>
        m.id === memberId ? { ...m, emergencyAccess: true } : m
      );
      setFamilyMembers(updated);
      await AsyncStorage.setItem(FAMILY_ACCOUNTS_STORAGE, JSON.stringify(updated));
    },
    [familyMembers]
  );

  const addPayment = useCallback(
    async (type: any, lastFour: string, ownerName: string) => {
      const payment: SharedPaymentMethod = {
        id: `pay_${Date.now()}`,
        type,
        lastFour,
        ownerName,
        ownerId: userId,
        sharedWith: [],
        isDefault: true,
        createdAt: new Date(),
      };
      const updated = [payment, ...sharedPayments];
      setSharedPayments(updated);
      await AsyncStorage.setItem(SHARED_PAYMENTS_STORAGE, JSON.stringify(updated));
      return payment;
    },
    [sharedPayments, userId]
  );

  const sharePayment = useCallback(
    async (paymentId: string, memberId: string) => {
      const updated = sharedPayments.map(p =>
        p.id === paymentId ? { ...p, sharedWith: [...new Set([...p.sharedWith, memberId])] } : p
      );
      setSharedPayments(updated);
      await AsyncStorage.setItem(SHARED_PAYMENTS_STORAGE, JSON.stringify(updated));
    },
    [sharedPayments]
  );

  return {
    familyMembers,
    sharedPayments,
    loading,
    error,
    linkMember,
    removeMember,
    getMembers,
    updateStatus,
    enableEmergency,
    addPayment,
    sharePayment,
  };
};
