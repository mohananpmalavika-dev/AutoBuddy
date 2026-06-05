import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getDisplayText } from '../lib/displayText';
import { COLORS, SHADOWS } from '../theme';

const PRODUCTS = [
  { key: 'normal', icon: '🛺', title: 'Normal', sub: 'Standard auto ride' },
  { key: 'pool', icon: '👥', title: 'Pool Ride', sub: 'Lower fare by sharing' },
  { key: 'scheduled', icon: '⏰', title: 'Scheduled', sub: 'Ride for later' },
  { key: 'corporate', icon: '🏢', title: 'Corporate', sub: 'Office travel' },
  { key: 'airport', icon: '✈️', title: 'Airport', sub: 'Terminal pickup/drop' },
  { key: 'intercity', icon: '🛣️', title: 'Intercity', sub: 'Long distance rides' },
  { key: 'ev_auto', icon: '🔋', title: 'EV Auto', sub: 'Eco-friendly option' },
  { key: 'tourism', icon: '🌴', title: 'Tourism', sub: 'Sightseeing packages' },
  { key: 'women_only', icon: '🛡️', title: 'Women Only', sub: 'Safety-first rides' },
  { key: 'rental_hourly', icon: '🕒', title: 'Rental', sub: 'Hourly package rides' },
  { key: 'school_elderly_safe', icon: '🛡️', title: 'School/Elderly', sub: 'Care-first safe rides' },
];

export default function RideProductsGrid({
  selected = 'normal',
  onSelect,
  enabledKeys = null,
  hideInactive = false,
  heading = 'Choose Ride Product',
  subheading = '',
  labels = {},
}) {
  const enabledSet = new Set(
    Array.isArray(enabledKeys) && enabledKeys.length > 0 ? enabledKeys : PRODUCTS.map((item) => item.key),
  );
  const visibleProducts = hideInactive ? PRODUCTS.filter((item) => enabledSet.has(item.key)) : PRODUCTS;
  const safeProducts = visibleProducts.length > 0 ? visibleProducts : PRODUCTS.filter((item) => item.key === 'normal');

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{heading}</Text>
      {!!subheading && <Text style={styles.subheading}>{subheading}</Text>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {safeProducts.map((item) => {
          const active = selected === item.key;
          const enabled = enabledSet.has(item.key);
          const localized = labels[item.key] || {};
          const title = getDisplayText(localized.title || localized, item.title);
          const description = getDisplayText(localized.description, item.sub);

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
              <Text style={[styles.title, active && styles.activeText, !enabled && styles.disabledText]}>{title}</Text>
              <Text style={[styles.sub, !enabled && styles.disabledText]}>
                {enabled ? description : 'Not active in this district'}
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
  subheading: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  card: {
    width: 138,
    minHeight: 132,
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
  sub: {
    marginTop: 6,
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
});
