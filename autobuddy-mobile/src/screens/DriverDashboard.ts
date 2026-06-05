import { Platform } from 'react-native';
import DriverCommandPageNative from './DriverCommandPage.native';
import DriverCommandPageWeb from './DriverCommandPage.web';

const DriverDashboard = Platform.OS === 'web' ? DriverCommandPageWeb : DriverCommandPageNative;

export default DriverDashboard;
