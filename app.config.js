// app.config.js
//
// Expo evaluates this file at config-resolution time (after loading .env files).
// It extends the static app.json values (received as the `config` argument)
// and overrides the react-native-maps plugin config with the real Google Maps
// API key from the environment, because app.json does not interpolate env vars.
//
// NOTE: this must stay a function that spreads the incoming `config` object.
// Expo marks that object internally to detect that the static app.json is in
// use; returning a plain object built from a fresh `require('./app.json')`
// drops the marker and makes `expo-doctor` report the static config as unused.
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

module.exports = function ({ config } = {}) {
  // `config` is the static app.json `expo` object already resolved by Expo.
  // Fall back to app.json from disk only when evaluated outside Expo.
  const base = config ?? appJson.expo;

  const plugins = (base.plugins ?? []).map((plugin) => {
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

  return {
    ...base,
    plugins,
  };
};
