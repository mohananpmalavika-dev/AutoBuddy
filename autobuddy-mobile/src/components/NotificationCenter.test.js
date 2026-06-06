import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import NotificationCenter from './NotificationCenter';
import { notificationService } from '../lib/notificationService';

const mockClearAll = jest.fn();
const mockAddNotification = jest.fn();
const mockMarkAsRead = jest.fn();
const mockRemoveNotification = jest.fn();
const mockSetIsInitialized = jest.fn();
let mockNotifications = [];

jest.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockNotifications.filter((notification) => !notification.read).length,
    addNotification: mockAddNotification,
    markAsRead: mockMarkAsRead,
    removeNotification: mockRemoveNotification,
    clearAll: mockClearAll,
    setIsInitialized: mockSetIsInitialized,
  }),
}));

jest.mock('../lib/notificationService', () => ({
  notificationService: {
    fetchNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    clearAll: jest.fn(),
  },
}));

function renderNotificationCenter() {
  return render(<NotificationCenter token="token-1" onClose={() => {}} />);
}

describe('NotificationCenter', () => {
  const originalPlatformOS = Platform.OS;
  const originalWindow = global.window;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });
    global.window = {
      ...(originalWindow || {}),
      confirm: jest.fn(() => true),
    };
    mockNotifications = [
      {
        id: 'notification-1',
        title: 'Ride Accepted',
        body: 'Test Driver accepted your ride.',
        read: false,
        created_at: '2026-06-06T12:00:00.000Z',
      },
    ];
    notificationService.fetchNotifications.mockResolvedValue(mockNotifications);
    notificationService.clearAll.mockResolvedValue(true);
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOS,
    });
    global.window = originalWindow;
  });

  it('clears all notifications on web after confirmation', async () => {
    const { getByText } = renderNotificationCenter();

    await waitFor(() => expect(getByText('Ride Accepted')).toBeTruthy(), { timeout: 10000 });

    fireEvent.press(getByText('Clear all'));

    expect(global.window.confirm).toHaveBeenCalledWith('Clear all notifications?');
    await waitFor(() => {
      expect(notificationService.clearAll).toHaveBeenCalledWith('token-1');
      expect(mockClearAll).toHaveBeenCalledTimes(1);
    });
  });
});
