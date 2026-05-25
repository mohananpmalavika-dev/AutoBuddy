import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  applyReferral,
  getActiveAds,
  getReferral,
  getRevenuePlans,
  getWallet,
  subscribePlan,
} from '../lib/revenueApi';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

export default function RevenueCard({ token, role }) {
  const [plans, setPlans] = useState([]);
  const [referral, setReferral] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [ads, setAds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [referralInput, setReferralInput] = useState('');

  const roleLabel = useMemo(() => (String(role || '').toLowerCase() === 'driver' ? 'Driver' : 'Passenger'), [role]);

  const load = useCallback(async () => {
    const [plansResp, referralResp, walletResp, adsResp] = await Promise.all([
      getRevenuePlans(token, role),
      getReferral(token),
      getWallet(token),
      getActiveAds(token, 'home_banner').catch(() => []),
    ]);
    setPlans(Array.isArray(plansResp) ? plansResp : []);
    setReferral(referralResp?.referral || null);
    setWallet(walletResp?.wallet || null);
    setAds(Array.isArray(adsResp) ? adsResp : []);
  }, [role, token]);

  async function handleSubscribe(planType) {
    try {
      setBusy(true);
      const response = await subscribePlan(token, planType);
      Alert.alert('Plan Activated', response?.message || 'Subscription active');
      await load();
    } catch (err) {
      Alert.alert('Subscription Failed', err.message || 'Error while subscribing');
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyReferral() {
    try {
      const code = String(referralInput || '').trim().toUpperCase();
      if (!code) {
        throw new Error('Enter a referral code');
      }
      setBusy(true);
      const response = await applyReferral(token, code);
      Alert.alert('Referral Applied', response?.message || 'Reward applied');
      setReferralInput('');
      await load();
    } catch (err) {
      Alert.alert('Referral Failed', err.message || 'Could not apply referral');
    } finally {
      setBusy(false);
    }
  }

  async function shareReferral() {
    if (!referral?.code) return;
    try {
      await Share.share({
        message: `Join AutoBuddy with my referral code ${referral.code} and unlock rewards.`,
      });
    } catch {
      // Ignore share failures.
    }
  }

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => {
        load().catch(() => null);
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [load, token]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Revenue Hub</Text>
      <Text style={styles.subtitle}>{roleLabel} monetization: plans, referrals, wallet, ads</Text>

      <Text style={styles.wallet}>Wallet Balance: INR {Number(wallet?.balance || 0).toFixed(2)}</Text>

      <Text style={styles.section}>Plans</Text>
      {plans.length === 0 ? (
        <Text style={styles.muted}>No plans available right now.</Text>
      ) : (
        plans.map((plan) => (
          <View key={plan.plan_type} style={styles.plan}>
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planPrice}>INR {plan.amount}</Text>
            <TouchableOpacity style={styles.button} onPress={() => handleSubscribe(plan.plan_type)} disabled={busy}>
              <Text style={styles.buttonText}>Subscribe</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Text style={styles.section}>Referral</Text>
      <Text style={styles.codeText}>My Code: {referral?.code || 'Generating...'}</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.greenButton} onPress={shareReferral} disabled={busy || !referral?.code}>
          <Text style={styles.buttonText}>Share Code</Text>
        </TouchableOpacity>
      </View>
      <VoiceTextInput
        value={referralInput}
        onChangeText={setReferralInput}
        placeholder="Enter referral code"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />
      <TouchableOpacity style={styles.darkButton} onPress={handleApplyReferral} disabled={busy}>
        <Text style={styles.buttonText}>Apply Referral</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Sponsored Ads</Text>
      {ads.length === 0 ? (
        <Text style={styles.muted}>No sponsored cards currently active.</Text>
      ) : (
        ads.slice(0, 2).map((ad) => (
          <View key={ad.id} style={styles.adRow}>
            <Text style={styles.adTitle}>{ad.title}</Text>
            <Text style={styles.muted}>{ad.placement}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 14,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    color: '#475569',
    fontWeight: '600',
    fontSize: 12,
  },
  wallet: {
    marginTop: 8,
    color: '#166534',
    fontWeight: '800',
  },
  section: {
    marginTop: 12,
    marginBottom: 6,
    color: '#334155',
    fontWeight: '900',
  },
  muted: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 12,
  },
  plan: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 8,
  },
  planName: {
    fontWeight: '900',
    color: '#0F172A',
  },
  planPrice: {
    marginTop: 4,
    color: '#475569',
    fontWeight: '700',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  greenButton: {
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  darkButton: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  codeText: {
    color: '#0F172A',
    fontWeight: '800',
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  adRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 9,
    marginBottom: 6,
  },
  adTitle: {
    color: '#0F172A',
    fontWeight: '800',
  },
});
