import type { AppSession, AppUser, UserRole } from './models';

type AuthRecord = Record<string, unknown>;

const VALID_ROLES = new Set<UserRole>(['passenger', 'driver', 'operator', 'admin']);

function isRecord(value: unknown): value is AuthRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readRole(value: unknown): UserRole {
  const role = readString(value).toLowerCase() as UserRole;
  return VALID_ROLES.has(role) ? role : 'passenger';
}

function collectCandidateRecords(payload: unknown): AuthRecord[] {
  if (!isRecord(payload)) {
    return [];
  }

  const candidates: unknown[] = [
    payload,
    payload.data,
    payload.result,
    payload.response,
    payload.payload,
    payload.session,
    payload.auth,
  ];

  if (isRecord(payload.data)) {
    candidates.push(payload.data.session, payload.data.auth, payload.data.result);
  }
  if (isRecord(payload.result)) {
    candidates.push(payload.result.session, payload.result.auth, payload.result.data);
  }

  const seen = new Set<AuthRecord>();
  return candidates.filter((candidate): candidate is AuthRecord => {
    if (!isRecord(candidate) || seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    return true;
  });
}

function findString(candidates: AuthRecord[], keys: string[]): string {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = readString(candidate[key]);
      if (value) {
        return value;
      }
    }
  }
  return '';
}

function findUser(candidates: AuthRecord[]): AppUser | null {
  for (const candidate of candidates) {
    const user = candidate.user || candidate.account || candidate.profile;
    if (!isRecord(user)) {
      continue;
    }

    const id = readString(user.id || user.user_id || user.userId || user.sub);
    const email = readString(user.email);
    const name = readString(user.name || user.full_name || user.fullName) || 'User';
    const phone = readString(user.phone || user.mobile || user.phone_number || user.phoneNumber);
    const role = readRole(user.role);
    if (!id || !email) {
      continue;
    }

    return {
      ...(user as Partial<AppUser>),
      id,
      email,
      name,
      phone,
      role,
    };
  }

  return null;
}

export function normalizeAuthSessionFromPayload(payload: unknown): AppSession | null {
  const candidates = collectCandidateRecords(payload);
  if (!candidates.length) {
    return null;
  }

  const token = findString(candidates, ['token', 'access_token', 'accessToken', 'authToken']);
  if (!token) {
    return null;
  }

  const user = findUser(candidates);
  if (!user) {
    return null;
  }

  const refreshToken = findString(candidates, ['refresh_token', 'refreshToken']);
  return {
    ...(payload as Partial<AppSession>),
    token,
    refresh_token: refreshToken || undefined,
    user,
  };
}
