import { Platform } from 'react-native';
import PassengerMapNative from './PassengerMap.native';
import PassengerMapWeb from './PassengerMap.web';

const PassengerMap = Platform.OS === 'web' ? PassengerMapWeb : PassengerMapNative;

export default PassengerMap;
