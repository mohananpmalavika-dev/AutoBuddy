/**
 * UserModeContext - Global context for 3-mode feature segmentation
 * Location: src/contexts/UserModeContext.tsx
 * 
 * Provides user's current mode (Simple/Smart/Pro) and feature access utilities
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type UserMode = 'simple' | 'smart' | 'pro';

export interface UserModeProfile {
  user_id: string;
  current_mode: UserMode;
  previous_mode: UserMode | null;
  mode_upgraded_at: string | null;
  ai_suggestions_enabled: boolean;
  voice_commands_enabled: boolean;
  family_assistant_enabled: boolean;
  fleet_management_enabled: boolean;
  analytics_dashboard_enabled: boolean;
  corporate_billing_enabled: boolean;
  is_pro_trial: boolean;
  pro_trial_expires_at: string | null;
  is_pro_subscriber: boolean;
  pro_subscription_expires_at: string | null;
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  access_mode: 'simple' | 'smart' | 'pro' | 'all';
  component_path: string;
  router_name: string;
  is_experimental: boolean;
  is_deprecated: boolean;
}

interface UserModeContextType {
  // Current mode state
  currentMode: UserMode;
  modeProfile: UserModeProfile | null;
  
  // Feature access methods
  isFeatureAccessible: (featureName: string) => boolean;
  canAccessMode: (mode: UserMode) => boolean;
  getAccessibleFeatures: () => Feature[];
  
  // Mode management
  setUserMode: (mode: UserMode) => Promise<void>;
  startProTrial: (trialDays?: number) => Promise<void>;
  upgradeToProSubscription: (subscriptionDays?: number) => Promise<void>;
  
  // Loading state
  loading: boolean;
  error: string | null;
  
  // Feature toggle preferences
  toggleFeature: (featureName: string, enabled: boolean) => Promise<void>;
}

const UserModeContext = createContext<UserModeContextType | undefined>(undefined);

interface UserModeProviderProps {
  children: ReactNode;
  userId?: string;
}

/**
 * Provider component for UserMode context
 */
export const UserModeProvider: React.FC<UserModeProviderProps> = ({ children, userId }) => {
  const [currentMode, setCurrentMode] = useState<UserMode>('simple');
  const [modeProfile, setModeProfile] = useState<UserModeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessibleFeatures, setAccessibleFeatures] = useState<Feature[]>([]);

  // Fetch user's mode profile on mount or userId change
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchModeProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/v1/user-mode/${userId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user mode profile');
        }

        const data = await response.json();
        setModeProfile(data.mode_profile);
        setCurrentMode(data.current_mode);
        setAccessibleFeatures(data.features || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        // Default to simple mode on error
        setCurrentMode('simple');
      } finally {
        setLoading(false);
      }
    };

    fetchModeProfile();
  }, [userId]);

  const isFeatureAccessible = useCallback(
    (featureName: string): boolean => {
      return accessibleFeatures.some(f => f.name === featureName);
    },
    [accessibleFeatures]
  );

  const canAccessMode = useCallback(
    (mode: UserMode): boolean => {
      if (mode === 'simple') {return true;} // Everyone can access simple mode
      
      if (mode === 'smart') {
        return currentMode === 'smart' || currentMode === 'pro';
      }
      
      if (mode === 'pro') {
        return currentMode === 'pro' && (modeProfile?.is_pro_trial || modeProfile?.is_pro_subscriber);
      }
      
      return false;
    },
    [currentMode, modeProfile]
  );

  const getAccessibleFeatures = useCallback(
    (): Feature[] => {
      return accessibleFeatures;
    },
    [accessibleFeatures]
  );

  const setUserMode = useCallback(
    async (mode: UserMode) => {
      if (!userId) {throw new Error('User ID not available');}

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/v1/user-mode/${userId}/mode`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
          },
          body: JSON.stringify({ mode }),
        });

        if (!response.ok) {
          throw new Error('Failed to update user mode');
        }

        const data = await response.json();
        setCurrentMode(data.current_mode);
        setModeProfile(data.mode_profile);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  const startProTrial = useCallback(
    async (trialDays: number = 7) => {
      if (!userId) {throw new Error('User ID not available');}

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/v1/user-mode/${userId}/trial`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
          },
          body: JSON.stringify({ trial_days: trialDays }),
        });

        if (!response.ok) {
          throw new Error('Failed to start trial');
        }

        const data = await response.json();
        setCurrentMode(data.current_mode);
        setModeProfile(data.mode_profile);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  const upgradeToProSubscription = useCallback(
    async (subscriptionDays: number = 30) => {
      if (!userId) {throw new Error('User ID not available');}

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/v1/user-mode/${userId}/upgrade`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
          },
          body: JSON.stringify({ subscription_days: subscriptionDays }),
        });

        if (!response.ok) {
          throw new Error('Failed to upgrade to Pro');
        }

        const data = await response.json();
        setCurrentMode(data.current_mode);
        setModeProfile(data.mode_profile);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  const toggleFeature = useCallback(
    async (featureName: string, enabled: boolean) => {
      if (!userId) {throw new Error('User ID not available');}

      try {
        const response = await fetch(`/api/v1/user-mode/${userId}/feature/${featureName}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
          },
          body: JSON.stringify({ enabled }),
        });

        if (!response.ok) {
          throw new Error('Failed to toggle feature');
        }

        // Refresh mode profile
        const refreshResponse = await fetch(`/api/v1/user-mode/${userId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
          },
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          setModeProfile(data.mode_profile);
          setAccessibleFeatures(data.features || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [userId]
  );

  const value: UserModeContextType = {
    currentMode,
    modeProfile,
    isFeatureAccessible,
    canAccessMode,
    getAccessibleFeatures,
    setUserMode,
    startProTrial,
    upgradeToProSubscription,
    loading,
    error,
    toggleFeature,
  };

  return (
    <UserModeContext.Provider value={value}>
      {children}
    </UserModeContext.Provider>
  );
};

/**
 * Hook to use UserMode context
 */
export const useUserMode = (): UserModeContextType => {
  const context = useContext(UserModeContext);
  if (context === undefined) {
    throw new Error('useUserMode must be used within UserModeProvider');
  }
  return context;
};
