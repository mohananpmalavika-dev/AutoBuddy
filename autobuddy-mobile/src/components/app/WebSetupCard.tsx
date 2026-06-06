import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '@/theme';

interface WebSetupCardProps {
  notificationPermission: 'default' | 'denied' | 'granted';
  message: string;
  compact?: boolean;
  onEnableAlerts: () => void;
  onInstallShortcut: () => void;
  onContinue: () => void;
}

export function WebSetupCard({
  notificationPermission,
  message,
  compact = false,
  onEnableAlerts,
  onInstallShortcut,
  onContinue,
}: WebSetupCardProps) {
  const alertsReady = notificationPermission === 'granted';
  const alertsBlocked = notificationPermission === 'denied';
  const alertTitle = alertsReady ? 'Alerts On' : alertsBlocked ? 'Alerts Blocked' : 'Enable Alerts';
  const alertSub = alertsReady ? 'Ride pop-ups active' : alertsBlocked ? 'Check browser settings' : 'Ride pop-ups';

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.headerRow}>
        <View style={[styles.headerIcon, alertsReady && styles.headerIconReady]}>
          <MaterialIcons name={alertsReady ? 'notifications-active' : 'dashboard'} size={compact ? 18 : 20} color={COLORS.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>
            Dashboard is ready
          </Text>
          <Text style={[styles.hint, compact && styles.hintCompact]} numberOfLines={2}>
            Turn on web alerts, install the app, or continue now.
          </Text>
        </View>
      </View>

      <View style={styles.quickGrid}>
        <TouchableOpacity
          activeOpacity={0.86}
          style={[styles.setupTile, compact && styles.setupTileCompact, alertsReady && styles.setupTileActive]}
          onPress={onEnableAlerts}>
          <MaterialIcons
            name={alertsReady ? 'check-circle' : alertsBlocked ? 'notifications-off' : 'notifications-active'}
            size={compact ? 21 : 23}
            color={alertsReady ? COLORS.success : COLORS.primary}
          />
          <Text style={[styles.tileTitle, compact && styles.tileTitleCompact]} numberOfLines={1}>
            {alertTitle}
          </Text>
          <Text style={[styles.tileSub, compact && styles.tileSubCompact]} numberOfLines={1}>
            {alertSub}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.86}
          style={[styles.setupTile, compact && styles.setupTileCompact]}
          onPress={onInstallShortcut}>
          <MaterialIcons name="install-mobile" size={compact ? 21 : 23} color={COLORS.primary} />
          <Text style={[styles.tileTitle, compact && styles.tileTitleCompact]} numberOfLines={1}>
            Install App
          </Text>
          <Text style={[styles.tileSub, compact && styles.tileSubCompact]} numberOfLines={1}>
            Home shortcut
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity activeOpacity={0.9} style={[styles.dashboardButton, compact && styles.dashboardButtonCompact]} onPress={onContinue}>
        <MaterialIcons name="dashboard" size={compact ? 18 : 20} color="#FFFFFF" />
        <Text style={[styles.dashboardButtonText, compact && styles.dashboardButtonTextCompact]}>Go to Dashboard</Text>
      </TouchableOpacity>

      {!!message && (
        <Text style={[styles.statusText, compact && styles.statusTextCompact]} numberOfLines={2}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  cardCompact: {
    maxWidth: 360,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 122, 59, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(11, 122, 59, 0.18)',
  },
  headerIconReady: {
    backgroundColor: 'rgba(27, 138, 75, 0.12)',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: COLORS.textMain,
    fontSize: 18,
    fontWeight: '800',
  },
  titleCompact: {
    fontSize: 16,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  hintCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  setupTile: {
    flex: 1,
    minHeight: 84,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    padding: 10,
    justifyContent: 'space-between',
  },
  setupTileCompact: {
    minHeight: 72,
    padding: 9,
    borderRadius: 10,
  },
  setupTileActive: {
    borderColor: 'rgba(27, 138, 75, 0.35)',
    backgroundColor: 'rgba(27, 138, 75, 0.08)',
  },
  tileTitle: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '800',
  },
  tileTitleCompact: {
    fontSize: 13,
  },
  tileSub: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  tileSubCompact: {
    fontSize: 11,
  },
  dashboardButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  dashboardButtonCompact: {
    minHeight: 46,
    borderRadius: 10,
  },
  dashboardButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  dashboardButtonTextCompact: {
    fontSize: 14,
  },
  statusText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  statusTextCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
});
