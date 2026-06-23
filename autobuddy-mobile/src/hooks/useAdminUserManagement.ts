import { useState, useCallback } from 'react';
import axios from 'axios';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'moderator' | 'support';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: Date;
  createdAt: Date;
  permissions: string[];
}

interface UseAdminUserManagementReturn {
  users: AdminUser[];
  loading: boolean;
  error: Error | null;
  fetchUsers: (filters?: { role?: string; status?: string }) => Promise<void>;
  addUser: (userData: Omit<AdminUser, 'id' | 'createdAt'>) => Promise<AdminUser | null>;
  updateUser: (userId: string, updates: Partial<AdminUser>) => Promise<boolean>;
  removeUser: (userId: string) => Promise<boolean>;
  updatePermissions: (userId: string, permissions: string[]) => Promise<boolean>;
  suspendUser: (userId: string, reason: string) => Promise<boolean>;
  reactivateUser: (userId: string) => Promise<boolean>;
  resetPassword: (userId: string) => Promise<string | null>;
  getActivityLog: (userId: string) => Promise<any[]>;
}

export const useAdminUserManagement = (token: string | null): UseAdminUserManagementReturn => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchUsers = useCallback(
    async (filters?: { role?: string; status?: string }) => {
      if (!token) {return;}
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters?.role) {params.append('role', filters.role);}
        if (filters?.status) {params.append('status', filters.status);}

        const response = await axios.get(`${API_BASE_URL}/admin/users?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUsers(response.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch users'));
      } finally {
        setLoading(false);
      }
    },
    [token, API_BASE_URL]
  );

  const addUser = useCallback(
    async (userData: Omit<AdminUser, 'id' | 'createdAt'>): Promise<AdminUser | null> => {
      if (!token) {return null;}
      try {
        const response = await axios.post(`${API_BASE_URL}/admin/users`, userData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const newUser = response.data;
        setUsers((prev) => [...prev, newUser]);
        return newUser;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add user'));
        return null;
      }
    },
    [token, API_BASE_URL]
  );

  const updateUser = useCallback(
    async (userId: string, updates: Partial<AdminUser>): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.put(`${API_BASE_URL}/admin/users/${userId}`, updates, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, ...updates } : u))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update user'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const removeUser = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.delete(`${API_BASE_URL}/admin/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to remove user'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const updatePermissions = useCallback(
    async (userId: string, permissions: string[]): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.put(
          `${API_BASE_URL}/admin/users/${userId}/permissions`,
          { permissions },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, permissions } : u))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update permissions'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const suspendUser = useCallback(
    async (userId: string, reason: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/admin/users/${userId}/suspend`,
          { reason },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status: 'suspended' } : u))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to suspend user'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const reactivateUser = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/admin/users/${userId}/reactivate`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status: 'active' } : u))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to reactivate user'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const resetPassword = useCallback(
    async (userId: string): Promise<string | null> => {
      if (!token) {return null;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/admin/users/${userId}/reset-password`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data.temporaryPassword || null;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to reset password'));
        return null;
      }
    },
    [token, API_BASE_URL]
  );

  const getActivityLog = useCallback(
    async (userId: string): Promise<any[]> => {
      if (!token) {return [];}
      try {
        const response = await axios.get(`${API_BASE_URL}/admin/users/${userId}/activity`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch activity log'));
        return [];
      }
    },
    [token, API_BASE_URL]
  );

  return {
    users,
    loading,
    error,
    fetchUsers,
    addUser,
    updateUser,
    removeUser,
    updatePermissions,
    suspendUser,
    reactivateUser,
    resetPassword,
    getActivityLog,
  };
};
