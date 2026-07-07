import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';

// Standardized API Response Types
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  page: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface StandardApiResponse<T = any> {
  status: 'success' | 'error' | 'partial';
  message: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  pagination?: PaginationMeta;
  metadata?: Record<string, any>;
  timestamp: string;
  version: string;
  request_id?: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, any>;
  statusCode: number;
  timestamp: Date;
  request_id?: string;
}

export interface ApiConfig {
  baseURL: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  apiVersion: string;
}

const DEFAULT_CONFIG: ApiConfig = {
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  apiVersion: 'v1',
};

let apiInstance: AxiosInstance | null = null;
let requestInterceptor: number | null = null;
let responseInterceptor: number | null = null;

export const initializeApiClient = (
  token: string | null,
  config: Partial<ApiConfig> = {}
): AxiosInstance => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (apiInstance) {
    return apiInstance;
  }

  apiInstance = axios.create({
    baseURL: finalConfig.baseURL,
    timeout: finalConfig.timeout,
  });

  requestInterceptor = apiInstance.interceptors.request.use(
    (config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      config.headers['Content-Type'] = 'application/json';
      config.headers['X-API-Version'] = finalConfig.apiVersion;
      config.headers['X-Client-Version'] = '1.0';
      return config;
    },
    (error) => Promise.reject(error)
  );

  responseInterceptor = apiInstance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as any;

      if (!config) {
        return Promise.reject(error);
      }

      config.retryCount = config.retryCount || 0;

      if (
        config.retryCount < finalConfig.retryAttempts &&
        error.response?.status === 429
      ) {
        config.retryCount++;
        const delay = finalConfig.retryDelay * Math.pow(2, config.retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return apiInstance!(config);
      }

      if (error.response?.status === 401) {
        console.error('Authentication failed');
      }

      return Promise.reject(error);
    }
  );

  return apiInstance;
};

export const getApiClient = (): AxiosInstance => {
  if (!apiInstance) {
    return initializeApiClient(null);
  }
  return apiInstance;
};

export const cleanupApiClient = (): void => {
  if (apiInstance) {
    if (requestInterceptor !== null) {
      apiInstance.interceptors.request.eject(requestInterceptor);
    }
    if (responseInterceptor !== null) {
      apiInstance.interceptors.response.eject(responseInterceptor);
    }
    apiInstance = null;
    requestInterceptor = null;
    responseInterceptor = null;
  }
};

export const handleApiError = (error: unknown): ApiErrorResponse => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<StandardApiResponse>;
    const errorData = axiosError.response?.data;

    // Extract from standardized response format
    if (errorData?.error) {
      return {
        code: errorData.error.code || axiosError.code || 'UNKNOWN_ERROR',
        message: errorData.error.message || axiosError.message,
        details: errorData.error.details,
        statusCode: axiosError.response?.status || 500,
        timestamp: new Date(),
        request_id: errorData.request_id,
      };
    }

    // Fallback for non-standard responses
    return {
      code: axiosError.code || 'UNKNOWN_ERROR',
      message: axiosError.response?.data?.message || axiosError.message,
      details: (axiosError.response?.data as any)?.details,
      statusCode: axiosError.response?.status || 500,
      timestamp: new Date(),
    };
  }

  if (error instanceof Error) {
    return {
      code: 'ERROR',
      message: error.message,
      statusCode: 500,
      timestamp: new Date(),
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    statusCode: 500,
    timestamp: new Date(),
  };
};

export const isNetworkError = (error: unknown): boolean => {
  if (axios.isAxiosError(error)) {
    return !error.response || error.message === 'Network Error';
  }
  return false;
};

export const validateStandardResponse = <T>(response: any): StandardApiResponse<T> => {
  if (!response.status || !['success', 'error', 'partial'].includes(response.status)) {
    console.warn('Response does not match standard format:', response);
  }
  return response as StandardApiResponse<T>;
};

export const extractResponseData = <T>(response: StandardApiResponse<T>): T | undefined => {
  return response.data;
};

export const extractPagination = (response: StandardApiResponse<any>): PaginationMeta | undefined => {
  return response.pagination;
};

export const isRetryableError = (error: unknown): boolean => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return (
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      error.message === 'Network Error'
    );
  }
  return false;
};

export interface RequestOptions {
  timeout?: number;
  retryAttempts?: number;
}

export const makeRequest = async <T,>(
  method: string,
  url: string,
  data?: any,
  options: RequestOptions = {}
): Promise<StandardApiResponse<T>> => {
  const client = getApiClient();

  try {
    const config = {
      method,
      url,
      data,
      timeout: options.timeout || DEFAULT_CONFIG.timeout,
    };

    const response: AxiosResponse<StandardApiResponse<T>> = await client(config);
    const validated = validateStandardResponse<T>(response.data);
    return validated;
  } catch (error) {
    throw handleApiError(error);
  }
};

export const get = async <T,>(
  url: string,
  options?: RequestOptions
): Promise<StandardApiResponse<T>> => {
  return makeRequest<T>('GET', url, undefined, options);
};

export const post = async <T,>(
  url: string,
  data?: any,
  options?: RequestOptions
): Promise<StandardApiResponse<T>> => {
  return makeRequest<T>('POST', url, data, options);
};

export const put = async <T,>(
  url: string,
  data?: any,
  options?: RequestOptions
): Promise<StandardApiResponse<T>> => {
  return makeRequest<T>('PUT', url, data, options);
};

export const patch = async <T,>(
  url: string,
  data?: any,
  options?: RequestOptions
): Promise<StandardApiResponse<T>> => {
  return makeRequest<T>('PATCH', url, data, options);
};

export const del = async <T,>(
  url: string,
  options?: RequestOptions
): Promise<StandardApiResponse<T>> => {
  return makeRequest<T>('DELETE', url, undefined, options);
};
