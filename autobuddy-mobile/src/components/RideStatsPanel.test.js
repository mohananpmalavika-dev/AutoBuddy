import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import RideStatsPanel from './RideStatsPanel';
import { apiRequest } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiRequest: jest.fn(),
}));

describe('RideStatsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiRequest.mockResolvedValue({
      stats: {
        total_rides: 0,
        total_spent: 0,
        avg_fare: 0,
        total_distance_km: 0,
        avg_distance_km: 0,
      },
    });
  });

  it('requests passenger ride stats with the selected period as query params', async () => {
    render(<RideStatsPanel token="token-1" />);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/passengers/ride-stats', {
        token: 'token-1',
        query: { period: 'month' },
      });
    });
  });
});
