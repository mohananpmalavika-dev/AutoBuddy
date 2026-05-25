import React from 'react';
import { StyleSheet, View } from 'react-native';

import { COLORS, RADIUS, SHADOWS } from '../theme';

export default function PremiumCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.lift,
  },
});
