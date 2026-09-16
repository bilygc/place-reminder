// app.config.js
//
// Expo evaluates this file at config-resolution time (after loading .env files).
// It imports the static app.json values and overrides the react-native-maps
// plugin config with the real Google Maps API key from the environment,
// because app.json does not interpolate env vars.
require('dotenv').config();

const appJson = require('./app.json');

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

if (!googleMapsApiKey || googleMapsApiKey.trim().length === 0) {
  throw new Error(
    'Missing required env var EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. ' +
      'Set it in your local .env file (see .env.example) or via EAS secrets ' +
      '(`eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value <key>`) ' +
      'and re-run. The react-native-maps plugin requires a non-empty ' +
      'androidGoogleMapsApiKey / iosGoogleMapsApiKey.'
  );
}

const plugins = appJson.expo.plugins.map((plugin) => {
  if (Array.isArray(plugin) && plugin[0] === 'react-native-maps') {
    return [
      plugin[0],
      {
        ...(plugin[1] || {}),
        androidGoogleMapsApiKey: googleMapsApiKey,
        iosGoogleMapsApiKey: googleMapsApiKey,
      },
    ];
  }
  return plugin;
});

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    plugins,
  },
};
