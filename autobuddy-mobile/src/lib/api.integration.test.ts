describe('apiRequest integration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test/api';
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function loadApiModule() {
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
    return import('./api');
  }

  it('sends auth header and query params', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    });
    const { apiRequest } = await loadApiModule();

    await apiRequest('/bookings', {
      token: 'token-123',
      query: { page: 2, q: 'airport', skip: '' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/bookings?page=2&q=airport');
    expect(requestInit.method).toBe('GET');
    expect(requestInit.headers).toMatchObject({
      Authorization: 'Bearer token-123',
      Accept: 'application/json',
    });
  });

  it('throws typed error details for non-2xx responses', async () => {
    const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ detail: 'Too many requests' }),
    });
    const { apiRequest } = await loadApiModule();

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
    const { apiRequest } = await loadApiModule();

    await expect(apiRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      message: 'body.password: String should have at least 8 characters',
      status: 422,
    });
  });
});
