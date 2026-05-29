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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./api') as typeof import('./api');
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
});
