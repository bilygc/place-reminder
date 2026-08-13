/**
 * Barrel smoke tests — one cheap assertion per re-export index.ts to confirm
 * each barrel resolves and exports the expected component.
 *
 * Note: Auth is wrapped in mobx-react-lite's observer(), which returns an
 * object (not a plain function), so we assert truthiness rather than
 * typeof === 'function' for it. CustomButton and FormField are plain
 * function components.
 */
import { Auth } from '@/components/Auth';
import CustomButton from '@/components/CustomButton';
import { FormField } from '@/components/FormField';

describe('component barrels', () => {
  it('components/Auth/index.ts re-exports Auth (an observer component)', () => {
    expect(Auth).toBeTruthy();
    // observer() returns a React component object (has $$typeof).
    expect(typeof Auth === 'function' || typeof Auth === 'object').toBe(true);
  });

  it('components/CustomButton/index.ts default-exports CustomButton as a function', () => {
    expect(typeof CustomButton).toBe('function');
  });

  it('components/FormField/index.ts re-exports FormField as a function', () => {
    expect(typeof FormField).toBe('function');
  });
});