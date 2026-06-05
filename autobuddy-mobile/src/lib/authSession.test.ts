import { normalizeAuthSessionFromPayload } from './authSession';

describe('normalizeAuthSessionFromPayload', () => {
  const user = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    phone: '9876543210',
    role: 'driver',
  };

  it('normalizes standard API auth responses', () => {
    expect(
      normalizeAuthSessionFromPayload({
        access_token: 'access-123',
        refresh_token: 'refresh-123',
        user,
      }),
    ).toMatchObject({
      token: 'access-123',
      refresh_token: 'refresh-123',
      user,
    });
  });

  it('normalizes camelCase and nested Google auth responses', () => {
    expect(
      normalizeAuthSessionFromPayload({
        data: {
          accessToken: 'google-access-123',
          refreshToken: 'google-refresh-123',
          user,
        },
      }),
    ).toMatchObject({
      token: 'google-access-123',
      refresh_token: 'google-refresh-123',
      user,
    });
  });

  it('rejects responses without an app access token', () => {
    expect(
      normalizeAuthSessionFromPayload({
        google_id_token: 'provider-token-only',
        user,
      }),
    ).toBeNull();
  });
});
