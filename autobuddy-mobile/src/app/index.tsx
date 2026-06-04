import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { SubscriptionGate } from '@/components/app/SubscriptionGate';
import { WebSetupCard } from '@/components/app/WebSetupCard';
import AutoBuddyBrand from '../components/AutoBuddyBrand';
import { getErrorMessage, isAuthSessionInvalid } from '../lib/auth';
import { apiRequest } from '../lib/api-client';
import { normalizeAuthSessionFromPayload } from '../lib/authSession';
import type { ApiNotification, AppSession, PlanOption, SubscriptionConfigPayload, SubscriptionStatusPayload, UserRole } from '../lib/models';
import { resolveRoleScreenKey } from '../lib/navigation';
import { getPlanOptions } from '../lib/subscriptions';
import { clearSession, loadSession, saveSession } from '../lib/session';
import { loadSession as loadPersistentSession, saveSession as savePersistentSession, clearSession as clearPersistentSession, subscribeSession as subscribePersistentSession, extendSessionExpiry } from '../lib/persistentSessionManager';
import { initializeBackgroundNotifications } from '../lib/backgroundNotificationService';
import { disconnectSocket } from '../services/socketClient';
import '../services/driverBackgroundTracking';
import * as Sentry from '@sentry/react-native';
import { AdminDashboard, AuthScreen, DriverDashboard, OperatorDashboard, PassengerMap } from '../screens';
import { COLORS } from '../theme';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type StoredSessionCandidate = Partial<AppSession> & {
  access_token?: string;
  accessToken?: string;
  refreshToken?: string;
};

const WEB_INSTALL_DISMISSED_KEY = 'autobuddy_web_install_dismissed_v1';
const WEB_ALERTS_ENABLED_KEY = 'autobuddy_web_alerts_enabled_v1';
const WEB_SEEN_NOTIFICATION_KEY_PREFIX = 'autobuddy_seen_notifications_v1_';
const WEB_APP_UPDATE_CHECK_MS = 60 * 1000;
const WEB_APP_UPDATE_RELOAD_KEY = 'autobuddy_last_update_reload_at';

function extractWebBundleIds(source: string): string[] {
  return Array.from(new Set(source.match(/entry-[a-f0-9][^"']*\.js/g) || []));
}

function getCurrentWebBundleIds(): string[] {
  if (typeof document === 'undefined') {
    return [];
  }
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))
    .map((script) => script.getAttribute('src') || '')
    .flatMap(extractWebBundleIds);
}

function normalizeStoredSession(candidate: StoredSessionCandidate | null | undefined): AppSession | null {
  return normalizeAuthSessionFromPayload(candidate);
}

function pickStoredSession(
  persistentSession: StoredSessionCandidate | null,
  legacySession: StoredSessionCandidate | null,
): AppSession | null {
  const persistent = normalizeStoredSession(persistentSession);
  const legacy = normalizeStoredSession(legacySession);

  return persistent?.refresh_token ? persistent : legacy?.refresh_token ? legacy : persistent || legacy;
}

export default function HomeScreen() {
  const isWeb = Platform.OS === 'web';
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);
  const [checkingSubscriptionGate, setCheckingSubscriptionGate] = useState(false);
  const [showPlanGate, setShowPlanGate] = useState(false);
  const [gateRole, setGateRole] = useState<UserRole | null>(null);
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [planSelectionError, setPlanSelectionError] = useState('');
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [webSetupMessage, setWebSetupMessage] = useState('');
  const [webSetupDismissed, setWebSetupDismissed] = useState(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(WEB_INSTALL_DISMISSED_KEY) === '1';
  });
  const [notificationPermission, setNotificationPermission] = useState<'default' | 'denied' | 'granted'>(() => {
    if (typeof Notification === 'undefined') {
      return 'default';
    }
    return Notification.permission;
  });
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const seededNotificationsRef = useRef(false);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  const isStandaloneInstalled = useCallback(() => {
    if (!isWeb || typeof window === 'undefined') {
      return false;
    }
    const inStandaloneMode = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean })?.standalone);
    return Boolean(inStandaloneMode || iosStandalone);
  }, [isWeb]);

  const showSystemNotification = useCallback(async (title: string, body: string, data: Record<string, unknown> = {}) => {
    if (!isWeb || typeof window === 'undefined') {
      return;
    }
    if (Notification.permission !== 'granted') {
      return;
    }

    const payload: NotificationOptions = {
      body,
      tag: String(data?.booking_id || data?.notification_id || `${Date.now()}`),
      data,
      icon: '/logo.png',
      badge: '/logo.png',
    };

    try {
      if ('serviceWorker' in navigator) {
        const registration = swRegistrationRef.current || (await navigator.serviceWorker.ready);
        swRegistrationRef.current = registration;
        await registration.showNotification(title, payload);
      } else {
        void new Notification(title, payload);
      }
    } catch {
      try {
        void new Notification(title, payload);
      } catch {
        // Ignore web notification failures.
      }
    }
  }, [isWeb]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') {
      return;
    }

    if (typeof document !== 'undefined' && !document.querySelector('link[rel="manifest"]')) {
      const manifestLink = document.createElement('link');
      manifestLink.setAttribute('rel', 'manifest');
      manifestLink.setAttribute('href', '/manifest.webmanifest');
      document.head.appendChild(manifestLink);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          swRegistrationRef.current = registration;
        })
        .catch(() => null);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstallPromptEvent(null);
      setWebSetupDismissed(true);
      setWebSetupMessage('AutoBuddy shortcut installed on this device.');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [isWeb]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') {
      return undefined;
    }

    let cancelled = false;
    let checkInFlight = false;

    const reloadWhenSafe = () => {
      if (cancelled) {
        return;
      }
      const lastReloadAt = Number(window.localStorage.getItem(WEB_APP_UPDATE_RELOAD_KEY) || 0);
      if (Date.now() - lastReloadAt < 30000) {
        return;
      }
      window.localStorage.setItem(WEB_APP_UPDATE_RELOAD_KEY, String(Date.now()));
      setWebSetupMessage('Updating AutoBuddy to the latest version...');
      window.setTimeout(() => {
        if (!cancelled) {
          window.location.reload();
        }
      }, 250);
    };

    const checkForNewWebBundle = async () => {
      if (checkInFlight || cancelled) {
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      const currentBundles = getCurrentWebBundleIds();
      if (currentBundles.length === 0) {
        return;
      }

      checkInFlight = true;
      try {
        const response = await fetch(`/app?autobuddy_version_check=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
          },
        });
        if (!response.ok) {
          return;
        }
        const html = await response.text();
        const latestBundles = extractWebBundleIds(html);
        if (latestBundles.some((bundleId) => !currentBundles.includes(bundleId))) {
          reloadWhenSafe();
        }
      } catch {
        // Version checks must never interrupt the app.
      } finally {
        checkInFlight = false;
      }
    };

    const startupTimer = window.setTimeout(checkForNewWebBundle, 10000);
    const interval = window.setInterval(checkForNewWebBundle, WEB_APP_UPDATE_CHECK_MS);
    window.addEventListener('focus', checkForNewWebBundle);

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', checkForNewWebBundle);
    };
  }, [isWeb]);

  useEffect(() => {
    async function hydrate() {
      try {
        const persistentStored = await loadPersistentSession();
        const legacyStored = await loadSession();
        const stored = pickStoredSession(persistentStored, legacyStored);

        if (!stored?.token) {
          setSession(null);
          return;
        }

        // Keep previously saved user for resilient sessions across restarts,
        // even when backend is temporarily unavailable at boot.
        if (stored?.user) {
          setSession(stored);
          if (stored.user?.id) {
            Sentry.setUser({ id: String(stored.user.id) });
          }
        }

        try {
          const user = await apiRequest<AppSession['user']>('/auth/me', { token: stored.token });
          const nextSession = { ...stored, token: stored.token, user };
          setSession(nextSession);
          
          // Save to both persistent and legacy session
          await savePersistentSession(nextSession);
          await saveSession(nextSession);
          
          // Extend session expiry on successful auth
          await extendSessionExpiry();
        } catch (err: unknown) {
          if (isAuthSessionInvalid(err)) {
            setSession(null);
            await clearPersistentSession();
            await clearSession();
            return;
          }
          // Keep existing stored session and let in-screen API retries recover.
          if (!stored?.user) {
            setSession(null);
          }
        }

        // Initialize background services for persistent connectivity
        if (stored?.token) {
          await initializeBackgroundNotifications();
        }
      } catch {
        setSession(null);
      } finally {
        setBooting(false);
      }
    }

    hydrate();
  }, []);

  const handleAuthenticated = useCallback(async (nextSession: AppSession) => {
    const normalizedSession = normalizeStoredSession(nextSession);
    if (!normalizedSession) {
      setSession(null);
      return;
    }

    setSession(normalizedSession);
    // Persist session data
    await savePersistentSession(normalizedSession);
    await saveSession(normalizedSession);
    await extendSessionExpiry();

    // Provide persistent Sentry context for user/driver issues
    if (normalizedSession?.user?.id) {
      Sentry.setUser({ id: String(normalizedSession.user.id) });
    }
  }, []);

  /**
   * Handle logout - ONLY CLEARS SESSION ON EXPLICIT USER ACTION
   * Closing browser/app does NOT trigger logout
   */
  const handleLogout = useCallback(async () => {
    setSession(null);
    setShowPlanGate(false);
    setGateRole(null);
    setPlanOptions([]);
    setPlanSelectionError('');

    // Clear Sentry user context when the session is ended
    Sentry.setUser(null);

    // Only clear when user explicitly logs out
    await clearPersistentSession();
    await clearSession();

    // Disconnect socket
    disconnectSocket();
  }, []);

  // Subscribe to persistent session changes for auto-restore functionality
  useEffect(() => {
    const unsubscribe = subscribePersistentSession((session: AppSession | null) => {
      if (session && session.token) {
        setSession(session);
      } else {
        // Session was explicitly cleared
        setSession(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let unmounted = false;
    async function evaluateSubscriptionGate() {
      if (!session || !['driver', 'operator', 'passenger'].includes(session.user.role)) {
        setShowPlanGate(false);
        setGateRole(null);
        setPlanOptions([]);
        return;
      }

      try {
        setCheckingSubscriptionGate(true);
        setPlanSelectionError('');
        const [configPayload, subscriptionPayload] = await Promise.all([
          apiRequest<SubscriptionConfigPayload>('/subscriptions/config', { token: session.token }),
          apiRequest<SubscriptionStatusPayload>('/subscriptions/me', { token: session.token }),
        ]);
        if (unmounted) {
          return;
        }

        const plans = getPlanOptions(configPayload);
        setPlanOptions(plans);
        setGateRole(session.user.role);
        const alreadySelectedPlan = String(subscriptionPayload?.subscription?.plan_type || '').trim();
        const forceSelection = plans.length > 0 && !alreadySelectedPlan;
        setShowPlanGate(forceSelection);
      } catch (err: unknown) {
        if (unmounted) {
          return;
        }
        setShowPlanGate(false);
        setGateRole(null);
        setPlanOptions([]);
        setPlanSelectionError(getErrorMessage(err, 'Could not verify subscription plans.'));
      } finally {
        if (!unmounted) {
          setCheckingSubscriptionGate(false);
        }
      }
    }

    evaluateSubscriptionGate();
    return () => {
      unmounted = true;
    };
  }, [session]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined' || !session?.token) {
      seededNotificationsRef.current = false;
      seenNotificationIdsRef.current.clear();
      return;
    }

    let stopped = false;
    const storageKey = `${WEB_SEEN_NOTIFICATION_KEY_PREFIX}${session.user.id}`;
    const persistedSeen = window.localStorage.getItem(storageKey);
    if (persistedSeen) {
      const saved = persistedSeen
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      seenNotificationIdsRef.current = new Set(saved);
      seededNotificationsRef.current = saved.length > 0;
    } else {
      seenNotificationIdsRef.current.clear();
      seededNotificationsRef.current = false;
    }

    const persistSeenIds = () => {
      const snapshot = Array.from(seenNotificationIdsRef.current).slice(-120);
      window.localStorage.setItem(storageKey, snapshot.join(','));
    };

    const speakIfVisible = (title: string, body: string) => {
      if (document.hidden || !window.speechSynthesis) {
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(`${title}. ${body}`);
        utterance.lang = 'en-IN';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore speech failures.
      }
    };

    const pollNotifications = async () => {
      try {
        const rows = await apiRequest<Record<string, unknown>[]>('/users/notifications', {
          token: session.token,
          timeoutMs: 10000,
        });
        if (stopped || !Array.isArray(rows)) {
          return;
        }

        const normalized: ApiNotification[] = rows
          .map((item) => ({
            id: String(item?.id || item?._id || ''),
            title: String(item?.title || 'AutoBuddy Alert'),
            body: String(item?.body || 'You have a new update.'),
            data: (item?.data as Record<string, unknown>) || {},
          }))
          .filter((item) => item.id);

        if (!seededNotificationsRef.current) {
          normalized.forEach((item) => seenNotificationIdsRef.current.add(item.id));
          seededNotificationsRef.current = true;
          persistSeenIds();
          return;
        }

        const incoming = normalized
          .filter((item) => !seenNotificationIdsRef.current.has(item.id))
          .reverse();

        for (const item of incoming) {
          seenNotificationIdsRef.current.add(item.id);
          await showSystemNotification(item.title, item.body, { ...item.data, notification_id: item.id });
          speakIfVisible(item.title, item.body);
        }

        if (incoming.length > 0) {
          persistSeenIds();
        }
      } catch {
        // Keep silent polling.
      }
    };

    void pollNotifications();
    const timer = window.setInterval(() => {
      void pollNotifications();
    }, 15000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [isWeb, session, showSystemNotification]);

  const handlePlanSelection = useCallback(
    async (planType: PlanOption['planType']) => {
      if (!session) {
        return;
      }
      try {
        setPlanSubmitting(true);
        setPlanSelectionError('');
        await apiRequest('/subscriptions/select', {
          method: 'PUT',
          token: session.token,
          body: { plan_type: planType },
        });
        setShowPlanGate(false);
      } catch (err: unknown) {
        setPlanSelectionError(getErrorMessage(err, 'Could not select plan.'));
      } finally {
        setPlanSubmitting(false);
      }
    },
    [session],
  );

  const enableWebAlerts = useCallback(async () => {
    if (!isWeb || typeof window === 'undefined' || typeof Notification === 'undefined') {
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        window.localStorage.setItem(WEB_ALERTS_ENABLED_KEY, '1');
        setWebSetupMessage('Alerts enabled. You will get ride and message pop-ups.');
      } else {
        setWebSetupMessage('Notification permission denied. Enable browser notifications for AutoBuddy.');
      }
    } catch {
      setWebSetupMessage('Could not enable notifications in this browser.');
    }
  }, [isWeb]);

  const installWebShortcut = useCallback(async () => {
    if (!isWeb || typeof window === 'undefined') {
      return;
    }
    if (installPromptEvent) {
      try {
        await installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          setWebSetupMessage('AutoBuddy install started.');
          setInstallPromptEvent(null);
          return;
        }
        setWebSetupMessage('Install was dismissed. You can try again anytime.');
        return;
      } catch {
        setWebSetupMessage('Install prompt failed. Please use browser menu to install.');
        return;
      }
    }

    setWebSetupMessage('Use browser menu -> "Install App" or "Add to Home Screen" to create a shortcut.');
  }, [installPromptEvent, isWeb]);

  const dismissWebSetup = useCallback(() => {
    if (isWeb && typeof window !== 'undefined') {
      window.localStorage.setItem(WEB_INSTALL_DISMISSED_KEY, '1');
    }
    setWebSetupDismissed(true);
  }, [isWeb]);

  const showWebSetupCard = useMemo(() => {
    if (!isWeb || !session) {
      return false;
    }
    const installed = isStandaloneInstalled();
    const alertsGranted = notificationPermission === 'granted';
    return !webSetupDismissed && (!installed || !alertsGranted);
  }, [isStandaloneInstalled, isWeb, notificationPermission, session, webSetupDismissed]);

  const roleScreens: Record<UserRole, ReactElement> | null = useMemo(() => {
    if (!session) {
      return null;
    }

    return {
      passenger: (
        <PassengerMap
          token={session.token}
          user={session.user}
          onLogout={handleLogout}
        />
      ),
      driver: (
        <DriverDashboard
          token={session.token}
          user={session.user}
          onLogout={handleLogout}
        />
      ),
      operator: (
        <OperatorDashboard
          token={session.token}
          user={session.user}
          onLogout={handleLogout}
        />
      ),
      admin: <AdminDashboard token={session.token} user={session.user} onLogout={handleLogout} />,
    };
  }, [handleLogout, session]);

  if (booting) {
    return (
      <View style={styles.loader}>
        <AutoBuddyBrand subtitle="Loading AutoBuddy..." />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loaderText}>Preparing secure ride experience</Text>
      </View>
    );
  }

  if (!session || !roleScreens) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (checkingSubscriptionGate) {
    return (
      <View style={styles.loader}>
        <AutoBuddyBrand subtitle="Checking subscription..." />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (showPlanGate && ['driver', 'operator', 'passenger'].includes(session.user.role)) {
    return (
      <View style={styles.loader}>
        <AutoBuddyBrand subtitle="Choose Subscription Plan" />
        <SubscriptionGate
          role={gateRole || 'passenger'}
          planOptions={planOptions}
          errorMessage={planSelectionError}
          isSubmitting={planSubmitting}
          onSelectPlan={handlePlanSelection}
        />
      </View>
    );
  }

  if (session && showWebSetupCard) {
    return (
      <View style={styles.loader}>
        <AutoBuddyBrand subtitle="Set Up Web Alerts" />
        <WebSetupCard
          notificationPermission={notificationPermission}
          message={webSetupMessage}
          onEnableAlerts={enableWebAlerts}
          onInstallShortcut={installWebShortcut}
          onContinue={dismissWebSetup}
        />
      </View>
    );
  }

  return roleScreens[resolveRoleScreenKey(session.user.role)] ?? roleScreens.passenger;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 20,
  },
  loaderText: { marginTop: 12, color: COLORS.muted, fontWeight: '700' },
});
