import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const LOGO_SOURCE = require('../../assets/images/autobuddy-logo.jpg');
const LOGO_ASPECT_RATIO = 2760 / 1504;
const LOGO_WIDTH = 320;
const LOGO_HEIGHT = Math.round(LOGO_WIDTH / LOGO_ASPECT_RATIO);
const LOGO_COMPACT_WIDTH = 150;
const LOGO_COMPACT_HEIGHT = Math.round(LOGO_COMPACT_WIDTH / LOGO_ASPECT_RATIO);

export default function AutoBuddyBrand({ subtitle, compact = false }) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Image source={LOGO_SOURCE} style={[styles.logo, compact && styles.logoCompact]} resizeMode="contain" />
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 16,
  },
  containerCompact: {
    marginBottom: 10,
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
    aspectRatio: LOGO_ASPECT_RATIO,
    maxWidth: '92%',
    borderRadius: 18,
  },
  logoCompact: {
    width: LOGO_COMPACT_WIDTH,
    height: LOGO_COMPACT_HEIGHT,
    aspectRatio: LOGO_ASPECT_RATIO,
    borderRadius: 12,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#4F4F4F',
    fontWeight: '600',
    textAlign: 'center',
  },
});
