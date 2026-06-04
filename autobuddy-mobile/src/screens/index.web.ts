import type { ComponentType } from 'react';

import AdminDashboardRaw from './AdminDashboard';
import AuthScreenRaw from './AuthScreen';
import DriverDashboardWeb from './DriverDashboard.web';
import OperatorDashboardRaw from './OperatorDashboard';
import PassengerMapWeb from './PassengerMap.web';
import type { AuthScreenProps, RoleScreenProps } from './types';

export const AuthScreen = AuthScreenRaw as ComponentType<AuthScreenProps>;
export const PassengerMap = PassengerMapWeb as ComponentType<RoleScreenProps>;
export const DriverDashboard = DriverDashboardWeb as ComponentType<RoleScreenProps>;
export const OperatorDashboard = OperatorDashboardRaw as ComponentType<RoleScreenProps>;
export const AdminDashboard = AdminDashboardRaw as ComponentType<RoleScreenProps>;
