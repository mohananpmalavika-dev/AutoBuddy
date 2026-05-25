import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '@/theme';

interface WebSetupCardProps {
  notificationPermission: 'default' | 'denied' | 'granted';
  message: string;
  onEnableAlerts: () => void;
  onInstallShortcut: () => void;
  onContinue: () => void;
}

export function WebSetupCard({
  notificationPermission,
  message,
  onEnableAlerts,
  onInstallShortcut,
  onContinue,
}: WebSetupCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Keep AutoBuddy live on this device</Text>
      <Text style={styles.hint}>Enable notifications and install shortcut for quick access and pop-up alerts.</Text>
      <TouchableOpacity style={styles.planButton} onPress={onEnableAlerts}>
        <Text style={styles.planText}>
          {notificationPermission === 'granted' ? 'Notifications Enabled' : 'Enable Notifications'}
        </Text>
        <Text style={styles.planSub}>Ride requests and chat alerts will pop up.</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.planButton} onPress={onInstallShortcut}>
        <Text style={styles.planText}>Install Shortcut</Text>
        <Text style={styles.planSub}>Adds AutoBuddy to desktop/home screen where supported.</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.planButton} onPress={onContinue}>
        <Text style={styles.planText}>Continue To Dashboard</Text>
        <Text style={styles.planSub}>You can enable this later from browser settings.</Text>
      </TouchableOpacity>
      {!!message && <Text style={styles.hint}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    width: '100%',
    maxWidth: 460,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  title: {
    color: COLORS.textMain,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  hint: {
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  planButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
    marginBottom: 8,
  },
  planText: {
    color: COLORS.textMain,
    fontWeight: '700',
  },
  planSub: {
    color: COLORS.textMuted,
    marginTop: 2,
    fontSize: 12,
  },
});
