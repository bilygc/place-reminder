const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Forces `debuggableVariants = []` inside the `react { }` block of
 * android/app/build.gradle.
 *
 * By default, Expo's generated build.gradle skips JS bundling for the
 * 'debug' build variant — it expects a live Metro server instead. That's
 * fine for local development, but it means a CI-built debug APK (with no
 * Metro server available) installs fine and then crashes on launch with
 * "Unable to load script."
 *
 * Setting debuggableVariants = [] tells the React Native Gradle Plugin that
 * NO variant should be treated as "debuggable" for bundling purposes, so
 * even `assembleDebug` embeds the JS bundle and the app can run standalone.
 *
 * This must be a config plugin (not a manual edit to build.gradle) because
 * `expo prebuild --clean` regenerates that file from scratch every time.
 */
const withForceDebugBundle = (config) => {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    // Only patch if not already patched (idempotent across multiple
    // prebuild runs within the same plugin evaluation, and safe if someone
    // re-runs this without a --clean).
    if (contents.includes("debuggableVariants = []")) {
      return config;
    }

    // Insert debuggableVariants = [] right after the opening of the
    // `react {` block. This is a plain-text insertion, not a full Groovy
    // parse — matches the pattern Expo's own generated file always uses
    // for the block opener.
    const reactBlockPattern = /(react\s*\{)/;

    if (!reactBlockPattern.test(contents)) {
      throw new Error(
        "[withForceDebugBundle] Could not find 'react {' block in " +
          "android/app/build.gradle — the Expo template may have changed. " +
          "Update this config plugin's regex to match the new format."
      );
    }

    config.modResults.contents = contents.replace(
      reactBlockPattern,
      `$1\n    debuggableVariants = [] // [withForceDebugBundle] force JS bundle into all build variants, including debug\n`
    );

    return config;
  });
};

module.exports = withForceDebugBundle;