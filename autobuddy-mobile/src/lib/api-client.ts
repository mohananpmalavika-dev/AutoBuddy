import { API_BASE_URL as RAW_API_BASE_URL, apiRequest as rawApiRequest } from './api';

export const API_BASE_URL = String(RAW_API_BASE_URL);

export interface ApiRequestOptions<TBody = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  body?: TBody;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
}

export interface ApiError extends Error {
  status?: number;
  payload?: unknown;
}

export async function apiRequest<TResponse = unknown, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {},
): Promise<TResponse> {
  return (await rawApiRequest(path, options as Record<string, unknown>)) as TResponse;
}

export function asApiError(error: unknown): ApiError {
  return error as ApiError;
}
