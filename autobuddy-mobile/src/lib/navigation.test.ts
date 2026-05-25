import { resolveRoleScreenKey } from './navigation';

describe('resolveRoleScreenKey', () => {
  it('returns passenger for passenger role', () => {
    expect(resolveRoleScreenKey('passenger')).toBe('passenger');
  });

  it('returns driver for driver role', () => {
    expect(resolveRoleScreenKey('driver')).toBe('driver');
  });

  it('returns admin for admin role', () => {
    expect(resolveRoleScreenKey('admin')).toBe('admin');
  });
});
