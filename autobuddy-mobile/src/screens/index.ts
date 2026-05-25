import type { ComponentType } from 'react';

import AdminDashboardRaw from './AdminDashboard';
import AuthScreenRaw from './AuthScreen';
import DriverDashboardRaw from './DriverDashboard';
import PassengerMapRaw from './PassengerMap';
import type { AuthScreenProps, RoleScreenProps } from './types';

export const AuthScreen = AuthScreenRaw as ComponentType<AuthScreenProps>;
export const PassengerMap = PassengerMapRaw as ComponentType<RoleScreenProps>;
export const DriverDashboard = DriverDashboardRaw as ComponentType<RoleScreenProps>;
export const AdminDashboard = AdminDashboardRaw as ComponentType<RoleScreenProps>;
