/**
 * Unit tests for lib/reminders.ts — the reminders data access layer.
 *
 * Covers createReminder, listReminders, getReminder, updateReminder,
 * deleteReminder, and toggleReminderActive. Validates client-side input
 * validation, ownership checks, exact SDK call args, and error propagation.
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
const Query = appwriteModule.Query;
const ID = appwriteModule.ID;
const Permission = appwriteModule.Permission;
const Role = appwriteModule.Role;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { config } = require('../appwrite');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  createReminder,
  listReminders,
  getReminder,
  updateReminder,
  deleteReminder,
  toggleReminderActive,
} = require('../reminders');

const drivenMocks = [
  databaseInstance.listDocuments,
  databaseInstance.createDocument,
  databaseInstance.updateDocument,
  databaseInstance.getDocument,
  databaseInstance.deleteDocument,
  Query.equal,
  ID.unique,
];

const sessionUserId = 'user-1';
const otherUserId = 'user-2';

const validInput = {
  description: 'Buy milk',
  locationSource: 'current' as const,
  locationLabel: 'Home',
  latitude: 40.7128,
  longitude: -74.006,
};

const expectedPermissions = [
  'read("user:user-1")',
  'update("user:user-1")',
  'delete("user:user-1")',
];

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    $id: 'rem-1',
    userId: sessionUserId,
    ...overrides,
  };
}

describe('reminders', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    drivenMocks.forEach((fn) => fn.mockReset());
    Query.equal.mockReturnValue('Q:equal');
    ID.unique.mockReturnValue('gen-id');
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // createReminder
  // ---------------------------------------------------------------------------
  describe('createReminder', () => {
    it('creates a document with session userId, trimmed description, active default true, and permissions', async () => {
      const created = { $id: 'rem-1', active: true };
      databaseInstance.createDocument.mockResolvedValue(created);

      const result = await createReminder(
        {
          ...validInput,
          description: '  Buy milk  ',
        },
        sessionUserId
      );

      expect(ID.unique).toHaveBeenCalled();
      expect(databaseInstance.createDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'gen-id',
        {
          userId: sessionUserId,
          description: 'Buy milk',
          locationSource: 'current',
          locationLabel: 'Home',
          latitude: 40.7128,
          longitude: -74.006,
          active: true,
        },
        expectedPermissions
      );
      expect(result).toBe(created);
    });

    it('passes explicit active: false through', async () => {
      const created = { $id: 'rem-1', active: false };
      databaseInstance.createDocument.mockResolvedValue(created);

      await createReminder({ ...validInput, active: false }, sessionUserId);

      expect(databaseInstance.createDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'gen-id',
        expect.objectContaining({ active: false }),
        expectedPermissions
      );
    });

    it('derives userId from the session and ignores any caller-supplied userId', async () => {
      const created = { $id: 'rem-1', active: true };
      databaseInstance.createDocument.mockResolvedValue(created);

      await createReminder(
        { ...validInput, userId: 'attacker' } as typeof validInput,
        sessionUserId
      );

      expect(databaseInstance.createDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'gen-id',
        expect.objectContaining({ userId: sessionUserId }),
        expectedPermissions
      );
    });

    it('rejects an empty description before touching the SDK', async () => {
      await expect(
        createReminder({ ...validInput, description: '' }, sessionUserId)
      ).rejects.toThrow('Invalid description: description is required');
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only description before touching the SDK', async () => {
      await expect(
        createReminder({ ...validInput, description: '   ' }, sessionUserId)
      ).rejects.toThrow('Invalid description: description is required');
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rejects a description longer than 2000 characters', async () => {
      await expect(
        createReminder(
          { ...validInput, description: 'x'.repeat(2001) },
          sessionUserId
        )
      ).rejects.toThrow(
        'Invalid description: description must be at most 2000 characters'
      );
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rejects an invalid locationSource before touching the SDK', async () => {
      await expect(
        createReminder(
          {
            ...validInput,
            locationSource: 'invalid' as 'current' | 'map',
          },
          sessionUserId
        )
      ).rejects.toThrow('Invalid locationSource: must be one of current, map');
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('rejects out-of-range latitude before touching the SDK', async () => {
      await expect(
        createReminder({ ...validInput, latitude: 91 }, sessionUserId)
      ).rejects.toThrow(
        'Invalid latitude: must be a finite number between -90 and 90'
      );
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('rejects non-finite longitude before touching the SDK', async () => {
      await expect(
        createReminder({ ...validInput, longitude: NaN }, sessionUserId)
      ).rejects.toThrow(
        'Invalid longitude: must be a finite number between -180 and 180'
      );
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-string locationLabel before touching the SDK', async () => {
      await expect(
        createReminder(
          { ...validInput, locationLabel: 123 as unknown as string },
          sessionUserId
        )
      ).rejects.toThrow('Invalid locationLabel: locationLabel must be a string');
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('rejects a locationLabel longer than 255 characters', async () => {
      await expect(
        createReminder(
          { ...validInput, locationLabel: 'x'.repeat(256) },
          sessionUserId
        )
      ).rejects.toThrow(
        'Invalid locationLabel: locationLabel must be at most 255 characters'
      );
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean active before touching the SDK', async () => {
      await expect(
        createReminder(
          { ...validInput, active: 'true' as unknown as boolean },
          sessionUserId
        )
      ).rejects.toThrow('Invalid active: active must be a boolean');
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('rejects an empty sessionUserId before touching the SDK', async () => {
      await expect(
        createReminder(validInput, '')
      ).rejects.toThrow('Invalid sessionUserId: sessionUserId is required');
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-string sessionUserId before touching the SDK', async () => {
      await expect(
        createReminder(validInput, 123 as unknown as string)
      ).rejects.toThrow('Invalid sessionUserId: sessionUserId must be a string');
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('rejects a sessionUserId longer than 64 characters', async () => {
      await expect(
        createReminder(validInput, 'x'.repeat(65))
      ).rejects.toThrow(
        'Invalid sessionUserId: sessionUserId must be at most 64 characters'
      );
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('rethrows a generic error when createDocument rejects', async () => {
      databaseInstance.createDocument.mockRejectedValue(
        new Error('network error')
      );

      await expect(createReminder(validInput, sessionUserId)).rejects.toThrow(
        'Failed to create reminder'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // listReminders
  // ---------------------------------------------------------------------------
  describe('listReminders', () => {
    it('calls listDocuments with Query.equal(userId, ...) and returns .documents', async () => {
      const docs = [{ $id: 'r1' }, { $id: 'r2' }];
      databaseInstance.listDocuments.mockResolvedValue({ documents: docs });

      const result = await listReminders(sessionUserId);

      expect(Query.equal).toHaveBeenCalledWith('userId', sessionUserId);
      expect(databaseInstance.listDocuments).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        ['Q:equal']
      );
      expect(result).toBe(docs);
    });

    it('returns an empty array when the query yields no documents', async () => {
      databaseInstance.listDocuments.mockResolvedValue({ documents: [] });

      const result = await listReminders(sessionUserId);

      expect(result).toEqual([]);
    });

    it('rejects an empty userId before touching the SDK', async () => {
      await expect(listReminders('')).rejects.toThrow(
        'Invalid userId: userId is required'
      );
      expect(databaseInstance.listDocuments).not.toHaveBeenCalled();
    });

    it('rethrows a generic error when listDocuments rejects', async () => {
      databaseInstance.listDocuments.mockRejectedValue(
        new Error('permission denied')
      );

      await expect(listReminders(sessionUserId)).rejects.toThrow(
        'Failed to list reminders'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getReminder
  // ---------------------------------------------------------------------------
  describe('getReminder', () => {
    it('returns the document when it belongs to the session user', async () => {
      const doc = makeDocument();
      databaseInstance.getDocument.mockResolvedValue(doc);

      const result = await getReminder('rem-1', sessionUserId);

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

      await expect(getReminder('rem-1', sessionUserId)).rejects.toThrow(
        'Reminder not found'
      );
    });

    it('maps SDK not-found errors to Reminder not found', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('Document not found')
      );

      await expect(getReminder('rem-1', sessionUserId)).rejects.toThrow(
        'Reminder not found'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rethrows a generic error for non-not-found SDK failures', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('User (role: guests) missing scope')
      );

      await expect(getReminder('rem-1', sessionUserId)).rejects.toThrow(
        'Failed to load reminder'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects an empty id before touching the SDK', async () => {
      await expect(getReminder('', sessionUserId)).rejects.toThrow(
        'Invalid id: id is required'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-string id before touching the SDK', async () => {
      await expect(
        getReminder(123 as unknown as string, sessionUserId)
      ).rejects.toThrow('Invalid id: id must be a string');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
    });

    it('rejects an id longer than 64 characters', async () => {
      await expect(getReminder('x'.repeat(65), sessionUserId)).rejects.toThrow(
        'Invalid id: id must be at most 64 characters'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
    });

    it('rejects an empty sessionUserId before touching the SDK', async () => {
      await expect(getReminder('rem-1', '')).rejects.toThrow(
        'Invalid sessionUserId: sessionUserId is required'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-string sessionUserId before touching the SDK', async () => {
      await expect(
        getReminder('rem-1', 123 as unknown as string)
      ).rejects.toThrow('Invalid sessionUserId: sessionUserId must be a string');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
    });

    it('rejects a sessionUserId longer than 64 characters', async () => {
      await expect(getReminder('rem-1', 'x'.repeat(65))).rejects.toThrow(
        'Invalid sessionUserId: sessionUserId must be at most 64 characters'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // updateReminder
  // ---------------------------------------------------------------------------
  describe('updateReminder', () => {
    it('updates a document that belongs to the session user with a trimmed description patch', async () => {
      const updated = { $id: 'rem-1', description: 'Buy eggs' };
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      const result = await updateReminder(
        'rem-1',
        {
          description: '  Buy eggs  ',
        },
        sessionUserId
      );

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

    it('updates a document with a partial patch including active', async () => {
      const updated = { $id: 'rem-1', active: false };
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      const result = await updateReminder(
        'rem-1',
        { active: false },
        sessionUserId
      );

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1',
        { active: false }
      );
      expect(result).toBe(updated);
    });

    it('updates a document with all supported fields', async () => {
      const updated = { $id: 'rem-1' };
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      await updateReminder(
        'rem-1',
        {
          description: 'New desc',
          locationSource: 'map',
          locationLabel: 'Store',
          latitude: 51.5074,
          longitude: -0.1278,
          active: true,
        },
        sessionUserId
      );

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1',
        {
          description: 'New desc',
          locationSource: 'map',
          locationLabel: 'Store',
          latitude: 51.5074,
          longitude: -0.1278,
          active: true,
        }
      );
    });

    it('skips undefined fields in the patch', async () => {
      const updated = { $id: 'rem-1' };
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      await updateReminder(
        'rem-1',
        { description: 'Only this' },
        sessionUserId
      );

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1',
        { description: 'Only this' }
      );
    });

    it('rejects an empty description patch before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', { description: '' }, sessionUserId)
      ).rejects.toThrow('Invalid description: description is required');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only description patch before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', { description: '   ' }, sessionUserId)
      ).rejects.toThrow('Invalid description: description is required');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects a description patch longer than 2000 characters', async () => {
      await expect(
        updateReminder(
          'rem-1',
          { description: 'x'.repeat(2001) },
          sessionUserId
        )
      ).rejects.toThrow(
        'Invalid description: description must be at most 2000 characters'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects an invalid locationSource patch before touching the SDK', async () => {
      await expect(
        updateReminder(
          'rem-1',
          {
            locationSource: 'invalid' as 'current' | 'map',
          },
          sessionUserId
        )
      ).rejects.toThrow('Invalid locationSource: must be one of current, map');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects out-of-range latitude patch before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', { latitude: -91 }, sessionUserId)
      ).rejects.toThrow(
        'Invalid latitude: must be a finite number between -90 and 90'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects non-finite longitude patch before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', { longitude: Infinity }, sessionUserId)
      ).rejects.toThrow(
        'Invalid longitude: must be a finite number between -180 and 180'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-string locationLabel patch before touching the SDK', async () => {
      await expect(
        updateReminder(
          'rem-1',
          { locationLabel: 123 as unknown as string },
          sessionUserId
        )
      ).rejects.toThrow('Invalid locationLabel: locationLabel must be a string');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects a locationLabel patch longer than 255 characters', async () => {
      await expect(
        updateReminder(
          'rem-1',
          { locationLabel: 'x'.repeat(256) },
          sessionUserId
        )
      ).rejects.toThrow(
        'Invalid locationLabel: locationLabel must be at most 255 characters'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean active patch before touching the SDK', async () => {
      await expect(
        updateReminder(
          'rem-1',
          { active: 'false' as unknown as boolean },
          sessionUserId
        )
      ).rejects.toThrow('Invalid active: active must be a boolean');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects an empty id before touching the SDK', async () => {
      await expect(
        updateReminder('', { description: 'ok' }, sessionUserId)
      ).rejects.toThrow('Invalid id: id is required');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-string id before touching the SDK', async () => {
      await expect(
        updateReminder(123 as unknown as string, { description: 'ok' }, sessionUserId)
      ).rejects.toThrow('Invalid id: id must be a string');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects an id longer than 64 characters', async () => {
      await expect(
        updateReminder('x'.repeat(65), { description: 'ok' }, sessionUserId)
      ).rejects.toThrow('Invalid id: id must be at most 64 characters');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects an empty sessionUserId before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', { description: 'ok' }, '')
      ).rejects.toThrow('Invalid sessionUserId: sessionUserId is required');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-string sessionUserId before touching the SDK', async () => {
      await expect(
        updateReminder('rem-1', { description: 'ok' }, 123 as unknown as string)
      ).rejects.toThrow('Invalid sessionUserId: sessionUserId must be a string');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects a sessionUserId longer than 64 characters', async () => {
      await expect(
        updateReminder('rem-1', { description: 'ok' }, 'x'.repeat(65))
      ).rejects.toThrow(
        'Invalid sessionUserId: sessionUserId must be at most 64 characters'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects with Reminder not found when the document belongs to another user and does not call updateDocument', async () => {
      databaseInstance.getDocument.mockResolvedValue(
        makeDocument({ userId: otherUserId })
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' }, sessionUserId)
      ).rejects.toThrow('Reminder not found');
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('maps SDK getDocument not-found to Reminder not found and does not call updateDocument', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('Document not found')
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' }, sessionUserId)
      ).rejects.toThrow('Reminder not found');
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rethrows a generic error when updateDocument rejects', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockRejectedValue(
        new Error('network error')
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' }, sessionUserId)
      ).rejects.toThrow('Failed to update reminder');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rethrows a generic error when getDocument fails for a non-not-found reason', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('User (role: guests) missing scope')
      );

      await expect(
        updateReminder('rem-1', { description: 'ok' }, sessionUserId)
      ).rejects.toThrow('Failed to update reminder');
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteReminder
  // ---------------------------------------------------------------------------
  describe('deleteReminder', () => {
    it('deletes a document that belongs to the session user', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.deleteDocument.mockResolvedValue({});

      const result = await deleteReminder('rem-1', sessionUserId);

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
      await expect(deleteReminder('', sessionUserId)).rejects.toThrow(
        'Invalid id: id is required'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-string id before touching the SDK', async () => {
      await expect(
        deleteReminder(123 as unknown as string, sessionUserId)
      ).rejects.toThrow('Invalid id: id must be a string');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });

    it('rejects an id longer than 64 characters', async () => {
      await expect(deleteReminder('x'.repeat(65), sessionUserId)).rejects.toThrow(
        'Invalid id: id must be at most 64 characters'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });

    it('rejects an empty sessionUserId before touching the SDK', async () => {
      await expect(deleteReminder('rem-1', '')).rejects.toThrow(
        'Invalid sessionUserId: sessionUserId is required'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-string sessionUserId before touching the SDK', async () => {
      await expect(
        deleteReminder('rem-1', 123 as unknown as string)
      ).rejects.toThrow('Invalid sessionUserId: sessionUserId must be a string');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });

    it('rejects a sessionUserId longer than 64 characters', async () => {
      await expect(deleteReminder('rem-1', 'x'.repeat(65))).rejects.toThrow(
        'Invalid sessionUserId: sessionUserId must be at most 64 characters'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });

    it('rejects with Reminder not found when the document belongs to another user and does not call deleteDocument', async () => {
      databaseInstance.getDocument.mockResolvedValue(
        makeDocument({ userId: otherUserId })
      );

      await expect(deleteReminder('rem-1', sessionUserId)).rejects.toThrow(
        'Reminder not found'
      );
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
    });

    it('maps SDK getDocument not-found to Reminder not found and does not call deleteDocument', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('Document not found')
      );

      await expect(deleteReminder('rem-1', sessionUserId)).rejects.toThrow(
        'Reminder not found'
      );
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rethrows a generic error when deleteDocument rejects', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.deleteDocument.mockRejectedValue(
        new Error('network error')
      );

      await expect(deleteReminder('rem-1', sessionUserId)).rejects.toThrow(
        'Failed to delete reminder'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rethrows a generic error when getDocument fails for a non-not-found reason', async () => {
      databaseInstance.getDocument.mockRejectedValue(
        new Error('User (role: guests) missing scope')
      );

      await expect(deleteReminder('rem-1', sessionUserId)).rejects.toThrow(
        'Failed to delete reminder'
      );
      expect(databaseInstance.deleteDocument).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // toggleReminderActive
  // ---------------------------------------------------------------------------
  describe('toggleReminderActive', () => {
    it('calls updateReminder with active: false when the document is owned', async () => {
      const updated = { $id: 'rem-1', active: false };
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      const result = await toggleReminderActive('rem-1', false, sessionUserId);

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1',
        { active: false }
      );
      expect(result).toBe(updated);
    });

    it('calls updateReminder with active: true when the document is owned', async () => {
      const updated = { $id: 'rem-1', active: true };
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockResolvedValue(updated);

      const result = await toggleReminderActive('rem-1', true, sessionUserId);

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'rem-1',
        { active: true }
      );
      expect(result).toBe(updated);
    });

    it('rejects an empty id before touching the SDK', async () => {
      await expect(toggleReminderActive('', true, sessionUserId)).rejects.toThrow(
        'Invalid id: id is required'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean active before touching the SDK', async () => {
      await expect(
        toggleReminderActive('rem-1', 'true' as unknown as boolean, sessionUserId)
      ).rejects.toThrow('Invalid active: active must be a boolean');
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects an empty sessionUserId before touching the SDK', async () => {
      await expect(toggleReminderActive('rem-1', true, '')).rejects.toThrow(
        'Invalid sessionUserId: sessionUserId is required'
      );
      expect(databaseInstance.getDocument).not.toHaveBeenCalled();
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rejects with Reminder not found when the document belongs to another user', async () => {
      databaseInstance.getDocument.mockResolvedValue(
        makeDocument({ userId: otherUserId })
      );

      await expect(
        toggleReminderActive('rem-1', false, sessionUserId)
      ).rejects.toThrow('Reminder not found');
      expect(databaseInstance.updateDocument).not.toHaveBeenCalled();
    });

    it('rethrows a generic error when the underlying update rejects', async () => {
      databaseInstance.getDocument.mockResolvedValue(makeDocument());
      databaseInstance.updateDocument.mockRejectedValue(
        new Error('network error')
      );

      await expect(
        toggleReminderActive('rem-1', false, sessionUserId)
      ).rejects.toThrow('Failed to update reminder');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
