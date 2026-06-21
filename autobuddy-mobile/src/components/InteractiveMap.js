import { Platform } from 'react-native';
import WebInteractiveMap from './WebInteractiveMap';

// In the Expo file-resolution system, .web.js files are automatically used on web,
// and .native.js files are used on native platforms.
// This file is the web version - it delegates to the Leaflet-based WebInteractiveMap.
export default WebInteractiveMap;
