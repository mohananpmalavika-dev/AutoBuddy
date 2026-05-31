import { asApiError } from './api-client';

export function getErrorMessage(error: unknown, fallback: string): string {
  const apiError = asApiError(error);
  const message = typeof apiError?.message === 'string' ? apiError.message.trim() : '';
  return message || fallback;
}

export function isAuthSessionInvalid(error: unknown): boolean {
  const apiError = asApiError(error);
  const statusCode = Number(apiError?.status || 0);
  const code = String(apiError?.code || '').toUpperCase();
  if (apiError?.authExpired || code === 'AUTH_EXPIRED') {
    return true;
  }
  if (statusCode === 401 || statusCode === 403) {
    return true;
  }
  const message = String(apiError?.message || '').toLowerCase();
  return (
    message.includes('session expired') ||
    message.includes('no refresh token') ||
    message.includes('token expired') ||
    message.includes('invalid token') ||
    message.includes('user not found') ||
    message.includes('not authenticated')
  );
}
