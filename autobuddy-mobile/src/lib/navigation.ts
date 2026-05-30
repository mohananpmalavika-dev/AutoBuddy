import type { UserRole } from './models';

export function resolveRoleScreenKey(role: UserRole): UserRole {
  if (role === 'driver' || role === 'operator' || role === 'admin') {
    return role;
  }
  return 'passenger';
}
