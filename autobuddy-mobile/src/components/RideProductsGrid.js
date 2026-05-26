import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COLORS, SHADOWS } from '../theme';

const PRODUCTS = [
  { key: 'normal', icon: '🛺', title: 'Normal', ml: 'സാധാരണ', sub: 'Standard auto ride' },
  { key: 'pool', icon: '👥', title: 'Pool Ride', ml: 'ഷെയർ യാത്ര', sub: 'Lower fare by sharing' },
  { key: 'scheduled', icon: '⏰', title: 'Scheduled', ml: 'മുൻകൂട്ടി ബുക്ക്', sub: 'Ride for later' },
  { key: 'corporate', icon: '🏢', title: 'Corporate', ml: 'കോർപ്പറേറ്റ്', sub: 'Office travel' },
  { key: 'airport', icon: '✈️', title: 'Airport', ml: 'എയർപോർട്ട്', sub: 'Terminal pickup/drop' },
  { key: 'intercity', icon: '🛣️', title: 'Intercity', ml: 'സിറ്റി പുറത്ത്', sub: 'Long distance rides' },
  { key: 'ev_auto', icon: '🔋', title: 'EV Auto', ml: 'ഇവി ഓട്ടോ', sub: 'Eco-friendly option' },
  { key: 'tourism', icon: '🌴', title: 'Tourism', ml: 'ടൂറിസം', sub: 'Sightseeing packages' },
  { key: 'women_only', icon: '🛡️', title: 'Women Only', ml: 'സ്ത്രീകൾക്ക്', sub: 'Safety-first rides' },
  { key: 'rental_hourly', icon: '🕒', title: 'Rental', ml: 'Hourly', sub: 'Hourly package rides' },
  { key: 'school_elderly_safe', icon: '🛡️', title: 'School/Elderly', ml: 'Safe Ride', sub: 'Care-first safe rides' },
];

export default function RideProductsGrid({ selected = 'normal', onSelect, enabledKeys = null, hideInactive = false }) {
  const enabledSet = new Set(
    Array.isArray(enabledKeys) && enabledKeys.length > 0 ? enabledKeys : PRODUCTS.map((item) => item.key),
  );
  const visibleProducts = hideInactive
    ? PRODUCTS.filter((item) => enabledSet.has(item.key))
    : PRODUCTS;
  const safeProducts = visibleProducts.length > 0
    ? visibleProducts
    : PRODUCTS.filter((item) => item.key === 'normal');
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Choose Ride Product</Text>
      <Text style={styles.mlHeading}>യാത്രാ വിഭാഗം തിരഞ്ഞെടുക്കുക</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {safeProducts.map((item) => {
          const active = selected === item.key;
          const enabled = enabledSet.has(item.key);
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                if (!enabled) {
                  return;
                }
                onSelect?.(item.key);
              }}
              style={[styles.card, active && styles.activeCard, !enabled && styles.disabledCard]}>
              <Text style={styles.icon}>{item.icon}</Text>
              <Text style={[styles.title, active && styles.activeText, !enabled && styles.disabledText]}>{item.title}</Text>
              <Text style={styles.ml}>{item.ml}</Text>
              <Text style={[styles.sub, !enabled && styles.disabledText]}>
                {enabled ? item.sub : 'Not active in this district'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
  },
  heading: {
    color: COLORS.textMain,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 2,
  },
  mlHeading: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  card: {
    width: 138,
    minHeight: 136,
    marginRight: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    backgroundColor: '#FFFFFF',
    ...SHADOWS.soft,
  },
  activeCard: {
    borderColor: COLORS.primary,
    backgroundColor: '#EAF5ED',
  },
  icon: {
    fontSize: 24,
    marginBottom: 6,
  },
  title: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '900',
  },
  activeText: {
    color: COLORS.primaryDark,
  },
  disabledCard: {
    opacity: 0.45,
  },
  disabledText: {
    color: '#8A968F',
  },
  ml: {
    marginTop: 3,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  sub: {
    marginTop: 6,
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
});
