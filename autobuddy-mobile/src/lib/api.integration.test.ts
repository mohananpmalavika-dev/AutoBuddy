describe('apiRequest integration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test/api';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function loadApiModule() {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {},
    }));
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('./session', () => ({
      loadSession: jest.fn(async () => null),
      saveSession: jest.fn(async () => undefined),
      clearSession: jest.fn(async () => undefined),
    }));
    jest.doMock('./persistentSessionManager', () => ({
      loadSession: jest.fn(async () => null),
      saveSession: jest.fn(async () => undefined),
      clearSession: jest.fn(async () => undefined),
      extendSessionExpiry: jest.fn(async () => undefined),
      isSessionValid: jest.fn(async () => false),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./api') as typeof import('./api');
  }

  function makeJwt(expSeconds: number) {
    const encode = (payload: Record<string, unknown>) => Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: expSeconds, type: 'access' })}.signature`;
  }

  it('sends auth header and query params', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    });
    const { apiRequest } = loadApiModule();

    await apiRequest('/bookings', {
      token: 'token-123',
      query: { page: 2, q: 'airport', skip: '' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/bookings?page=2&q=airport');
    expect(requestInit.method).toBe('GET');
    expect(requestInit.cache).toBe('no-store');
    expect(requestInit.headers).toMatchObject({
      Authorization: 'Bearer token-123',
      Accept: 'application/json',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    });
  });

  it('extends the persistent session after successful authenticated requests', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    });
    const extendSessionExpiry = jest.fn(async () => undefined);

    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {},
    }));
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('./session', () => ({
      loadSession: jest.fn(async () => ({ token: 'token-123' })),
      saveSession: jest.fn(async () => undefined),
      clearSession: jest.fn(async () => undefined),
    }));
    jest.doMock('./persistentSessionManager', () => ({
      loadSession: jest.fn(async () => null),
      saveSession: jest.fn(async () => undefined),
      clearSession: jest.fn(async () => undefined),
      extendSessionExpiry,
      isSessionValid: jest.fn(async () => false),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiRequest } = require('./api') as typeof import('./api');

    await apiRequest('/drivers/profile', { token: 'token-123' });

    expect(extendSessionExpiry).toHaveBeenCalledTimes(1);
  });

  it('supports older method-first callers without wrapping the response', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ requirements: [{ id: 'license' }] }),
    });
    const { apiRequest } = loadApiModule();

    const result = await apiRequest('GET', '/api/admin/documents/requirements');

    expect(result).toEqual({ requirements: [{ id: 'license' }] });
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/admin/documents/requirements');
    expect(requestInit.method).toBe('GET');
  });

  it('throws typed error details for non-2xx responses', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ detail: 'Too many requests' }),
    });
    const { apiRequest } = loadApiModule();

    await expect(apiRequest('/drivers/profile')).rejects.toMatchObject({
      message: 'Too many requests',
      status: 429,
    });
  });

  it('coalesces duplicate in-flight GET requests', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    let resolveFetch: (value: unknown) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { apiRequest } = loadApiModule();

    const firstRequest = apiRequest('/bookings', { token: 'token-123' });
    const secondRequest = apiRequest('/bookings', { token: 'token-123' });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch({
      ok: true,
      text: async () => JSON.stringify([{ id: 'booking-1' }]),
    });

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      [{ id: 'booking-1' }],
      [{ id: 'booking-1' }],
    ]);
  });

  it('locally cools down repeated GET requests after a 429', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name === 'Retry-After' ? '60' : null) },
      text: async () => JSON.stringify({ detail: 'Too many requests' }),
    });
    const { apiRequest } = loadApiModule();

    await expect(apiRequest('/bookings/active')).rejects.toMatchObject({
      message: 'Too many requests',
      status: 429,
    });
    await expect(apiRequest('/bookings/active')).rejects.toMatchObject({
      status: 429,
      rateLimitCooldown: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('formats validation array details into a readable message', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          detail: [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters' }],
        }),
    });
    const { apiRequest } = loadApiModule();

    await expect(apiRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      message: 'body.password: String should have at least 8 characters',
      status: 422,
    });
  });

  it('does not attach stale bearer tokens to Google auth requests', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    });

    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {},
    }));
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('./session', () => ({
      loadSession: jest.fn(async () => ({ token: 'old-token' })),
      saveSession: jest.fn(async () => undefined),
      clearSession: jest.fn(async () => undefined),
    }));
    jest.doMock('./persistentSessionManager', () => ({
      loadSession: jest.fn(async () => ({ token: 'old-token' })),
      saveSession: jest.fn(async () => undefined),
      clearSession: jest.fn(async () => undefined),
      extendSessionExpiry: jest.fn(async () => undefined),
      isSessionValid: jest.fn(async () => true),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiRequest } = require('./api') as typeof import('./api');

    await apiRequest('/auth/google', {
      method: 'POST',
      body: { google_id_token: 'new-google-token' },
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.headers).not.toMatchObject({
      Authorization: expect.any(String),
    });
  });

  it('does not refresh the app session when Google auth returns 401', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: jest.fn() },
      text: async () => JSON.stringify({ detail: 'Invalid Google login token' }),
    });

    const clearPersistentSession = jest.fn(async () => undefined);
    const clearLegacySession = jest.fn(async () => undefined);

    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {},
    }));
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('./session', () => ({
      loadSession: jest.fn(async () => ({ token: 'old-token', refresh_token: 'old-refresh' })),
      saveSession: jest.fn(async () => undefined),
      clearSession: clearLegacySession,
    }));
    jest.doMock('./persistentSessionManager', () => ({
      loadSession: jest.fn(async () => ({ token: 'old-token', refresh_token: 'old-refresh' })),
      saveSession: jest.fn(async () => undefined),
      clearSession: clearPersistentSession,
      extendSessionExpiry: jest.fn(async () => undefined),
      isSessionValid: jest.fn(async () => true),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiRequest } = require('./api') as typeof import('./api');

    await expect(
      apiRequest('/auth/google', {
        method: 'POST',
        body: { google_id_token: 'bad-google-token', mode: 'register' },
      }),
    ).rejects.toMatchObject({
      message: 'Invalid Google login token',
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearPersistentSession).not.toHaveBeenCalled();
    expect(clearLegacySession).not.toHaveBeenCalled();
  });

  it('refreshes an expired JWT before sending protected requests', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    const expiredToken = makeJwt(Math.floor(Date.now() / 1000) - 60);
    const freshToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: freshToken }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      });

    const savePersistentSession = jest.fn(async () => undefined);
    const saveLegacySession = jest.fn(async () => undefined);

    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {},
    }));
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('./session', () => ({
      loadSession: jest.fn(async () => ({ token: expiredToken, refresh_token: 'refresh-token' })),
      saveSession: saveLegacySession,
      clearSession: jest.fn(async () => undefined),
    }));
    jest.doMock('./persistentSessionManager', () => ({
      loadSession: jest.fn(async () => ({ token: expiredToken, refresh_token: 'refresh-token' })),
      saveSession: savePersistentSession,
      clearSession: jest.fn(async () => undefined),
      extendSessionExpiry: jest.fn(async () => undefined),
      isSessionValid: jest.fn(async () => true),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiRequest } = require('./api') as typeof import('./api');

    await apiRequest('/drivers/profile', { token: expiredToken });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/auth/refresh');
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      refresh_token: 'refresh-token',
    });
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${freshToken}`,
    });
    expect(savePersistentSession).toHaveBeenCalledWith(expect.objectContaining({ token: freshToken }));
    expect(saveLegacySession).toHaveBeenCalledWith(expect.objectContaining({ token: freshToken }));
  });

  it('preserves stored sessions when a locally valid token cannot be refreshed', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: 'Invalid token' }),
    });

    const clearLegacySession = jest.fn(async () => undefined);
    const clearPersistentSession = jest.fn(async () => undefined);

    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {},
    }));
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('./session', () => ({
      loadSession: jest.fn(async () => ({ token: 'expired-access' })),
      saveSession: jest.fn(async () => undefined),
      clearSession: clearLegacySession,
    }));
    jest.doMock('./persistentSessionManager', () => ({
      loadSession: jest.fn(async () => ({ token: 'expired-access' })),
      saveSession: jest.fn(async () => undefined),
      clearSession: clearPersistentSession,
      extendSessionExpiry: jest.fn(async () => undefined),
      isSessionValid: jest.fn(async () => true),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiRequest } = require('./api') as typeof import('./api');

    await expect(apiRequest('/drivers/profile', { token: 'expired-access' })).rejects.toMatchObject({
      message: 'Could not confirm your login right now. Keeping your session active.',
      status: 401,
      code: 'AUTH_RETRY_REQUIRED',
      authExpired: false,
      sessionPreserved: true,
    });
    expect(clearLegacySession).not.toHaveBeenCalled();
    expect(clearPersistentSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears stored sessions when no locally valid session can be preserved', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: 'Invalid token' }),
    });

    const clearLegacySession = jest.fn(async () => undefined);
    const clearPersistentSession = jest.fn(async () => undefined);

    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {},
    }));
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('./session', () => ({
      loadSession: jest.fn(async () => null),
      saveSession: jest.fn(async () => undefined),
      clearSession: clearLegacySession,
    }));
    jest.doMock('./persistentSessionManager', () => ({
      loadSession: jest.fn(async () => null),
      saveSession: jest.fn(async () => undefined),
      clearSession: clearPersistentSession,
      extendSessionExpiry: jest.fn(async () => undefined),
      isSessionValid: jest.fn(async () => false),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiRequest } = require('./api') as typeof import('./api');

    await expect(apiRequest('/drivers/profile', { token: 'expired-access' })).rejects.toMatchObject({
      message: 'Session expired. Please log in again.',
      status: 401,
      code: 'AUTH_EXPIRED',
      authExpired: true,
    });
    expect(clearLegacySession).toHaveBeenCalledTimes(1);
    expect(clearPersistentSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
