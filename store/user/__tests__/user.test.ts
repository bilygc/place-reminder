/// <reference types="jest" />
/**
 * Unit tests for the MobX `User` store class.
 *
 * `app/index.tsx` calls `configure({ enforceActions: 'observed' })` at module
 * scope, but we deliberately do NOT import app/index here (it pulls in
 * reanimated / expo-router / native UI). Instead we configure MobX explicitly
 * in this file so the store is exercised under the same mutation discipline
 * the app enforces, and so accidental out-of-action mutations would surface.
 */
import { configure } from 'mobx';

import { User } from '../user';
import type { UserData } from '../user.types';

// Match the runtime config from app/index.tsx without importing it.
configure({ enforceActions: 'observed' });

const sampleUserData: UserData = {
  session: { $id: 'acc-123', isLoggedIn: true },
  email: 'alice@example.com',
  userName: 'alice',
  avatar: 'https://example.com/avatar.png',
};

function makeUser() {
  return new User();
}

describe('User store', () => {
  describe('initial state', () => {
    it('is logged out', () => {
      expect(makeUser().isLoggedIn).toBe(false);
    });

    it('has an empty userId', () => {
      expect(makeUser().userId).toBe('');
    });

    it('has empty email, userName, and avatar', () => {
      const user = makeUser();
      expect(user.email).toBe('');
      expect(user.userName).toBe('');
      expect(user.avatar).toBe('');
    });

    it('returns a full userData snapshot reflecting the defaults', () => {
      const user = makeUser();
      expect(user.userData).toEqual({
        session: { $id: '', isLoggedIn: false },
        email: '',
        userName: '',
        avatar: '',
      });
    });
  });

  describe('login()', () => {
    it('sets isLoggedIn from the session', () => {
      const user = makeUser();
      user.login(sampleUserData);
      expect(user.isLoggedIn).toBe(true);
    });

    it('exposes the session id via the userId getter', () => {
      const user = makeUser();
      user.login(sampleUserData);
      expect(user.userId).toBe('acc-123');
    });

    it('exposes email, userName, and avatar getters', () => {
      const user = makeUser();
      user.login(sampleUserData);
      expect(user.email).toBe('alice@example.com');
      expect(user.userName).toBe('alice');
      expect(user.avatar).toBe('https://example.com/avatar.png');
    });

    it('returns the full userData snapshot after login', () => {
      const user = makeUser();
      user.login(sampleUserData);
      expect(user.userData).toEqual(sampleUserData);
    });

    it('reflects a logged-out session id as empty userId', () => {
      const user = makeUser();
      user.login({ ...sampleUserData, session: { $id: '', isLoggedIn: false } });
      expect(user.isLoggedIn).toBe(false);
      expect(user.userId).toBe('');
    });
  });

  describe('logout()', () => {
    it('clears all fields back to the defaults', () => {
      const user = makeUser();
      user.login(sampleUserData);
      user.logout();
      expect(user.isLoggedIn).toBe(false);
      expect(user.userId).toBe('');
      expect(user.email).toBe('');
      expect(user.userName).toBe('');
      expect(user.avatar).toBe('');
    });

    it('resets the userData snapshot to the default shape', () => {
      const user = makeUser();
      user.login(sampleUserData);
      user.logout();
      expect(user.userData).toEqual({
        session: { $id: '', isLoggedIn: false },
        email: '',
        userName: '',
        avatar: '',
      });
    });
  });

  describe('login -> logout -> login cycle', () => {
    it('restores the latest logged-in data after a logout', () => {
      const user = makeUser();
      user.login(sampleUserData);
      expect(user.isLoggedIn).toBe(true);

      user.logout();
      expect(user.isLoggedIn).toBe(false);
      expect(user.userId).toBe('');

      const second: UserData = {
        session: { $id: 'acc-456', isLoggedIn: true },
        email: 'bob@example.com',
        userName: 'bob',
        avatar: 'https://example.com/bob.png',
      };
      user.login(second);
      expect(user.isLoggedIn).toBe(true);
      expect(user.userId).toBe('acc-456');
      expect(user.email).toBe('bob@example.com');
      expect(user.userName).toBe('bob');
      expect(user.avatar).toBe('https://example.com/bob.png');
      expect(user.userData).toEqual(second);
    });

    it('login replaces (not merges) the previous data', () => {
      const user = makeUser();
      user.login(sampleUserData);
      user.login({
        session: { $id: 'acc-789', isLoggedIn: true },
        email: 'carol@example.com',
        userName: 'carol',
        avatar: 'https://example.com/carol.png',
      });
      // No leftover alice data.
      expect(user.userData).toEqual({
        session: { $id: 'acc-789', isLoggedIn: true },
        email: 'carol@example.com',
        userName: 'carol',
        avatar: 'https://example.com/carol.png',
      });
    });
  });

  describe('userData snapshot isolation', () => {
    it('returns a fresh copy each time (mutating it does not affect the store)', () => {
      const user = makeUser();
      user.login(sampleUserData);
      const snap1 = user.userData;
      const snap2 = user.userData;
      // Different object references (spread copies)...
      expect(snap1).not.toBe(snap2);
      expect(snap1.session).not.toBe(snap2.session);
      // ...but equal by value.
      expect(snap1).toEqual(snap2);

      // Mutating the snapshot must not leak into the store.
      snap1.session.$id = 'tampered';
      snap1.email = 'tampered@example.com';
      expect(user.userId).toBe('acc-123');
      expect(user.email).toBe('alice@example.com');
    });
  });
});