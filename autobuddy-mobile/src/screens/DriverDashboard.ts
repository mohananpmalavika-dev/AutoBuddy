import { Platform } from 'react-native';
import DriverDashboardNative from './DriverDashboard.native';
import DriverDashboardWeb from './DriverDashboard.web';

const DriverDashboard = Platform.OS === 'web' ? DriverDashboardWeb : DriverDashboardNative;

export default DriverDashboard;
