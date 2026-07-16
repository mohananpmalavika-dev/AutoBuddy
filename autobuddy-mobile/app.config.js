// Load dotenv if available (optional). Some environments may not have it installed
// and attempting to require it should not crash the build process.
try {
  // eslint-disable-next-line global-require
  require('dotenv').config();
} catch (e) {
  // dotenv not installed or failed to load - continue without it
}

module.exports = ({ config }) => {
  try {
    const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
    const hasPlugin = (pluginName) =>
      plugins.some((entry) => (Array.isArray(entry) ? entry[0] === pluginName : entry === pluginName));

    // Only add optional plugins when their packages are declared.
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
    const hasDeclaredDependency = (name) =>
      Boolean(
        (projectPkg.dependencies && projectPkg.dependencies[name]) ||
          (projectPkg.devDependencies && projectPkg.devDependencies[name]),
      );

    if (!hasPlugin('expo-image') && hasDeclaredDependency('expo-image')) {
      plugins.push('expo-image');
    }
    if (
      !hasPlugin('@react-native-community/datetimepicker') &&
      hasDeclaredDependency('@react-native-community/datetimepicker')
    ) {
      plugins.push('@react-native-community/datetimepicker');
    }
    if (
      !hasPlugin('@stripe/stripe-react-native') &&
      hasDeclaredDependency('@stripe/stripe-react-native')
    ) {
      plugins.push(['@stripe/stripe-react-native', {}]);
    }

    return {
      ...config,
      plugins,
    };
  } catch (e) {
    return {
      ...config,
    };
  }
};
