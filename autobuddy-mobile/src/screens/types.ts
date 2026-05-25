import type { AppSession, AppUser } from '@/lib/models';

export interface AuthScreenProps {
  onAuthenticated: (session: AppSession) => void | Promise<void>;
}

export interface RoleScreenProps {
  token: string;
  user: AppUser;
  onLogout: () => void | Promise<void>;
}
