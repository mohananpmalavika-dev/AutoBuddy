import { useEffect, useState, useContext, createContext, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiRequest, authAPI, AuthResponse } from '../lib/api-client';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: 'passenger' | 'driver' | 'operator' | 'admin';
  photo?: string;
  rating?: number;
  created_at?: string;
}

export interface AppSession {
  token: string;
  refreshToken?: string;
  user: User;
  expiresAt?: number;
}

interface AppSessionContextType {
  session: AppSession | null;
  isLoading: boolean;
  isSignedIn: boolean;
  error: Error | null;
  login: (phone: string, password: string, role: string) => Promise<void>;
  signup: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AppSessionContext = createContext<AppSessionContextType | undefined>(undefined);

/**
 * Hook to use app session
 */
export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error('useAppSession must be used within AppSessionProvider');
  }
  return context;
}

/**
 * Provider component for app session
 */
export function AppSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Restore session on app start
  useEffect(() => {
    restoreSession();
  }, []);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!session?.expiresAt) return;

    const expiresIn = session.expiresAt - Date.now();
    const refreshTime = Math.max(expiresIn - 5 * 60 * 1000, 1000); // Refresh 5 minutes before expiry

    const timer = setTimeout(() => {
      refresh();
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [session?.expiresAt]);

  /**
   * Restore session from secure storage
   */
  const restoreSession = async () => {
    try {
      setIsLoading(true);

      const token = await SecureStore.getItemAsync('auth_token');
      const sessionData = await SecureStore.getItemAsync('session');

      if (token && sessionData) {
        const parsedSession = JSON.parse(sessionData);

        // Check if token is still valid
        if (parsedSession.expiresAt > Date.now()) {
          setSession(parsedSession);
        } else {
          // Token expired, try to refresh
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

  /**
   * Login user
   */
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
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };

      // Store token securely
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

  /**
   * Signup user
   */
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

      // Store token securely
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

  /**
   * Refresh auth token
   */
  const refresh = async () => {
    try {
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
    }
  };

  /**
   * Logout user
   */
  const logout = async () => {
    try {
      if (session?.token) {
        await authAPI.logout(session.token);
      }
    } catch (err) {
      console.error('Logout API call failed:', err);
    } finally {
      // Clear storage
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

export default useAppSession;
