import type { ReactElement, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { SubscriptionGate } from '@/components/app/SubscriptionGate';
import { WebSetupCard } from '@/components/app/WebSetupCard';
import AutoBuddyBrand from '../components/AutoBuddyBrand';
import { getErrorMessage, isAuthSessionInvalid } from '../lib/auth';
import { apiRequest } from '../lib/api-client';
import { normalizeAuthSessionFromPayload } from '../lib/authSession';
import type { ApiNotification, AppSession, PlanOption, SubscriptionConfigPayload, SubscriptionStatusPayload, UserRole } from '../lib/models';
import { resolveRoleScreenKey } from '../lib/navigation';
import { getPlanOptions } from '../lib/subscriptions';
import { loadSession, saveSession, clearSession, subscribeSession, extendSessionExpiry, isSessionValid } from '../lib/persistentSessionManager';
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
const WEB_NOTIFICATION_POLL_MS = 60 * 1000;
const WEB_NOTIFICATION_AUTH_RETRY_COOLDOWN_MS = 60 * 1000;
const WEB_NOTIFICATION_AUTH_EXPIRED_COOLDOWN_MS = 5 * 60 * 1000;
const WEB_NOTIFICATION_ERROR_COOLDOWN_MS = 2 * 60 * 1000;

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

export default function HomeScreen() {
  const isWeb = Platform.OS === 'web';
  const { width, height } = useWindowDimensions();
  const isCompactWeb = isWeb && (width < 640 || height < 720);
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AppSession | null>(null);
  const [checkingSubscriptionGate, setCheckingSubscriptionGate] = useState(false);
  const [showPlanGate, setShowPlanGate] = useState(false);
  const [gateRole, setGateRole] = useState<UserRole | null>(null);
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [planSelectionError, setPlanSelectionError] = useState('');
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [homeResetKey, setHomeResetKey] = useState(0);
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
  const webNotificationPollPausedUntilRef = useRef(0);

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
      event.preventDefault();
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
        const stored = await loadSession();

        if (!stored?.token) {
          setBooting(false);
          return;
        }

        let activeSession: AppSession | null = stored;

        if (stored?.user) {
          setSession(stored);
          if (stored.user?.id) {
            Sentry.setUser({ id: String(stored.user.id) });
          }
        }

        try {
          const user = await apiRequest<AppSession['user']>('/auth/me', { token: stored.token });
          const nextSession = { ...stored, user };
          activeSession = nextSession;
          setSession(nextSession);
          await saveSession(nextSession);
          await extendSessionExpiry();
        } catch (err: unknown) {
          if (isAuthSessionInvalid(err)) {
            const localSessionStillValid = await isSessionValid().catch(() => false);
            if (localSessionStillValid) {
              setBooting(false);
              return;
            }
            setSession(null);
            await clearSession();
            setBooting(false);
            return;
          }
          if (!stored?.user) {
            setSession(null);
          }
        }

        if (activeSession?.token) {
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
    await saveSession(normalizedSession);
    await extendSessionExpiry();

    if (normalizedSession?.user?.id) {
      Sentry.setUser({ id: String(normalizedSession.user.id) });
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setSession(null);
    setShowPlanGate(false);
    setGateRole(null);
    setPlanOptions([]);
    setPlanSelectionError('');

    Sentry.setUser(null);

    await clearSession();
    disconnectSocket();
  }, []);

  const handleGoHome = useCallback(() => {
    setHomeResetKey((current) => current + 1);
    if (isWeb && typeof window !== 'undefined' && window.location.pathname !== '/app') {
      window.history.replaceState(null, '', '/app');
    }
  }, [isWeb]);

  useEffect(() => {
    const unsubscribe = subscribeSession((session: AppSession | null) => {
      if (session && session.token) {
        setSession(session);
      } else {
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
    if (
      !isWeb ||
      typeof window === 'undefined' ||
      !session?.token ||
      notificationPermission !== 'granted'
    ) {
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
      if (Date.now() < webNotificationPollPausedUntilRef.current) {
        return;
      }

      try {
        const rows = await apiRequest<Record<string, unknown>[]>('/users/notifications', {
          token: session.token,
          timeoutMs: 10000,
          query: { unread_only: true, limit: 40 },
        });
        if (stopped || !Array.isArray(rows)) {
          return;
        }
        webNotificationPollPausedUntilRef.current = 0;

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
      } catch (err: unknown) {
        const apiError = err as { status?: number; code?: string; sessionPreserved?: boolean };
        const status = Number(apiError?.status || 0);
        const code = String(apiError?.code || '').toUpperCase();
        if (code === 'AUTH_RETRY_REQUIRED' || apiError?.sessionPreserved) {
          webNotificationPollPausedUntilRef.current = Date.now() + WEB_NOTIFICATION_AUTH_RETRY_COOLDOWN_MS;
        } else if (code === 'AUTH_EXPIRED' || status === 401 || status === 403) {
          webNotificationPollPausedUntilRef.current = Date.now() + WEB_NOTIFICATION_AUTH_EXPIRED_COOLDOWN_MS;
        } else if (status === 429 || status >= 500 || status === 0) {
          webNotificationPollPausedUntilRef.current = Date.now() + WEB_NOTIFICATION_ERROR_COOLDOWN_MS;
        }
      }
    };

    void pollNotifications();
    const timer = window.setInterval(() => {
      void pollNotifications();
    }, WEB_NOTIFICATION_POLL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [isWeb, notificationPermission, session, showSystemNotification]);

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
          key={`passenger-${homeResetKey}`}
          token={session.token}
          user={session.user}
          onLogout={handleLogout}
        />
      ),
      driver: (
        <DriverDashboard
          key={`driver-${homeResetKey}`}
          token={session.token}
          user={session.user}
          onLogout={handleLogout}
        />
      ),
      operator: (
        <OperatorDashboard
          key={`operator-${homeResetKey}`}
          token={session.token}
          user={session.user}
          onLogout={handleLogout}
        />
      ),
      admin: <AdminDashboard key={`admin-${homeResetKey}`} token={session.token} user={session.user} onLogout={handleLogout} />,
    };
  }, [handleLogout, homeResetKey, session]);

  const renderCenteredShell = (subtitle: string, children: ReactNode) => (
    <ScrollView
      style={styles.launchScroll}
      contentContainerStyle={[styles.loader, isCompactWeb && styles.loaderCompact]}
      keyboardShouldPersistTaps="handled">
      <AutoBuddyBrand subtitle={subtitle} compact={isCompactWeb} />
      {children}
    </ScrollView>
  );

  const renderWebSetupShell = (children: ReactNode) => (
    <View style={styles.launchViewport}>
      <View style={[styles.setupLoader, isCompactWeb && styles.setupLoaderCompact]}>
        <AutoBuddyBrand subtitle="Set Up Web Alerts" compact={isCompactWeb} />
        {children}
      </View>
    </View>
  );

  if (booting) {
    return renderCenteredShell(
      'Preparing secure ride experience...',
      <>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loaderText}>Loading AutoBuddy</Text>
      </>,
    );
  }

  if (!session || !roleScreens) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (checkingSubscriptionGate) {
    return renderCenteredShell(
      'Finalizing your setup...',
      <>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loaderText}>Verifying subscription plan</Text>
      </>,
    );
  }

  if (showPlanGate && ['driver', 'operator', 'passenger'].includes(session.user.role)) {
    return renderCenteredShell(
      'Choose Your Plan',
      <View style={[styles.shellCardWrap, isCompactWeb && styles.shellCardWrapCompact]}>
        <SubscriptionGate
          role={gateRole || 'passenger'}
          planOptions={planOptions}
          errorMessage={planSelectionError}
          isSubmitting={planSubmitting}
          onSelectPlan={handlePlanSelection}
        />
      </View>,
    );
  }

  if (session && showWebSetupCard) {
    return renderWebSetupShell(
      <View style={[styles.shellCardWrap, isCompactWeb && styles.shellCardWrapCompact]}>
        <WebSetupCard
          notificationPermission={notificationPermission}
          message={webSetupMessage}
          compact={isCompactWeb}
          onEnableAlerts={enableWebAlerts}
          onInstallShortcut={installWebShortcut}
          onContinue={dismissWebSetup}
        />
      </View>,
    );
  }

  const activeRoleScreen = roleScreens[resolveRoleScreenKey(session.user.role)] ?? roleScreens.passenger;

  return (
    <View style={styles.appShell}>
      {activeRoleScreen}
      <View pointerEvents="box-none" style={[styles.homeButtonWrap, isCompactWeb && styles.homeButtonWrapCompact]}>
        <Pressable
          accessibilityLabel="Go to home"
          accessibilityRole="button"
          onPress={handleGoHome}
          style={({ pressed }) => [styles.homeButton, isCompactWeb && styles.homeButtonCompact, pressed && styles.homeButtonPressed]}>
          <MaterialIcons name="home" size={20} color="#FFFFFF" />
          <Text style={styles.homeButtonText}>Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  launchScroll: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  launchViewport: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loader: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  loaderCompact: {
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  setupLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  setupLoaderCompact: {
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 8,
  },
  loaderText: { marginTop: 12, color: COLORS.muted, fontWeight: '700' },
  shellCardWrap: {
    width: '100%',
    maxWidth: 520,
  },
  shellCardWrapCompact: {
    maxWidth: '100%',
  },
  homeButtonWrap: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    zIndex: 100,
  },
  homeButtonWrapCompact: {
    left: 10,
    bottom: 10,
  },
  homeButton: {
    minHeight: 46,
    minWidth: 46,
    borderRadius: 24,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  homeButtonCompact: {
    minHeight: 42,
    minWidth: 42,
    paddingHorizontal: 12,
  },
  homeButtonPressed: {
    opacity: 0.82,
  },
  homeButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
