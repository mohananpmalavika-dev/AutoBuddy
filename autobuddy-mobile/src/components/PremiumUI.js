import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';

export function GlassCard({ children, style }) {
  return <View style={[styles.glassCard, style]}>{children}</View>;
}

export function FadeSlideView({ children, delay = 0, style }) {
  const opacity = useMemo(() => new Animated.Value(0), []);
  const translateY = useMemo(() => new Animated.Value(18), []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

export function LiveEtaPulse({ eta = '6 min' }) {
  const scale = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 650, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    ).start();
  }, [scale]);

  return (
    <Animated.View style={[styles.etaBox, { transform: [{ scale }] }]}>
      <Text style={styles.etaLabel}>Live ETA</Text>
      <Text style={styles.etaValue}>{eta}</Text>
    </Animated.View>
  );
}

export function RideProgressTimeline({ status = 'searching' }) {
  const steps = useMemo(
    () => [
      { key: 'searching', label: 'Finding Driver', ml: 'ഡ്രൈവർ അന്വേഷിക്കുന്നു' },
      { key: 'accepted', label: 'Driver Accepted', ml: 'ഡ്രൈവർ സ്വീകരിച്ചു' },
      { key: 'driver_arrived', label: 'Driver Arriving', ml: 'ഡ്രൈവർ എത്തുന്നു' },
      { key: 'in_progress', label: 'Ride Started', ml: 'യാത്ര തുടങ്ങി' },
      { key: 'completed', label: 'Completed', ml: 'പൂർത്തിയായി' },
    ],
    [],
  );

  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === String(status || '').toLowerCase()),
  );

  return (
    <GlassCard style={{ marginTop: 12 }}>
      <Text style={styles.sectionTitle}>Ride Progress</Text>
      {steps.map((step, index) => {
        const active = index <= activeIndex;
        return (
          <View key={step.key} style={styles.stepRow}>
            <View style={[styles.stepDot, active && styles.stepDotActive]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepText, active && styles.stepTextActive]}>{step.label}</Text>
              <Text style={styles.stepMalayalam}>{step.ml}</Text>
            </View>
          </View>
        );
      })}
    </GlassCard>
  );
}

export function PremiumEmptyState({
  title = 'No rides found',
  subtitle = 'Your ride updates will appear here.',
  malayalam = 'യാത്ര വിവരങ്ങൾ ഇവിടെ കാണിക്കും.',
}) {
  return (
    <GlassCard style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>✨</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      <Text style={styles.emptyMalayalam}>{malayalam}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    padding: 14,
    ...SHADOWS.soft,
  },
  etaBox: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.overlaySoft,
    borderColor: COLORS.overlayStrong,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  etaLabel: {
    color: COLORS.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  etaValue: {
    color: COLORS.primaryDark,
    fontSize: 21,
    fontWeight: '900',
  },
  sectionTitle: {
    ...TYPOGRAPHY.subtitle,
    color: COLORS.textMain,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#CFD8D3',
    marginRight: 12,
  },
  stepDotActive: {
    backgroundColor: COLORS.primary,
  },
  stepText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  stepTextActive: {
    color: COLORS.textMain,
    fontWeight: '900',
  },
  stepMalayalam: {
    marginTop: 1,
    ...TYPOGRAPHY.malayalam,
    fontSize: 12,
  },
  emptyWrap: {
    alignItems: 'center',
    marginVertical: 12,
    paddingVertical: 22,
  },
  emptyIcon: { fontSize: 28, marginBottom: 6 },
  emptyTitle: {
    ...TYPOGRAPHY.title,
    fontSize: 19,
  },
  emptySubtitle: {
    marginTop: 4,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  emptyMalayalam: {
    marginTop: 4,
    ...TYPOGRAPHY.malayalam,
    textAlign: 'center',
  },
});
