/**
 * Shared stub for `*.css` imports, wired via jest moduleNameMapper
 * (`\\.css$` -> this file) in package.json.
 *
 * app/_layout.tsx imports '../global.css' for NativeWind. Without a stub,
 * jest would try to parse the CSS as JS and fail. This returns an empty
 * object so the import is a no-op at test time.
 */
module.exports = {};