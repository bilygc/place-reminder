/**
 * Shared stub for `*.svg` imports, wired via jest moduleNameMapper
 * (`\\.svg$` -> this file) in package.json.
 *
 * jest-expo's default asset transformer would resolve SVG requires to the
 * number `1`, which breaks screens that render the imported SVG as a React
 * component (e.g. `<AppLogo .../>` from constants/images.ts). This stub
 * exports a no-op React component so those renders succeed, and the
 * constants/images.ts smoke test can assert the keys are truthy.
 */
const React = require('react');
function SvgMock(props) {
  return React.createElement('SvgMock', props);
}
module.exports = SvgMock;