import { NavigationContainerRef } from '@react-navigation/native';
import * as React from 'react';

export const navigationRef = React.createRef<NavigationContainerRef<any>>();

/**
 * Navigate to a specific route
 */
export const navigate = (name: string, params?: any) => {
  navigationRef.current?.navigate(name, params);
};

/**
 * Navigate and replace (removes previous route from stack)
 */
export const replace = (name: string, params?: any) => {
  navigationRef.current?.reset({
    index: 0,
    routes: [{ name, params }],
  });
};

/**
 * Go back to previous screen
 */
export const goBack = () => {
  navigationRef.current?.goBack();
};

/**
 * Reset navigation stack to initial state
 */
export const reset = (name: string, params?: any) => {
  navigationRef.current?.reset({
    index: 0,
    routes: [{ name, params }],
  });
};

/**
 * Get current route
 */
export const getCurrentRoute = () => {
  return navigationRef.current?.getCurrentRoute();
};

/**
 * Check if user can go back
 */
export const canGoBack = () => {
  return navigationRef.current?.canGoBack();
};

/**
 * Navigate to login screen
 */
export const navigateToLogin = () => {
  reset('Auth');
};

/**
 * Navigate to driver dashboard
 */
export const navigateToDriverDashboard = () => {
  reset('App');
};

/**
 * Navigate to passenger dashboard
 */
export const navigateToPassengerDashboard = () => {
  reset('App');
};

/**
 * Navigate to specific feature
 */
export const navigateToFeature = (feature: string, params?: any) => {
  navigate(feature, params);
};

/**
 * Create deep link
 */
export const createDeepLink = (routeName: string, params?: any): string => {
  const baseUrl = 'autobuddy://';
  const paramString = params
    ? `?${Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value as string)}`)
        .join('&')}`
    : '';
  return `${baseUrl}${routeName}${paramString}`;
};

/**
 * Handle deep linking
 */
export const handleDeepLink = (url: string) => {
  const deepLinkStart = 'autobuddy://';

  if (url.includes(deepLinkStart)) {
    const routeName = url.replace(deepLinkStart, '').split('?')[0];
    const params = new URLSearchParams(url.split('?')[1] || '');
    const paramsObj: Record<string, any> = {};

    params.forEach((value, key) => {
      paramsObj[key] = value;
    });

    navigate(routeName, paramsObj);
    return true;
  }

  return false;
};

/**
 * Navigation Stack Management
 */
export const navigationStack = {
  push: (name: string, params?: any) => navigate(name, params),
  pop: () => goBack(),
  popToTop: () => reset('Root'),
  replace: (name: string, params?: any) => replace(name, params),
};

/**
 * Route Configuration
 */
export const routes = {
  // Auth
  LOGIN: 'Login',
  SIGNUP: 'Signup',

  // Driver
  DRIVER_DASHBOARD: 'DriverDashboard',
  VEHICLE_MANAGEMENT: 'VehicleManagement',
  ROUTE_OPTIMIZATION: 'RouteOptimization',
  RIDE_POOLING: 'RidePooling',
  INCENTIVES: 'Incentives',
  DRIVER_PERFORMANCE: 'DriverPerformance',

  // Passenger
  PASSENGER_DASHBOARD: 'PassengerDashboard',
  RIDE_BOOKING: 'RideBooking',
  INSURANCE: 'Insurance',

  // Financial
  WALLET: 'Financial',
  EXPENSES: 'Expenses',
  RECEIPTS: 'Receipts',
  REFERRALS: 'Referrals',

  // Analytics
  ANALYTICS: 'Analytics',

  // Support
  SUPPORT: 'Support',
  MODERATION: 'Moderation',

  // Settings
  SETTINGS: 'Settings',
  LANGUAGE: 'Language',
  ACCESSIBILITY: 'Accessibility',

  // Features
  VIDEO_CALL: 'VideoCall',
};

export default {
  navigate,
  replace,
  goBack,
  reset,
  getCurrentRoute,
  canGoBack,
  navigateToLogin,
  navigateToDriverDashboard,
  navigateToPassengerDashboard,
  navigateToFeature,
  createDeepLink,
  handleDeepLink,
  navigationStack,
  routes,
};
