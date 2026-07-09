/**
 * API Client Test Suite
 * Tests for authentication, request handling, error handling, and token refresh
 */

import axios, { AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest, setAuthToken, clearAuthToken } from '../../services/apiClient';

// Mock dependencies
jest.mock('axios');
jest.mock('@react-native-async-storage/async-storage');
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  describe('apiRequest', () => {
    it('should make successful GET request', async () => {
      const mockData = { id: 1, name: 'Test User' };
      mockedAxios.request.mockResolvedValueOnce({ 
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await apiRequest('GET', '/users/me');

      expect(result).toEqual(mockData);
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/users/me'),
        })
      );
    });

    it('should make successful POST request with data', async () => {
      const requestData = { email: 'test@example.com', password: 'password123' };
      const responseData = { access_token: 'token123', user: { id: 1 } };
      
      mockedAxios.request.mockResolvedValueOnce({ 
        data: responseData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await apiRequest('POST', '/auth/login', requestData);

      expect(result).toEqual(responseData);
      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: requestData,
        })
      );
    });

    it('should include authorization header when token exists', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('test-token-123');
      
      mockedAxios.request.mockResolvedValueOnce({ 
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await apiRequest('GET', '/protected-route');

      expect(mockedAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        })
      );
    });

    it('should handle 401 unauthorized and attempt token refresh', async () => {
      // Setup: stored tokens
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('expired-access-token')
        .mockResolvedValueOnce('valid-refresh-token');

      // First call fails with 401
      const unauthorizedError: Partial<AxiosError> = {
        response: {
          status: 401,
          data: { detail: 'Token expired' },
          statusText: 'Unauthorized',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed with status code 401',
      };

      // Second call (refresh) succeeds
      const refreshResponse = { 
        data: { access_token: 'new-token-456' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      // Third call (retry original) succeeds
      const successResponse = { 
        data: { success: true, data: 'protected data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      };

      mockedAxios.request
        .mockRejectedValueOnce(unauthorizedError)
        .mockResolvedValueOnce(refreshResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await apiRequest('GET', '/protected-route');

      expect(result).toEqual({ success: true, data: 'protected data' });
      expect(mockedAxios.request).toHaveBeenCalledTimes(3);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('authToken', 'new-token-456');
    });

    it('should handle 404 not found error', async () => {
      const notFoundError: Partial<AxiosError> = {
        response: {
          status: 404,
          data: { detail: 'Resource not found' },
          statusText: 'Not Found',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed with status code 404',
      };

      mockedAxios.request.mockRejectedValueOnce(notFoundError);

      await expect(apiRequest('GET', '/non-existent')).rejects.toThrow();
    });

    it('should handle network error gracefully', async () => {
      const networkError = new Error('Network Error');
      mockedAxios.request.mockRejectedValueOnce(networkError);

      await expect(apiRequest('GET', '/test')).rejects.toThrow('Network Error');
    });

    it('should handle timeout error', async () => {
      const timeoutError: Partial<AxiosError> = {
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded',
        config: {} as any,
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
      };

      mockedAxios.request.mockRejectedValueOnce(timeoutError);

      await expect(apiRequest('GET', '/slow-endpoint')).rejects.toThrow();
    });

    it('should handle 500 server error', async () => {
      const serverError: Partial<AxiosError> = {
        response: {
          status: 500,
          data: { detail: 'Internal server error' },
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed with status code 500',
      };

      mockedAxios.request.mockRejectedValueOnce(serverError);

      await expect(apiRequest('GET', '/error-prone')).rejects.toThrow();
    });
  });

  describe('setAuthToken', () => {
    it('should store auth token in AsyncStorage', async () => {
      await setAuthToken('new-token-789');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('authToken', 'new-token-789');
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
        new Error('Storage quota exceeded')
      );

      await expect(setAuthToken('token')).rejects.toThrow();
    });
  });

  describe('clearAuthToken', () => {
    it('should remove auth token from AsyncStorage', async () => {
      await clearAuthToken();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('authToken');
    });

    it('should remove refresh token as well', async () => {
      await clearAuthToken();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('request retry logic', () => {
    it('should not retry on 400 bad request', async () => {
      const badRequestError: Partial<AxiosError> = {
        response: {
          status: 400,
          data: { detail: 'Bad request' },
          statusText: 'Bad Request',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed with status code 400',
      };

      mockedAxios.request.mockRejectedValueOnce(badRequestError);

      await expect(apiRequest('POST', '/invalid-data', {})).rejects.toThrow();
      expect(mockedAxios.request).toHaveBeenCalledTimes(1); // No retry
    });

    it('should handle refresh token failure and logout', async () => {
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('expired-access-token')
        .mockResolvedValueOnce('invalid-refresh-token');

      const unauthorizedError: Partial<AxiosError> = {
        response: {
          status: 401,
          data: { detail: 'Token expired' },
          statusText: 'Unauthorized',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed with status code 401',
      };

      const refreshError: Partial<AxiosError> = {
        response: {
          status: 401,
          data: { detail: 'Invalid refresh token' },
          statusText: 'Unauthorized',
          headers: {},
          config: {} as any,
        },
        config: {} as any,
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
        message: 'Request failed with status code 401',
      };

      mockedAxios.request
        .mockRejectedValueOnce(unauthorizedError)
        .mockRejectedValueOnce(refreshError);

      await expect(apiRequest('GET', '/protected')).rejects.toThrow();
      
      // Should clear tokens on refresh failure
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('authToken');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple simultaneous requests', async () => {
      const responses = [
        { data: { id: 1 }, status: 200, statusText: 'OK', headers: {}, config: {} as any },
        { data: { id: 2 }, status: 200, statusText: 'OK', headers: {}, config: {} as any },
        { data: { id: 3 }, status: 200, statusText: 'OK', headers: {}, config: {} as any },
      ];

      mockedAxios.request
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2]);

      const results = await Promise.all([
        apiRequest('GET', '/users/1'),
        apiRequest('GET', '/users/2'),
        apiRequest('GET', '/users/3'),
      ]);

      expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
      expect(mockedAxios.request).toHaveBeenCalledTimes(3);
    });
  });
});
