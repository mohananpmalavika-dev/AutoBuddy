import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SavedPlacesPanel from './SavedPlacesPanel';
import { apiRequest } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiRequest: jest.fn(),
}));

describe('SavedPlacesPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates a saved place via PUT', async () => {
    apiRequest.mockImplementation(async (path, options = {}) => {
      if (path === '/v1/passengers/saved-places' && (!options.method || options.method === 'GET')) {
        return [
          {
            id: 'place-1',
            name: 'Home',
            address: 'Old Address',
            place_type: 'home',
            is_primary: true,
          },
        ];
      }
      if (path === '/v1/passengers/saved-places/place-1' && options.method === 'PUT') {
        return { id: 'place-1' };
      }
      return [];
    });

    const { getByText, getByPlaceholderText } = render(
      <SavedPlacesPanel token="token-1" onUsePlace={() => {}} />,
    );

    await waitFor(() => expect(getByText('Edit')).toBeTruthy(), { timeout: 10000 });

    fireEvent.press(getByText('Edit'));
    fireEvent.changeText(getByPlaceholderText('Place name (e.g., Home, Work)'), 'New Home');
    fireEvent.changeText(getByPlaceholderText('Full address'), 'New Address');
    fireEvent.press(getByText('Update Place'));

    await waitFor(
      () => {
        const called = apiRequest.mock.calls.some(
          ([path, options]) =>
            path === '/v1/passengers/saved-places/place-1' &&
            options?.method === 'PUT' &&
            options?.token === 'token-1',
        );
        expect(called).toBe(true);
      },
      { timeout: 10000 },
    );
  });
});
