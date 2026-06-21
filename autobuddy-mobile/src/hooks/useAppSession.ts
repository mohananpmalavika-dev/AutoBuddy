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

export { AppSessionContext };

export default useAppSession;

