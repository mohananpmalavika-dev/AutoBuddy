describe('module workflow integration (frontend)', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test/api';
  });

  function setupExpoAndRNMocks() {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {},
      expoConfig: { hostUri: 'https://example.test' },
      expoGoConfig: { debuggerHost: 'https://example.test' },
      manifest2: { extra: { expoClient: { hostUri: 'https://example.test' } } },
      manifest: { debuggerHost: 'https://example.test' },
    }));

    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));

    jest.doMock('./session', () => ({
      __esModule: true,
      loadSession: jest.fn(async () => ({
        refresh_token: 'refresh-123',
        token: 'expired-access',
      })),
      saveSession: jest.fn(async () => undefined),
      clearSession: jest.fn(async () => undefined),
    }));
    jest.doMock('./persistentSessionManager', () => ({
      __esModule: true,
      loadSession: jest.fn(async () => null),
      saveSession: jest.fn(async () => undefined),
      clearSession: jest.fn(async () => undefined),
    }));
  }

  it('retries once after 401 by refreshing access token (workflow)', async () => {
    const fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    setupExpoAndRNMocks();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiRequest } = require('./api');

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ detail: 'Invalid token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'new-access-456' }),
        json: async () => ({ access_token: 'new-access-456' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, from: 'retry' }),
      });

    const result = await apiRequest('/bookings', {
      token: 'expired-access',
      query: { page: 1 },
    });

    expect(result).toEqual({ ok: true, from: 'retry' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('serializes query params and omits empty values (workflow)', async () => {
    const fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    setupExpoAndRNMocks();

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiRequest } = require('./api');

    await apiRequest('/drivers/profile', {
      token: 'token-abc',
      query: { page: 2, q: 'airport', skip: '', emptyUndef: undefined, none: null },
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('drivers/profile?page=2');
    expect(url).toContain('q=airport');
    expect(url).not.toContain('skip=');
  });
});
