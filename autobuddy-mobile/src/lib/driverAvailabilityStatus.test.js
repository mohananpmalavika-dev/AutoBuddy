import {
  buildDriverAvailabilityState,
  hasDriverAvailabilitySnapshot,
  hasLiveLocationSignal,
  readDriverAvailability,
  toDriverLocationApiBody,
} from './driverAvailabilityStatus';

describe('driverAvailabilityStatus', () => {
  it('lets positive online status win over stale false flags', () => {
    expect(
      readDriverAvailability({
        is_available: false,
        is_online: false,
        availability_status: 'online',
      }),
    ).toBe(true);
  });

  it('reads nested API response shapes', () => {
    const payload = {
      data: {
        driver: {
          online_status: 'available',
        },
      },
    };

    expect(hasDriverAvailabilitySnapshot(payload)).toBe(true);
    expect(readDriverAvailability(payload)).toBe(true);
  });

  it('treats live driver location as an online signal', () => {
    const liveLocation = {
      latitude: 10.123456,
      longitude: 76.123456,
      address: 'Live location',
    };

    expect(hasLiveLocationSignal(liveLocation)).toBe(true);
    expect(
      buildDriverAvailabilityState({
        serverIsOnline: false,
        localIsOnline: false,
        driverLocation: liveLocation,
      }),
    ).toMatchObject({
      isOnline: true,
      label: 'ONLINE & READY',
      tone: 'online',
    });
  });

  it('treats an address-only live location as an online signal', () => {
    const liveLocation = {
      address: 'Live location',
    };

    expect(hasLiveLocationSignal(liveLocation)).toBe(true);
    expect(
      buildDriverAvailabilityState({
        serverIsOnline: false,
        localIsOnline: false,
        driverLocation: liveLocation,
      }),
    ).toMatchObject({
      isOnline: true,
      label: 'ONLINE & READY',
      tone: 'online',
    });
  });

  it('stays offline when every signal is negative', () => {
    expect(
      buildDriverAvailabilityState({
        serverIsOnline: false,
        localIsOnline: false,
        driverLocation: null,
      }),
    ).toMatchObject({
      isOnline: false,
      label: 'OFFLINE',
      tone: 'offline',
    });
  });

  it('does not render offline while an online sync is queued', () => {
    expect(
      buildDriverAvailabilityState({
        serverIsOnline: false,
        localIsOnline: true,
        availabilityPendingDesired: true,
        availabilitySyncPending: true,
      }),
    ).toMatchObject({
      isOnline: true,
      label: 'GOING ONLINE...',
      tone: 'syncing',
    });
  });

  it('keeps a queued online change from showing offline when sync is paused', () => {
    expect(
      buildDriverAvailabilityState({
        serverIsOnline: false,
        localIsOnline: false,
        availabilityPendingDesired: true,
        availabilitySyncPending: false,
        availabilityToggleInFlight: false,
      }),
    ).toMatchObject({
      isOnline: false,
      label: 'GOING ONLINE...',
      status: 'going_online',
    });
  });

  it('strips UI-only fields from the driver location API body', () => {
    expect(
      toDriverLocationApiBody({
        latitude: 10.123456,
        longitude: 76.123456,
        address: 'Live location',
        is_live_location: true,
        updated_at: new Date().toISOString(),
        heading: 180,
        speed: 20,
        accuracy: 5,
        ride_id: 'ride-123',
        timestamp: '2026-06-02T12:00:00.000Z',
      }),
    ).toEqual({
      latitude: 10.123456,
      longitude: 76.123456,
      address: 'Live location',
      speed: 20,
      accuracy: 5,
      ride_id: 'ride-123',
      timestamp: '2026-06-02T12:00:00.000Z',
    });
  });
});
