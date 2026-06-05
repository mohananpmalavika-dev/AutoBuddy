import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const LOGO_SOURCE = require('../../assets/images/autobuddy-logo.jpg');
const LOGO_ASPECT_RATIO = 2760 / 1504;

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
    width: 320,
    aspectRatio: LOGO_ASPECT_RATIO,
    maxWidth: '92%',
    borderRadius: 18,
  },
  logoCompact: {
    width: 180,
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
