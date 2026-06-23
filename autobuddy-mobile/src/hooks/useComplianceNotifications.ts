import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export interface ComplianceNotification {
  id: string;
  type: 'rule_violation' | 'guideline_reminder' | 'policy_update' | 'expiry_warning';
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  delivered: boolean;
  deliveredAt?: string;
  expiresAt?: string;
}

export const useComplianceNotifications = (token: string | null, userId: string) => {
  const [notifications, setNotifications] = useState<ComplianceNotification[]>([]);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);
  const notificationQueue = useRef<ComplianceNotification[]>([]);

  // Initialize compliance notification templates
  const complianceNotificationTemplates = {
    rule_violation: [
      {
        title: 'Safety Rule Violation',
        messageTemplate: 'Your recent activity may have violated: {{ruleName}}',
        severity: 'critical' as const,
      },
      {
        title: 'Compliance Alert',
        messageTemplate: 'Please review the {{ruleName}} compliance requirement',
        severity: 'warning' as const,
      },
    ],
    guideline_reminder: [
      {
        title: 'Safety Reminder',
        messageTemplate: 'Remember: {{guidelineName}} - Stay safe!',
        severity: 'info' as const,
      },
      {
        title: 'Quick Safety Tip',
        messageTemplate: '{{guidelineName}}: {{tip}}',
        severity: 'info' as const,
      },
    ],
    policy_update: [
      {
        title: 'Policy Updated',
        messageTemplate: '{{policyName}} policy has been updated. Please review.',
        severity: 'warning' as const,
      },
      {
        title: 'New Safety Guidelines',
        messageTemplate: 'New {{policyName}} guidelines are now in effect.',
        severity: 'info' as const,
      },
    ],
    expiry_warning: [
      {
        title: 'Document Expiring Soon',
        messageTemplate: 'Your {{documentName}} expires in {{daysRemaining}} days',
        severity: 'warning' as const,
      },
      {
        title: 'Compliance Deadline',
        messageTemplate: '{{documentName}} compliance deadline: {{daysRemaining}} days',
        severity: 'critical' as const,
      },
    ],
  };

  // Trigger rule violation notification
  const triggerRuleViolationAlert = useCallback(
    (ruleName: string, description: string) => {
      const notification: ComplianceNotification = {
        id: `rule-${Date.now()}`,
        type: 'rule_violation',
        title: 'Safety Rule Violation',
        message: `You may have violated: ${ruleName}. ${description}`,
        severity: 'critical',
        delivered: false,
      };
      notificationQueue.current.push(notification);
      deliverNotification(notification);
    },
    []
  );

  // Trigger guideline reminder
  const triggerGuidelineReminder = useCallback(
    (guidelineName: string, tip: string) => {
      const notification: ComplianceNotification = {
        id: `guideline-${Date.now()}`,
        type: 'guideline_reminder',
        title: 'Safety Reminder',
        message: `${guidelineName}: ${tip}`,
        severity: 'info',
        delivered: false,
      };
      notificationQueue.current.push(notification);
      deliverNotification(notification);
    },
    []
  );

  // Trigger policy update notification
  const triggerPolicyUpdate = useCallback((policyName: string) => {
    const notification: ComplianceNotification = {
      id: `policy-${Date.now()}`,
      type: 'policy_update',
      title: 'Policy Updated',
      message: `${policyName} policy has been updated. Please review the compliance section.`,
      severity: 'warning',
      delivered: false,
    };
    notificationQueue.current.push(notification);
    deliverNotification(notification);
  }, []);

  // Trigger expiry warning
  const triggerExpiryWarning = useCallback(
    (documentName: string, daysRemaining: number) => {
      const severity: 'critical' | 'warning' = daysRemaining <= 7 ? 'critical' : 'warning';
      const notification: ComplianceNotification = {
        id: `expiry-${Date.now()}`,
        type: 'expiry_warning',
        title: 'Document Expiring Soon',
        message: `Your ${documentName} expires in ${daysRemaining} days. Take action now.`,
        severity,
        delivered: false,
        expiresAt: new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000).toISOString(),
      };
      notificationQueue.current.push(notification);
      deliverNotification(notification);
    },
    []
  );

  // Core delivery function
  const deliverNotification = useCallback(async (notification: ComplianceNotification) => {
    try {
      // Mark as delivered
      const deliveredNotification = {
        ...notification,
        delivered: true,
        deliveredAt: new Date().toISOString(),
      };

      // Add to state
      setNotifications(prev => [deliveredNotification, ...prev]);
      setDeliveredCount(prev => prev + 1);

      // In production, send to push notification service here
      // Example: await sendPushNotification(token, notification)

      // Log delivery for monitoring
      console.log('[Compliance Alert]', {
        type: notification.type,
        severity: notification.severity,
        title: notification.title,
        timestamp: deliveredNotification.deliveredAt,
      });
    } catch (error) {
      console.error('Failed to deliver compliance notification:', error);
    }
  }, []);

  // Batch trigger notifications (useful for policy updates)
  const triggerBatchNotifications = useCallback(
    (notifications: ComplianceNotification[]) => {
      notifications.forEach(notification => {
        notificationQueue.current.push(notification);
        deliverNotification(notification);
      });
    },
    [deliverNotification]
  );

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
    notificationQueue.current = [];
  }, []);

  // Clear specific notification
  const clearNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  // Get undelivered notifications
  const getUndeliveredNotifications = useCallback(() => {
    return notificationQueue.current;
  }, []);

  // Get notifications by type
  const getNotificationsByType = useCallback(
    (type: ComplianceNotification['type']) => {
      return notifications.filter(n => n.type === type);
    },
    [notifications]
  );

  // Get notifications by severity
  const getNotificationsBySeverity = useCallback(
    (severity: 'critical' | 'warning' | 'info') => {
      return notifications.filter(n => n.severity === severity);
    },
    [notifications]
  );

  // Get critical notifications
  const getCriticalNotifications = useCallback(() => {
    return notifications.filter(n => n.severity === 'critical');
  }, [notifications]);

  // Schedule recurring compliance reminders
  const scheduleRecurringReminders = useCallback((intervalMs: number = 86400000) => {
    // Default: once per day
    const reminders = [
      {
        interval: intervalMs,
        notification: (): ComplianceNotification => ({
          id: `reminder-daily-${Date.now()}`,
          type: 'guideline_reminder',
          title: 'Daily Safety Check',
          message: 'Take a moment to review our safety guidelines for today\'s rides.',
          severity: 'info',
          delivered: false,
        }),
      },
      {
        interval: intervalMs * 7, // Weekly
        notification: (): ComplianceNotification => ({
          id: `reminder-weekly-${Date.now()}`,
          type: 'guideline_reminder',
          title: 'Weekly Safety Review',
          message: 'Review your compliance score and any pending alerts.',
          severity: 'info',
          delivered: false,
        }),
      },
    ];

    const timers: NodeJS.Timeout[] = [];

    reminders.forEach(({ interval, notification }) => {
      const timer = setInterval(() => {
        const notif = notification();
        deliverNotification(notif);
      }, interval);
      timers.push(timer);
    });

    // Return cleanup function
    return () => {
      timers.forEach(timer => clearInterval(timer));
    };
  }, [deliverNotification]);

  // Handle app state changes (trigger reminders when app becomes active)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // App has come to foreground
      // Trigger a check for pending compliance alerts
      checkPendingAlerts();
    }
    appState.current = nextAppState;
    setAppStateVisible(appState.current);
  };

  const checkPendingAlerts = useCallback(async () => {
    try {
      // In a real implementation, fetch pending alerts from backend
      // For now, just log that we checked
      console.log('[Compliance] Checking for pending alerts...');
    } catch (error) {
      console.error('Failed to check pending alerts:', error);
    }
  }, []);

  // Simulate initial compliance alerts on mount
  useEffect(() => {
    if (!token || !userId) {return;}

    // Simulate some initial alerts based on user type
    const initializeAlerts = () => {
      // Policy update alert
      setTimeout(() => {
        triggerPolicyUpdate('Safety Guidelines');
      }, 500);

      // Guideline reminder
      setTimeout(() => {
        triggerGuidelineReminder(
          'Before You Ride',
          'Always verify driver details before boarding'
        );
      }, 1500);

      // Expiry warning (simulated)
      setTimeout(() => {
        triggerExpiryWarning('Background Check', 14);
      }, 2500);
    };

    initializeAlerts();
  }, [token, userId, triggerPolicyUpdate, triggerGuidelineReminder, triggerExpiryWarning]);

  return {
    notifications,
    deliveredCount,
    appStateVisible,
    triggerRuleViolationAlert,
    triggerGuidelineReminder,
    triggerPolicyUpdate,
    triggerExpiryWarning,
    triggerBatchNotifications,
    clearAllNotifications,
    clearNotification,
    getUndeliveredNotifications,
    getNotificationsByType,
    getNotificationsBySeverity,
    getCriticalNotifications,
    scheduleRecurringReminders,
    checkPendingAlerts,
  };
};
