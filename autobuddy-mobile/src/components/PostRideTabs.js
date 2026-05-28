import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme';

const DEFAULT_TABS = [
  { key: 'rate', label: 'Rate Ride' },
  { key: 'report', label: 'Report Issue' },
  { key: 'lost', label: 'Lost Item' },
  { key: 'receipt', label: 'Receipt' },
];

export default function PostRideTabs({
  activeTab,
  onTabChange,
  tabs = DEFAULT_TABS,
  children,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.tabRow} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, selected && styles.tabButtonActive]}
              onPress={() => onTabChange?.(tab.key)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}>
              <Text style={[styles.tabText, selected && styles.tabTextActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.content}>
        {typeof children === 'function' ? children(activeTab) : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  tabButton: {
    minWidth: 96,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D8DEE8',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  tabButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E8F5E9',
  },
  tabText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  content: {
    paddingTop: 4,
  },
});
