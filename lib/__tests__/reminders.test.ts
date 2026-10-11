/**
 * Unit tests for lib/reminders.ts — listReminders, getReminder,
 * updateReminder, deleteReminder, and toggleReminderActive.
 *
 * Covers:
 *  - Happy paths with exact SDK call args (incl. newest-first ordering).
 *  - Client-side validation rejecting before any SDK call.
 *  - Session-derived ownership (owner from account.get(), never caller input).
 *  - Failure paths: network errors, permission errors, and not-found
 *    mapping on get/update/delete.
 *
 * (`createReminder` itself lives in lib/appwrite.ts and is covered by
 * lib/__tests__/createReminder.test.ts.)
 */

// Non-empty placeholders so appwrite.ts module-level requireEnv() passes.
process.env.EXPO_PUBLIC_ENDPOINT = 'https://dummy.example/v1';
process.env.EXPO_PUBLIC_PLATFORM = 'com.dummy.app';
process.env.EXPO_PUBLIC_PROJECT_ID = 'dummy-project';
process.env.EXPO_PUBLIC_DATABASE_ID = 'dummy-db';
process.env.EXPO_PUBLIC_USER_COLLECTION_ID = 'dummy-users';
process.env.EXPO_PUBLIC_REMINDER_COLLECTION_ID = 'dummy-reminders';
process.env.EXPO_PUBLIC_STORAGE_ID = 'dummy-storage';

// Use the shared manual mock (no factory).
jest.mock('react-native-appwrite');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appwriteModule = require('react-native-appwrite');
const databaseInstance = appwriteModule.__database;
const accountInstance = appwriteModule.__account;
const Query = appwriteModule.Query;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { config } = require('../appwrite');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  listReminders,
  getReminder,
  updateReminder,
  deleteReminder,
  toggleReminderActive,
} = require('../reminders');

const sessionUserId = 'user-1';
const otherUserId = 'user-2';

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    $id: 'rem-1',
    userId: sessionUserId,
    description: 'Buy milk',
    locationSource: 'current',
    latitude: 40.7128,
    longitude: -74.006,
    active: true,
    $createdAt: '2026-01-01T00:00:00.000Z',
    $updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('reminders DAL (ATO-12 session-derived ownership)', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    databaseInstance.listDocuments.mockReset();
    databaseInstance.createDocument.mockReset();
    databaseInstance.updateDocument.mockReset();
    databaseInstance.getDocument.mockReset();
    databaseInstance.deleteDocument.mockReset();
    accountInstance.get.mockReset();
    // Default: signed in as the owner.
    accountInstance.get.mockResolvedValue({ $id: sessionUserId });
    Query.equal.mockReturnValue('Q:equal');
    Query.orderDesc.mockReturnValue('Q:orderDesc');
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // listReminders
  // ---------------------------------------------------------------------------
  describe('listReminders', () => {
    it('queries with userId equality AND newest-first ordering, returning documents', async () => {
      const docs = [makeDocument(), makeDocument({ $id: 'rem-2' })];
      databaseInstance.listDocuments.mockResolvedValue({ documents: docs });

      const result = await listReminders();

      expect(accountInstance.get).toHaveBeenCalled();
      expect(Query.equal).toHaveBeenCalledWith('userId', sessionUserId);
      expect(Query.orderDesc).toHaveBeenCalledWith('$createdAt');
      expect(databaseInstance.listDocuments).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        ['Q:equal', 'Q:orderDesc']
      );
      expect(result).toBe(docs);
    });

    it('returns an empty array when the query yields no documents', async () => {
      databaseInstance.listDocuments.mockResolvedValue({ documents: [] });

      await expect(listReminders()).resolves.toEqual([]);
    });

    it('throws a clear sign-in error when there is no active session', async () => {
      accountInstance.get.mockRejectedValue(
        new Error('User (role: guests) missing scope (account)')
      );

      await expect(listReminders()).rejects.toThrow(
        /no active session|sign in/i
      );
      expect(databaseInstance.listDocuments).not.toHaveBeenCalled();
    });

    it('maps a network error to Failed to list reminders', async () => {
      databaseInstance.listDocuments.mockRejectedValue(
        new Error('network error')
      );

      await expect(listReminders()).rejects.toThrow(
        'Failed to list reminders'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a permission error to Failed to list reminders', async () => {
      databaseInstance.listDocuments.mockRejectedValue(
        new Error('User (role: guests) missing scope (account)')
      );

      await expect(listReminders()).rejects.toThrow(
        'Failed to list reminders'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('does not log raw SDK detail in production but still throws the safe message', async () => {
      const originalDev = (globalThis as { __DEV__?: boolean }).__DEV__;
      (globalThis as { __DEV__?: boolean }).__DEV__ = false;
      try {
        databaseInstance.listDocuments.mockRejectedValue(
          new Error('User account-123 missing scope (account)')
        );

        await expect(listReminders()).rejects.toThrow(
          'Failed to list reminders'
        );
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      } finally {
        (globalThis as { __DEV__?: boolean }).__DEV__ = originalDev;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getReminder
  // ---------------------------------------------------------------------------
  describe('getReminder', () => {
    it('returns the document when it belongs to the signed-in user', async () => {
      const doc = makeDocument();
      databaseInstance.getDocument.mockResolvedValue(doc);

      const result = await getReminder('rem-1');

      expect(accountInstance.get).toHaveBeenCalled();
      expect(databaseInstance.getDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1'
      );
      expect(result).toBe(doc);
    });

    it('rejects with Reminder not found when the document belongs to another user', async () => {
      databaseInstance.getDocument.mockResolvedValue(
        makeDocument({ userId: otherUserId })
      );

      await expect(getReminder('rem-1')).rejects.toThrow('Reminder not found');
    });

    it('maps SDK not-found errors to Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('Document with the requested ID could not be found')
      );

      await expect(getReminder('rem-1')).rejects.toThrow('Reminder not found');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a foreign-document permission error to Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error(
          'User is not authorized to read document rem-1 (403 Forbidden)'
        )
      );

      await expect(getReminder('rem-1')).rejects.toThrow('Reminder not found');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('does NOT treat a transient error embedding digits (e.g. "4030ms") as permission-denied', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('Request timed out after 4030ms')
      );

      await expect(getReminder('rem-1')).rejects.toThrow(
        'Failed to load reminder'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a mid-read session expiry to the sign-in message, not Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('User (role: guests) missing scope (documents)')
      );

      const error = await getReminder('rem-1').catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/session expired.*sign in/i);
      expect(error.message).not.toBe('Reminder not found');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a network error to Failed to load reminder', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('network error')
      );

      await expect(getReminder('rem-1')).rejects.toThrow(
        'Failed to load reminder'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects an empty id before touching the SDK', async () => {
      await expect(getReminder('')).rejects.toThrow(
        'Invalid id: id is required'
      );
      expect(accountInstance.get).not.toHaveBeenCalled();
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('throws a clear sign-in error when there is no active session', async () => {
      accountInstance.get.mockRejectedValue(
        new Error('User (role: guests) missing scope (account)')
      );

      await expect(getReminder('rem-1')).rejects.toThrow(
        /no active session|sign in/i
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // updateReminder
  // ---------------------------------------------------------------------------
  describe('updateReminder', () => {
    it('updates an owned document with a trimmed description patch', async () => {
      const updated = makeDocument({ description: 'Buy eggs' });
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      const result = await updateReminder('rem-1', {
        description: '  Buy eggs  ',
      });

      expect(databaseInstance.getDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1'
      );
      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1',
        { description: 'Buy eggs' }
      );
      expect(result).toBe(updated);
    });

    it('sends only the fields present in the patch', async () => {
      const updated = makeDocument({ active: false });
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      await updateReminder('rem-1', { active: false });

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1',
        { active: false }
      );
    });

    it('rejects an empty description before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', { description: '' })
      ).rejects.toThrow(/description/i);
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only description before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', { description: '   ' })
      ).rejects.toThrow(/description/i);
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range latitude before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', { latitude: 91 })
      ).rejects.toThrow(/latitude|longitude/i);
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean active before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', {
          active: 'true' as unknown as boolean,
        })
      ).rejects.toThrow(/active/i);
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects with Reminder not found for a foreign document without calling updateDocument', async () => {
      databaseInstance.getDocument.mockResolvedValue(
        makeDocument({ userId: otherUserId })
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' })
      ).rejects.toThrow('Reminder not found');
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('maps getDocument not-found to Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('Document with the requested ID could not be found')
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' })
      ).rejects.toThrow('Reminder not found');
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a foreign-document permission error on the read step to Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error(
          'User is not authorized to read document rem-1 (403 Forbidden)'
        )
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' })
      ).rejects.toThrow('Reminder not found');
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a mid-read session expiry to the sign-in message, not Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('User (role: guests) missing scope (documents)')
      );

      const error = await updateReminder('rem-1', { description: 'ok' }).catch(
        (e: Error) => e
      );
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/session expired.*sign in/i);
      expect(error.message).not.toBe('Reminder not found');
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps an updateDocument network error to Failed to update reminder', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockRejectedValue(
        new Error('network error')
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' })
      ).rejects.toThrow('Failed to update reminder');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a permission error to Failed to update reminder', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockRejectedValue(
        new Error('User (role: guests) missing scope (account)')
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' })
      ).rejects.toThrow('Failed to update reminder');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('throws a clear sign-in error when there is no active session', async () => {
      accountInstance.get.mockRejectedValue(
        new Error('User (role: guests) missing scope (account)')
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' })
      ).rejects.toThrow(/no active session|sign in/i);
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteReminder
  // ---------------------------------------------------------------------------
  describe('deleteReminder', () => {
    it('deletes an owned document via fetch-verify-then-delete', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.deleteDocument.mockResolvedValue({});

      const result = await deleteReminder('rem-1');

      expect(databaseInstance.getDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1'
      );
      expect(databaseInstance.deleteDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1'
      );
      expect(result).toEqual({});
    });

    it('rejects an empty id before touching the SDK', async () => {
      await expect(deleteReminder('')).rejects.toThrow(
        'Invalid id: id is required'
      );
      expect(accountInstance.get).not.toHaveBeenCalled();
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });

    it('rejects with Reminder not found for a foreign document without calling deleteDocument', async () => {
      databaseInstance.getDocument.mockResolvedValue(
        makeDocument({ userId: otherUserId })
      );

      await expect(deleteReminder('rem-1')).rejects.toThrow(
        'Reminder not found'
      );
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });

    it('maps getDocument not-found to Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('Document with the requested ID could not be found')
      );

      await expect(deleteReminder('rem-1')).rejects.toThrow(
        'Reminder not found'
      );
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a foreign-document permission error on the read step to Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error(
          'User is not authorized to read document rem-1 (403 Forbidden)'
        )
      );

      await expect(deleteReminder('rem-1')).rejects.toThrow(
        'Reminder not found'
      );
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a mid-read session expiry to the sign-in message, not Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('User (role: guests) missing scope (documents)')
      );

      const error = await deleteReminder('rem-1').catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/session expired.*sign in/i);
      expect(error.message).not.toBe('Reminder not found');
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a deleteDocument network error to Failed to delete reminder', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.deleteDocument.mockRejectedValue(
        new Error('network error')
      );

      await expect(deleteReminder('rem-1')).rejects.toThrow(
        'Failed to delete reminder'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a permission error to Failed to delete reminder', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.deleteDocument.mockRejectedValue(
        new Error('User (role: guests) missing scope (account)')
      );

      await expect(deleteReminder('rem-1')).rejects.toThrow(
        'Failed to delete reminder'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('throws a clear sign-in error when there is no active session', async () => {
      accountInstance.get.mockRejectedValue(
        new Error('User (role: guests) missing scope (account)')
      );

      await expect(deleteReminder('rem-1')).rejects.toThrow(
        /no active session|sign in/i
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // toggleReminderActive
  // ---------------------------------------------------------------------------
  describe('toggleReminderActive', () => {
    it('delegates to updateReminder with active: false', async () => {
      const updated = makeDocument({ active: false });
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      const result = await toggleReminderActive('rem-1', false);

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1',
        { active: false }
      );
      expect(result).toBe(updated);
    });

    it('delegates to updateReminder with active: true', async () => {
      const updated = makeDocument({ active: true });
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      const result = await toggleReminderActive('rem-1', true);

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1',
        { active: true }
      );
      expect(result).toBe(updated);
    });

    it('rejects a non-boolean active before touching the SDK', async () => {
      await expect(
        toggleReminderActive('rem-1', 'true' as unknown as boolean)
      ).rejects.toThrow(/active/i);
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects with Reminder not found for a foreign document', async () => {
      databaseInstance.getDocument.mockResolvedValue(
        makeDocument({ userId: otherUserId })
      );

      await expect(toggleReminderActive('rem-1', false)).rejects.toThrow(
        'Reminder not found'
      );
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('maps an underlying update failure to Failed to update reminder', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockRejectedValue(
        new Error('network error')
      );

      await expect(toggleReminderActive('rem-1', false)).rejects.toThrow(
        'Failed to update reminder'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('maps a permission error to Failed to update reminder', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockRejectedValue(
        new Error('User (role: guests) missing scope (account)')
      );

      await expect(toggleReminderActive('rem-1', false)).rejects.toThrow(
        'Failed to update reminder'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('throws a clear sign-in error when there is no active session', async () => {
      accountInstance.get.mockRejectedValue(
        new Error('User (role: guests) missing scope (account)')
      );

      await expect(toggleReminderActive('rem-1', false)).rejects.toThrow(
        /no active session|sign in/i
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });
  });
});
