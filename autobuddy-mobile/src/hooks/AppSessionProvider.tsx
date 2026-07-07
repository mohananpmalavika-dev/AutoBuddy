import React, { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiRequest, authAPI, AuthResponse } from '../lib/api-client';
import {
  AppSessionContextType,
  AppSession,
  User,
  AppSessionContext,
} from './useAppSession';

export function AppSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<AppSession | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  // BUG-012 FIX: Track refresh in progress to prevent race condition
  const refreshInProgressRef = React.useRef(false);

  // Restore session on app start
  useEffect(() => {
    restoreSession();
  }, []);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!session?.expiresAt) {return;}

    const expiresIn = session.expiresAt - Date.now();
    const refreshTime = Math.max(expiresIn - 5 * 60 * 1000, 1000);

    const timer = setTimeout(() => {
      refresh();
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [session?.expiresAt]);

  const restoreSession = async () => {
    try {
      setIsLoading(true);

      const token = await SecureStore.getItemAsync('auth_token');
      const sessionData = await SecureStore.getItemAsync('session');

      if (token && sessionData) {
        const parsedSession = JSON.parse(sessionData);

        if (parsedSession.expiresAt > Date.now()) {
          setSession(parsedSession);
        } else {
          if (parsedSession.refreshToken) {
            await refresh();
          } else {
            await logout();
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore session:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (phone: string, password: string, role: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authAPI.login(phone, password, role);
      const authResponse = response as AuthResponse;

      const newSession: AppSession = {
        token: authResponse.token,
        refreshToken: authResponse.refresh_token,
        user: {
          id: authResponse.user.id,
          name: authResponse.user.name,
          phone: authResponse.user.phone,
          email: authResponse.user.email,
          role: authResponse.user.role,
        },
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
      };

      await SecureStore.setItemAsync('auth_token', newSession.token);
      if (newSession.refreshToken) {
        await SecureStore.setItemAsync('refresh_token', newSession.refreshToken);
      }
      await SecureStore.setItemAsync('session', JSON.stringify(newSession));

      setSession(newSession);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (data: any) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authAPI.signup(data);
      const authResponse = response as AuthResponse;

      const newSession: AppSession = {
        token: authResponse.token,
        refreshToken: authResponse.refresh_token,
        user: {
          id: authResponse.user.id,
          name: authResponse.user.name,
          phone: authResponse.user.phone,
          email: authResponse.user.email,
          role: authResponse.user.role,
        },
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
      };

      await SecureStore.setItemAsync('auth_token', newSession.token);
      if (newSession.refreshToken) {
        await SecureStore.setItemAsync('refresh_token', newSession.refreshToken);
      }
      await SecureStore.setItemAsync('session', JSON.stringify(newSession));

      setSession(newSession);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async () => {
    // BUG-012 FIX: Prevent concurrent refresh calls
    if (refreshInProgressRef.current) {
      console.log('[Session] Refresh already in progress, skipping');
      return;
    }

    try {
      refreshInProgressRef.current = true;

      if (!session?.refreshToken) {
        await logout();
        return;
      }

      const response = await apiRequest('/auth/refresh', {
        method: 'POST',
        body: { refresh_token: session.refreshToken },
      });

      const authResponse = response as any;

      const updatedSession: AppSession = {
        ...session,
        token: authResponse.token,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
      };

      await SecureStore.setItemAsync('auth_token', updatedSession.token);
      await SecureStore.setItemAsync('session', JSON.stringify(updatedSession));

      setSession(updatedSession);
    } catch (err) {
      console.error('Token refresh failed:', err);
      await logout();
    } finally {
      // BUG-012 FIX: Always clear the refresh flag
      refreshInProgressRef.current = false;
    }
  };

  const logout = async () => {
    try {
      if (session?.token) {
        await authAPI.logout(session.token);
      }
    } catch (err) {
      console.error('Logout API call failed:', err);
    } finally {
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('refresh_token');
      await SecureStore.deleteItemAsync('session');

      setSession(null);
      setError(null);
    }
  };

  const value: AppSessionContextType = {
    session,
    isLoading,
    isSignedIn: !!session,
    error,
    login,
    signup,
    logout,
    refresh,
  };

  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  );
}

export default AppSessionProvider;
