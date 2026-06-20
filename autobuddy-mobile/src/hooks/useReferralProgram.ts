import { useState, useEffect, useCallback } from 'react';

export interface ReferredDriver {
  new_user_id: string;
  referee_name?: string;
  referee_phone?: string;
  status: 'pending' | 'completed' | 'active';
  signup_date: string;
  first_ride_date?: string;
  bonus_amount: number;
}

export interface ReferralReward {
  id: string;
  referrer_user_id: string;
  new_user_id: string;
  referral_code: string;
  reward_amount: number;
  status: 'pending' | 'credited' | 'paid_out';
  created_at: string;
}

export interface ReferralInfo {
  id: string;
  user_id: string;
  code: string;
  total_invites: number;
  successful_invites: number;
  total_earned: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReferralState {
  referralInfo: ReferralInfo | null;
  referralLink: string | null;
  referralRewards: ReferralReward[];
  totalEarnings: number;
  pendingBonuses: number;
  claimedBonuses: number;
  referredDriverCount: number;
  isLoading: boolean;
  error: string | null;
}

const API_BASE = 'http://localhost:8000/api';

export function useReferralProgram(userId: string | undefined, authToken: string) {
  const [state, setState] = useState<ReferralState>({
    referralInfo: null,
    referralLink: null,
    referralRewards: [],
    totalEarnings: 0,
    pendingBonuses: 0,
    claimedBonuses: 0,
    referredDriverCount: 0,
    isLoading: false,
    error: null,
  });

  const fetchReferralInfo = useCallback(async () => {
    if (!userId || !authToken) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`${API_BASE}/v3/revenue/referral/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) throw new Error('Failed to fetch referral info');

      const data = await response.json();
      const referral = data.referral || {};
      const rewards = data.rewards || [];

      const referralLink = `https://autobuddy.app/join?ref=${referral.code}`;
      const totalEarnings = Number(referral.total_earned || 0);
      const successfulInvites = Number(referral.successful_invites || 0);

      // Calculate pending bonuses (rewards not yet paid out)
      const pendingBonuses = rewards
        .filter((r: ReferralReward) => r.status === 'pending')
        .reduce((sum: number, r: ReferralReward) => sum + r.reward_amount, 0);

      const claimedBonuses = rewards
        .filter((r: ReferralReward) => r.status === 'credited' || r.status === 'paid_out')
        .reduce((sum: number, r: ReferralReward) => sum + r.reward_amount, 0);

      setState(prev => ({
        ...prev,
        referralInfo: referral,
        referralLink,
        referralRewards: rewards,
        totalEarnings,
        pendingBonuses,
        claimedBonuses,
        referredDriverCount: successfulInvites,
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

  const claimBonus = useCallback(async (amount: number) => {
    if (!authToken) return false;

    try {
      const response = await fetch(`${API_BASE}/v3/revenue/referral/claim-bonus`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount }),
      });

      if (!response.ok) throw new Error('Failed to claim bonus');

      // Refresh referral info after claiming
      await fetchReferralInfo();
      return true;
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to claim bonus',
      }));
      return false;
    }
  }, [authToken, fetchReferralInfo]);

  const shareReferralLink = useCallback((platform: 'whatsapp' | 'sms' | 'email' | 'copy') => {
    const link = state.referralLink;
    const code = state.referralInfo?.code || '';
    const bonusAmount = 50; // Default referral bonus amount

    if (!link) return;

    const message = `Join me on AutoBuddy with referral code ${code} and get ₹${bonusAmount} bonus! ${link}`;

    switch (platform) {
      case 'whatsapp':
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        // In a real app, would open this URL
        console.log('WhatsApp share:', whatsappUrl);
        break;

      case 'sms':
        const smsUrl = `sms:?body=${encodeURIComponent(message)}`;
        console.log('SMS share:', smsUrl);
        break;

      case 'email':
        const emailUrl = `mailto:?subject=Earn ₹${bonusAmount} with AutoBuddy Referral&body=${encodeURIComponent(`I'm earning great money as an AutoBuddy driver. Join with my code ${code} and get ₹${bonusAmount} bonus!\n\n${link}`)}`;
        console.log('Email share:', emailUrl);
        break;

      case 'copy':
        // Copy to clipboard (handled in UI component)
        return link;
    }
  }, [state.referralLink, state.referralInfo]);

  const getShareUrl = useCallback((platform: 'whatsapp' | 'sms' | 'email'): string => {
    const link = state.referralLink || '';
    const code = state.referralInfo?.code || '';
    const bonusAmount = 50;
    const message = `Join me on AutoBuddy with referral code ${code} and get ₹${bonusAmount} bonus! ${link}`;

    switch (platform) {
      case 'whatsapp':
        return `https://wa.me/?text=${encodeURIComponent(message)}`;
      case 'sms':
        return `sms:?body=${encodeURIComponent(message)}`;
      case 'email':
        return `mailto:?subject=Earn ₹${bonusAmount} with AutoBuddy Referral&body=${encodeURIComponent(`I'm earning great money as an AutoBuddy driver. Join with my code ${code} and get ₹${bonusAmount} bonus!\n\n${link}`)}`;
      default:
        return '';
    }
  }, [state.referralLink, state.referralInfo]);

  const calculateDaysActive = useCallback((signupDate: string): number => {
    const now = new Date();
    const signup = new Date(signupDate);
    const diffTime = Math.abs(now.getTime() - signup.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, []);

  useEffect(() => {
    if (userId && authToken) {
      fetchReferralInfo();

      // Refresh every 30 seconds
      const interval = setInterval(fetchReferralInfo, 30000);
      return () => clearInterval(interval);
    }
  }, [userId, authToken, fetchReferralInfo]);

  return {
    ...state,
    fetchReferralInfo,
    claimBonus,
    shareReferralLink,
    getShareUrl,
    calculateDaysActive,
  };
}
