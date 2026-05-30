module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
  const hasPlugin = (pluginName) =>
    plugins.some((entry) => (Array.isArray(entry) ? entry[0] === pluginName : entry === pluginName));

  if (!hasPlugin('expo-image')) {
    plugins.push('expo-image');
  }

  if (!hasPlugin('@react-native-community/datetimepicker')) {
    plugins.push('@react-native-community/datetimepicker');
  }

  if (!hasPlugin('@stripe/stripe-react-native')) {
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
  } else {
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
};
