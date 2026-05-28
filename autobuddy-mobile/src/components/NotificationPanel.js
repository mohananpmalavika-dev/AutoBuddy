import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet, Animated, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ICON_LABELS = {
  'directions-car': 'CAR',
  mail: 'MSG',
  'check-circle': 'OK',
  error: '!',
  'local-offer': 'OFFER',
  notifications: 'N',
  close: 'X',
  settings: 'SET',
  list: 'LIST',
  'done-all': 'READ',
  delete: 'DEL',
  'notifications-none': 'N',
};

const PanelIcon = ({ name, size = 24, color = '#fff' }) => (
  <Text
    style={{
      color,
      fontSize: Math.max(10, Math.round(size * 0.42)),
      fontWeight: '700',
      textAlign: 'center',
    }}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
  >
    {ICON_LABELS[name] || 'N'}
  </Text>
);

const DEFAULT_SETTINGS = {
  pushEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  notifyOnRideUpdate: true,
  notifyOnMessage: true,
  notifyOnPayment: true,
  notifyOnPromotion: true,
  silentHours: { enabled: false, start: '22:00', end: '08:00' },
};

const NotificationPanel = ({ socket = null, isConnected = false } = {}) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  const [slideAnim] = useState(() => new Animated.Value(-400));

  const saveSettings = useCallback(async (newSettings) => {
    try {
      await AsyncStorage.setItem('notificationSettings', JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error('Error saving notification settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  }, []);

  const isInSilentHours = useCallback(() => {
    if (!settings.silentHours.enabled) return false;

    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const [startHour, startMin] = settings.silentHours.start.split(':').map(Number);
    const [endHour, endMin] = settings.silentHours.end.split(':').map(Number);
    const startTime = startHour * 100 + startMin;
    const endTime = endHour * 100 + endMin;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime < endTime;
    }
    return currentTime >= startTime || currentTime < endTime;
  }, [settings.silentHours]);

  const triggerNotification = useCallback(async () => {
    if (!settings.pushEnabled) return;

    if (settings.soundEnabled && !isInSilentHours()) {
      // Native sound integration can be added here.
    }

    if (settings.vibrationEnabled && !isInSilentHours()) {
      // Native haptics integration can be added here.
    }
  }, [isInSilentHours, settings.pushEnabled, settings.soundEnabled, settings.vibrationEnabled]);

  // Load settings on mount
  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem('notificationSettings')
      .then((saved) => {
        if (!cancelled && saved) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
        }
      })
      .catch((error) => {
        console.error('Error loading notification settings:', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // WebSocket listeners
  useEffect(() => {
    if (!socket) return;

    const handleNotification = (data) => {
      const notification = {
        id: Date.now().toString(),
        type: data.type || 'info',
        title: data.title || 'Notification',
        message: data.message || '',
        timestamp: new Date(),
        read: false,
        action: data.action || null,
        data: data
      };

      // Check silent hours
      if (!isInSilentHours()) {
        triggerNotification(notification);
      }

      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    const handleRideUpdate = (data) => {
      if (!settings.notifyOnRideUpdate) return;
      
      const notification = {
        id: Date.now().toString(),
        type: 'ride',
        title: 'Ride Update',
        message: data.message || `Ride ${data.rideId} updated to ${data.status}`,
        timestamp: new Date(),
        read: false,
        action: { type: 'view_ride', rideId: data.rideId },
        data
      };

      triggerNotification(notification);
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    const handleMessage = (data) => {
      if (!settings.notifyOnMessage) return;
      
      const notification = {
        id: Date.now().toString(),
        type: 'message',
        title: `Message from ${data.senderName}`,
        message: data.text,
        timestamp: new Date(),
        read: false,
        action: { type: 'view_messages' },
        data
      };

      triggerNotification(notification);
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    const handlePayment = (data) => {
      if (!settings.notifyOnPayment) return;
      
      const notification = {
        id: Date.now().toString(),
        type: data.status === 'success' ? 'success' : 'error',
        title: data.status === 'success' ? 'Payment Successful' : 'Payment Failed',
        message: data.message || `Rs. ${data.amount} ${data.status}`,
        timestamp: new Date(),
        read: false,
        action: { type: 'view_wallet' },
        data
      };

      triggerNotification(notification);
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    const handlePromotion = (data) => {
      if (!settings.notifyOnPromotion) return;
      
      const notification = {
        id: Date.now().toString(),
        type: 'promotion',
        title: data.title || 'Special Offer',
        message: data.description || data.code,
        timestamp: new Date(),
        read: false,
        action: { type: 'view_promo', promoId: data.promoId },
        data
      };

      triggerNotification(notification);
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    socket.on('notification', handleNotification);
    socket.on('ride:update', handleRideUpdate);
    socket.on('message:received', handleMessage);
    socket.on('payment:update', handlePayment);
    socket.on('promotion:available', handlePromotion);

    return () => {
      socket.off('notification', handleNotification);
      socket.off('ride:update', handleRideUpdate);
      socket.off('message:received', handleMessage);
      socket.off('payment:update', handlePayment);
      socket.off('promotion:available', handlePromotion);
    };
  }, [isInSilentHours, settings, socket, triggerNotification]);

  const togglePanel = () => {
    setIsVisible(!isVisible);
    Animated.timing(slideAnim, {
      toValue: isVisible ? -400 : 0,
      duration: 300,
      useNativeDriver: true
    }).start();
  };

  const markAsRead = (id) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
    setUnreadCount(0);
  };

  const deleteNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const deleteAllNotifications = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to delete all notifications?',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: () => {
            setNotifications([]);
            setUnreadCount(0);
          }
        }
      ]
    );
  };

  const handleNotificationAction = (action) => {
    if (!action) return;

    switch (action.type) {
      case 'view_ride':
        // Navigate to ride details
        console.log('Navigating to ride:', action.rideId);
        break;
      case 'view_messages':
        // Navigate to messages
        console.log('Navigating to messages');
        break;
      case 'view_wallet':
        // Navigate to wallet
        console.log('Navigating to wallet');
        break;
      case 'view_promo':
        // Navigate to promotion
        console.log('Navigating to promo:', action.promoId);
        break;
      default:
        console.log('Unknown action:', action.type);
    }
  };

  const getNotificationIcon = (type) => {
    const iconProps = { size: 24, color: '#fff' };
    switch (type) {
      case 'ride':
        return <PanelIcon name="directions-car" {...iconProps} />;
      case 'message':
        return <PanelIcon name="mail" {...iconProps} />;
      case 'success':
        return <PanelIcon name="check-circle" {...iconProps} />;
      case 'error':
        return <PanelIcon name="error" {...iconProps} />;
      case 'promotion':
        return <PanelIcon name="local-offer" {...iconProps} />;
      default:
        return <PanelIcon name="notifications" {...iconProps} />;
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'ride':
        return '#2196F3';
      case 'message':
        return '#4CAF50';
      case 'success':
        return '#4CAF50';
      case 'error':
        return '#F44336';
      case 'promotion':
        return '#FF9800';
      default:
        return '#2196F3';
    }
  };

  const renderNotification = (notification) => (
    <TouchableOpacity
      key={notification.id}
      style={[
        styles.notificationItem,
        !notification.read && styles.notificationItemUnread
      ]}
      onPress={() => {
        markAsRead(notification.id);
        handleNotificationAction(notification.action);
      }}
    >
      <View
        style={[
          styles.notificationIconContainer,
          { backgroundColor: getNotificationColor(notification.type) }
        ]}
      >
        {getNotificationIcon(notification.type)}
      </View>
      
      <View style={styles.notificationContent}>
        <Text style={styles.notificationTitle}>{notification.title}</Text>
        <Text style={styles.notificationMessage}>{notification.message}</Text>
        <Text style={styles.notificationTime}>
          {new Date(notification.timestamp).toLocaleTimeString()}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => deleteNotification(notification.id)}
        style={styles.deleteButton}
      >
        <PanelIcon name="close" size={20} color="#999" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderSettings = () => (
    <ScrollView style={styles.settingsContainer}>
      <Text style={styles.settingsTitle}>Notification Settings</Text>

      <SettingToggle
        label="Enable Notifications"
        value={settings.pushEnabled}
        onChange={(val) => saveSettings({ ...settings, pushEnabled: val })}
      />

      <SettingToggle
        label="Sound"
        value={settings.soundEnabled}
        onChange={(val) => saveSettings({ ...settings, soundEnabled: val })}
      />

      <SettingToggle
        label="Vibration"
        value={settings.vibrationEnabled}
        onChange={(val) => saveSettings({ ...settings, vibrationEnabled: val })}
      />

      <Text style={styles.categoryLabel}>Notification Types</Text>

      <SettingToggle
        label="Ride Updates"
        value={settings.notifyOnRideUpdate}
        onChange={(val) => saveSettings({ ...settings, notifyOnRideUpdate: val })}
      />

      <SettingToggle
        label="Messages"
        value={settings.notifyOnMessage}
        onChange={(val) => saveSettings({ ...settings, notifyOnMessage: val })}
      />

      <SettingToggle
        label="Payments"
        value={settings.notifyOnPayment}
        onChange={(val) => saveSettings({ ...settings, notifyOnPayment: val })}
      />

      <SettingToggle
        label="Promotions"
        value={settings.notifyOnPromotion}
        onChange={(val) => saveSettings({ ...settings, notifyOnPromotion: val })}
      />

      <Text style={styles.categoryLabel}>Silent Hours</Text>

      <SettingToggle
        label="Enable Silent Hours"
        value={settings.silentHours.enabled}
        onChange={(val) => saveSettings({
          ...settings,
          silentHours: { ...settings.silentHours, enabled: val }
        })}
      />

      {settings.silentHours.enabled && (
        <View style={styles.silentHoursInput}>
          <Text style={styles.timeLabel}>From: {settings.silentHours.start}</Text>
          <Text style={styles.timeLabel}>To: {settings.silentHours.end}</Text>
        </View>
      )}
    </ScrollView>
  );

  return (
    <>
      {/* Toggle Button */}
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={togglePanel}
      >
        <PanelIcon name="notifications" size={28} color="#fff" />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Notification Panel */}
      <Animated.View
        style={[
          styles.panelContainer,
          { transform: [{ translateX: slideAnim }] }
        ]}
      >
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>
            {showSettings ? 'Settings' : 'Notifications'}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setShowSettings(!showSettings)}
              style={styles.headerButton}
            >
              <PanelIcon
                name={showSettings ? 'list' : 'settings'}
                size={24}
                color="#2196F3"
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={togglePanel}
              style={styles.headerButton}
            >
              <PanelIcon name="close" size={24} color="#2196F3" />
            </TouchableOpacity>
          </View>
        </View>

        {!showSettings && (
          <View style={styles.notificationActions}>
            {notifications.length > 0 && (
              <>
                <TouchableOpacity
                  onPress={markAllAsRead}
                  style={styles.actionButton}
                >
                  <PanelIcon name="done-all" size={20} color="#2196F3" />
                  <Text style={styles.actionText}>Mark All Read</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={deleteAllNotifications}
                  style={styles.actionButton}
                >
                  <PanelIcon name="delete" size={20} color="#F44336" />
                  <Text style={[styles.actionText, { color: '#F44336' }]}>
                    Clear All
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {showSettings ? (
          renderSettings()
        ) : (
          <ScrollView style={styles.notificationsList}>
            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <PanelIcon name="notifications-none" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No notifications yet</Text>
              </View>
            ) : (
              notifications.map(renderNotification)
            )}
          </ScrollView>
        )}

        {/* Connection Status */}
        <View style={styles.connectionStatus}>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }
            ]}
          />
          <Text style={styles.statusText}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </Animated.View>
    </>
  );
};

const SettingToggle = ({ label, value, onChange }) => (
  <View style={styles.settingItem}>
    <Text style={styles.settingLabel}>{label}</Text>
    <TouchableOpacity
      style={[styles.toggle, value && styles.toggleActive]}
      onPress={() => onChange(!value)}
    >
      <View style={[styles.toggleKnob, value && styles.toggleKnobActive]} />
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  toggleButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    zIndex: 100
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#F44336',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center'
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  panelContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 400,
    backgroundColor: '#fff',
    elevation: 10,
    zIndex: 99
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000'
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8
  },
  headerButton: {
    padding: 8
  },
  notificationActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 4
  },
  actionText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '500'
  },
  notificationsList: {
    flex: 1
  },
  notificationItem: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    alignItems: 'flex-start'
  },
  notificationItemUnread: {
    backgroundColor: '#f9f9f9'
  },
  notificationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  notificationContent: {
    flex: 1
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4
  },
  notificationMessage: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4
  },
  notificationTime: {
    fontSize: 11,
    color: '#999'
  },
  deleteButton: {
    padding: 4
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999'
  },
  settingsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  settingLabel: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500'
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  toggleActive: {
    backgroundColor: '#2196F3'
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignSelf: 'flex-start'
  },
  toggleKnobActive: {
    alignSelf: 'flex-end'
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4
  },
  silentHoursInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
    padding: 12,
    marginVertical: 8
  },
  timeLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 8
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  statusText: {
    fontSize: 12,
    color: '#999'
  }
});

export default NotificationPanel;
