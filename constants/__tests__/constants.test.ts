/**
 * Smoke tests for the constants barrel.
 *
 * Covers:
 *  - icons.ts exports exactly 9 keys (eye, eyeHide, home, alertOn, alertOff,
 *    activateReminder, deactivateReminder, deleteReminder, mic), all truthy
 *    (PNG requires resolve to a number via jest-expo's asset transformer).
 *  - images.ts exports the expected keys (AppLogo, Icon); AppLogo is an SVG
 *    import mapped to the svgMock component (truthy), Icon is a PNG require
 *    (truthy).
 *  - index.ts barrel re-exports { images, icons }.
 */
import images from '../images';
import icons from '../icons';
import * as constants from '../index';

describe('constants/icons', () => {
  it('exports exactly 9 keys', () => {
    expect(Object.keys(icons).sort()).toEqual(
      [
        'activateReminder',
        'alertOff',
        'alertOn',
        'deactivateReminder',
        'deleteReminder',
        'eye',
        'eyeHide',
        'home',
        'mic',
      ].sort()
    );
  });

  it('has truthy values for every key', () => {
    for (const key of Object.keys(icons)) {
      expect(icons[key as keyof typeof icons]).toBeTruthy();
    }
  });
});

describe('constants/images', () => {
  it('exports the AppLogo and Icon keys', () => {
    expect(Object.keys(images).sort()).toEqual(['AppLogo', 'Icon']);
  });

  it('has truthy values for every key', () => {
    expect(images.AppLogo).toBeTruthy();
    expect(images.Icon).toBeTruthy();
  });
});

describe('constants/index (barrel)', () => {
  it('re-exports images and icons', () => {
    expect(constants.images).toBe(images);
    expect(constants.icons).toBe(icons);
  });
});