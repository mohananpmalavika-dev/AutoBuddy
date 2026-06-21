// Load dotenv if available (optional). Some environments may not have it installed
// and attempting to require it should not crash the build process.
try {
  // eslint-disable-next-line global-require
  require('dotenv').config();
} catch (e) {
  // dotenv not installed or failed to load — continue without it
}

module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  try {
    const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
    const hasPlugin = (pluginName) =>
      plugins.some((entry) => (Array.isArray(entry) ? entry[0] === pluginName : entry === pluginName));

    // Helper: only add a plugin if the package is declared in package.json
    const fs = require('fs');
    const path = require('path');
    let projectPkg = {};
    try {
      const pkgPath = path.join(__dirname, 'package.json');
      if (fs.existsSync(pkgPath)) {
        projectPkg = require(pkgPath);
      }
    } catch (e) {
      projectPkg = {};
    }
    const hasDeclaredDependency = (name) => {
      return Boolean(
        (projectPkg.dependencies && projectPkg.dependencies[name]) ||
          (projectPkg.devDependencies && projectPkg.devDependencies[name])
      );
    };

    if (!hasPlugin('expo-image') && hasDeclaredDependency('expo-image')) {
      plugins.push('expo-image');
    }

    if (!hasPlugin('@react-native-community/datetimepicker') && hasDeclaredDependency('@react-native-community/datetimepicker')) {
      plugins.push('@react-native-community/datetimepicker');
    }

    if (!hasPlugin('@stripe/stripe-react-native') && hasDeclaredDependency('@stripe/stripe-react-native')) {
      plugins.push(['@stripe/stripe-react-native', {}]);
    }

    const mapsPluginIndex = plugins.findIndex((entry) =>
      Array.isArray(entry) ? entry[0] === 'react-native-maps' : entry === 'react-native-maps',
    );

    if (mapsPluginIndex >= 0) {
      const existing = plugins[mapsPluginIndex];
      const existingOptions = Array.isArray(existing) ? existing[1] || {} : {};
      plugins[mapsPluginIndex] = [
        'react-native-maps',
        {
          ...existingOptions,
          ...(googleMapsApiKey ? { androidGoogleMapsApiKey: googleMapsApiKey } : {}),
        },
      ];
    } else if (hasDeclaredDependency('react-native-maps')) {
      plugins.push([
        'react-native-maps',
        ...(googleMapsApiKey ? [{ androidGoogleMapsApiKey: googleMapsApiKey }] : []),
      ]);
    }

    return {
      ...config,
      plugins,
      android: {
        ...config.android,
        config: {
          ...(config.android?.config || {}),
          ...(googleMapsApiKey
            ? {
                googleMaps: {
                  ...config.android?.config?.googleMaps,
                  apiKey: googleMapsApiKey,
                },
              }
            : {}),
        },
      },
    };
  } catch (e) {
    // If plugin resolution fails for any reason, return base config unchanged
    return {
      ...config,
    };
  }
};
