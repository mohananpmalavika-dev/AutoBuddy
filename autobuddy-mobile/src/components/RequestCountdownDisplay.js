import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function RequestCountdownDisplay({
  secondsRemaining,
  isExpired = false,
  formattedTime = '0:00',
  percentage = 0,
  style,
}) {
  // Determine color based on time remaining
  const getColor = useMemo(() => {
    if (isExpired) return '#8B0000'; // Dark red
    if (secondsRemaining <= 10) return '#FF6B35'; // Orange-red (low time)
    if (secondsRemaining <= 30) return '#FFA500'; // Orange (mid time)
    return '#2E7D32'; // Green (plenty of time)
  }, [secondsRemaining, isExpired]);

  const getBackgroundColor = useMemo(() => {
    if (isExpired) return 'rgba(139, 0, 0, 0.1)';
    if (secondsRemaining <= 10) return 'rgba(255, 107, 53, 0.1)';
    if (secondsRemaining <= 30) return 'rgba(255, 165, 0, 0.1)';
    return 'rgba(46, 125, 50, 0.1)';
  }, [secondsRemaining, isExpired]);

  return (
    <View style={[styles.container, style]}>
      {/* Timer Display */}
      <View style={[styles.timerBox, { backgroundColor: getBackgroundColor, borderColor: getColor }]}>
        <Text style={[styles.timerText, { color: getColor }]}>
          {isExpired ? '⏰ Expired' : '⏱️ ' + formattedTime}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.max(percentage, 0)}%`,
              backgroundColor: getColor,
            },
          ]}
        />
      </View>

      {/* Status Text */}
      <Text style={[styles.statusText, { color: getColor }]}>
        {isExpired
          ? '❌ Request Expired'
          : secondsRemaining <= 10
            ? `⚠️ Expire in ${secondsRemaining}s`
            : `${secondsRemaining} seconds remaining`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  timerBox: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  timerText: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  progressContainer: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F0F0F0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
