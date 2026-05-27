import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

function normalizePromo(promo) {
  if (!promo) {
    return null;
  }
  const discountType = String(promo.discount_type || '').toLowerCase();
  const discountValue = Number(promo.discount_value || 0);
  return {
    ...promo,
    discount_percent: discountType === 'percentage' ? discountValue : null,
    discount_amount: discountType === 'flat' ? discountValue : null,
    min_ride_amount: promo.min_ride_fare,
  };
}

export default function PromoCodePanel({ token, rideFare = 1, onDiscountApplied = () => {} }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [appliedCode, setAppliedCode] = useState(null);
  const [promoCodes, setPromoCodes] = useState([]);

  const fetchAvailablePromos = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/v1/passengers/promo-codes', { token });
      const promos = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      setPromoCodes(promos.map(normalizePromo).filter(Boolean));
    } catch (err) {
      setError(err.message || 'Failed to load promo codes');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchAvailablePromos().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchAvailablePromos]);

  const validatePromoCode = useCallback(async () => {
    if (!promoCode.trim()) {
      setError('Enter a promo code');
      setValidationResult(null);
      return;
    }

    try {
      setError('');
      setLoading(true);
      const response = await apiRequest('/v1/passengers/promo-codes/validate', {
        method: 'POST',
        token,
        body: {
          code: promoCode.trim(),
          ride_fare: Math.max(1, Number(rideFare || 1)),
        },
      });
      const normalized = normalizePromo(response?.data || response);

      if (normalized) {
        setValidationResult({ ...normalized, valid: true });
        setAppliedCode(promoCode.trim());
        onDiscountApplied({
          code: promoCode.trim(),
          discount: normalized.discount_percent || normalized.discount_amount || 0,
          discount_type: normalized.discount_type,
          discount_value: normalized.discount_value || normalized.discount_percent || normalized.discount_amount || 0,
          max_discount: normalized.max_discount || null,
        });
      }
    } catch (err) {
      setValidationResult(null);
      setError(err.message || 'Invalid or expired promo code');
    } finally {
      setLoading(false);
    }
  }, [promoCode, rideFare, token, onDiscountApplied]);

  const removePromoCode = useCallback(() => {
    setPromoCode('');
    setValidationResult(null);
    setAppliedCode(null);
    setError('');
    onDiscountApplied({ code: null, discount: 0, discount_type: null, discount_value: 0, max_discount: null });
  }, [onDiscountApplied]);

  const applyCodeFromList = useCallback((code) => {
    setPromoCode(code);
  }, []);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Apply Promo Code</Text>
        <View style={styles.inputRow}>
          <VoiceTextInput
            style={styles.input}
            value={promoCode}
            onChangeText={setPromoCode}
            placeholder="Enter promo code"
            placeholderTextColor={COLORS.textMuted}
            editable={!appliedCode}
          />
          <TouchableOpacity
            style={[styles.button, appliedCode && styles.buttonDisabled]}
            onPress={validatePromoCode}
            disabled={loading || Boolean(appliedCode)}>
            <Text style={styles.buttonText}>{loading ? '...' : 'Check'}</Text>
          </TouchableOpacity>
        </View>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      {validationResult?.valid && (
        <View style={[styles.section, { backgroundColor: '#E8F5E9' }]}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>Code Applied</Text>
            <TouchableOpacity onPress={removePromoCode}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.resultCode}>{appliedCode}</Text>
          <Text style={styles.resultDescription}>{validationResult.description}</Text>
          <View style={styles.benefitsRow}>
            {validationResult.discount_percent ? (
              <Text style={styles.benefitText}>Discount: {validationResult.discount_percent}%</Text>
            ) : (
              <Text style={styles.benefitText}>Save: INR {validationResult.discount_amount}</Text>
            )}
            {validationResult.max_discount && (
              <Text style={styles.benefitText}>Max: INR {validationResult.max_discount}</Text>
            )}
          </View>
          {validationResult.min_ride_amount ? (
            <Text style={styles.minRideText}>Min ride: INR {validationResult.min_ride_amount}</Text>
          ) : null}
        </View>
      )}

      {!appliedCode && promoCodes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Offers</Text>
          {promoCodes.slice(0, 5).map((promo) => (
            <TouchableOpacity
              key={promo.id || promo.code}
              style={styles.promoCard}
              onPress={() => applyCodeFromList(promo.code)}>
              <View style={styles.promoCardContent}>
                <Text style={styles.promoCode}>{promo.code}</Text>
                <Text style={styles.promoDescription}>{promo.description}</Text>
                {promo.discount_percent ? (
                  <Text style={styles.promoDiscount}>{promo.discount_percent}% OFF</Text>
                ) : (
                  <Text style={styles.promoDiscount}>INR {promo.discount_amount} OFF</Text>
                )}
              </View>
              <Text style={styles.promoArrow}>Use</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How to use</Text>
        <Text style={styles.helpText}>Enter a valid promo code above.</Text>
        <Text style={styles.helpText}>Discount is stored for the next booking in this session.</Text>
        <Text style={styles.helpText}>One code can be used per ride.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  section: {
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    ...SHADOWS.soft,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.textMain,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: COLORS.textMuted },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  errorText: { color: '#D32F2F', fontSize: 12, marginTop: 6 },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultTitle: { fontSize: 14, fontWeight: '700', color: '#2E7D32' },
  removeText: { color: '#D32F2F', fontWeight: '600', fontSize: 12 },
  resultCode: { fontSize: 18, fontWeight: '800', color: COLORS.primary, marginBottom: 6 },
  resultDescription: { fontSize: 12, color: COLORS.textMain, marginBottom: 8 },
  benefitsRow: { marginBottom: 6 },
  benefitText: { fontSize: 12, color: '#2E7D32', fontWeight: '600', marginBottom: 4 },
  minRideText: { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' },
  promoCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  promoCardContent: { flex: 1 },
  promoCode: { fontSize: 13, fontWeight: '800', color: '#E65100', marginBottom: 4 },
  promoDescription: { fontSize: 11, color: COLORS.textMain, marginBottom: 4 },
  promoDiscount: { fontSize: 12, fontWeight: '700', color: '#FF9800' },
  promoArrow: { fontSize: 12, color: '#FF9800', fontWeight: '700' },
  helpText: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6, lineHeight: 18 },
});
