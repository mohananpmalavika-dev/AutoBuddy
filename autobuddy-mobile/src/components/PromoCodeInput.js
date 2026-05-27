import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { usePromoCodes } from '../contexts/PromoCodesContext';

/**
 * PromoCodeInput - Apply promotional codes
 */
export default function PromoCodeInput({ onApply }) {
  const { applyPromoCode, validatePromoCode } = usePromoCodes();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApplyCode = async () => {
    if (!code.trim()) {
      Alert.alert('Error', 'Please enter a promo code');
      return;
    }

    setLoading(true);
    try {
      if (!validatePromoCode(code)) {
        Alert.alert('Invalid Code', 'This promo code is not valid');
        return;
      }

      // Simulate API call
      const amount = Math.floor(Math.random() * 100) + 10; // Random discount
      applyPromoCode(code, amount);
      
      Alert.alert('Success', `Discount of ₹${amount} applied!`);
      setCode('');
      
      if (onApply) {
        onApply(code, amount);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Apply Promo Code</Text>
      <View style={styles.inputGroup}>
        <TextInput
          style={styles.input}
          placeholder="Enter promo code"
          value={code}
          onChangeText={setCode}
          placeholderTextColor="#999"
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.applyButton, loading && styles.applyButtonDisabled]}
          onPress={handleApplyCode}
          disabled={loading}
        >
          <Text style={styles.applyButtonText}>{loading ? 'Applying...' : 'Apply'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: '#FFF',
    borderRadius: 8,
    ...SHADOWS.small,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  inputGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  applyButton: {
    paddingHorizontal: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    justifyContent: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    color: 'white',
    fontWeight: '700',
  },
});
