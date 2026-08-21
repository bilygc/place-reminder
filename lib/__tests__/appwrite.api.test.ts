/**
 * Comprehensive unit tests for lib/appwrite.ts — every exported function
 * not already covered by getCurrentUser.test.ts (happy-path only) or
 * appwrite.smoke.test.ts (config validation + live ping + input validation).
 *
 * Covers:
 *  - getAllPosts / getLatestPosts / getUserPosts / searchPosts /
 *    getBookmarkedPosts: database.listDocuments call args (databaseId,
 *    collectionId, Query builders), .documents return, empty-result,
 *    error propagation (console.error + rethrow).
 *  - signOut: success resolves; account.deleteSession rejects -> rethrow.
 *  - getFilePreview: video / image / unsupported-type branches; falsy-result
 *    guard; error propagation.
 *  - bookmarkVideo: add (append) and remove (filter) branches; error path.
 *  - createUser: happy path (account.create -> signIn -> createDocument);
 *    account.create rejects -> wrapped rethrow; account.create resolves
 *    falsy -> throw.
 *  - signIn: exact SDK call args; success returns session; reject path.
 *  - getCurrentUser error paths: account.get() rejects; account.get()
 *    succeeds but database.listDocuments rejects.
 *  - requireEnv(): missing / whitespace-only env var throws at import time
 *    mentioning the var name (via jest.isolateModules).
 *
 * The react-native-appwrite SDK is fully mocked via the shared manual mock
 * at `__mocks__/react-native-appwrite.js` (no real network, no real
 * credentials). Non-empty placeholder env vars are set only so appwrite.ts's
 * module-level requireEnv() config validation passes at import time.
 */

// Non-empty placeholders so appwrite.ts module-level requireEnv() passes.
// No real values needed — every SDK call is mocked below.
process.env.EXPO_PUBLIC_ENDPOINT = 'https://dummy.example/v1';
process.env.EXPO_PUBLIC_PLATFORM = 'com.dummy.app';
process.env.EXPO_PUBLIC_PROJECT_ID = 'dummy-project';
process.env.EXPO_PUBLIC_DATABASE_ID = 'dummy-db';
process.env.EXPO_PUBLIC_USER_COLLECTION_ID = 'dummy-users';
process.env.EXPO_PUBLIC_REMINDER_COLLECTION_ID = 'dummy-reminders';
process.env.EXPO_PUBLIC_STORAGE_ID = 'dummy-storage';

// Use the shared manual mock (no factory) — see __mocks__/react-native-appwrite.js.
jest.mock('react-native-appwrite');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appwriteModule = require('react-native-appwrite');
const accountInstance = appwriteModule.__account;
const databaseInstance = appwriteModule.__database;
const storageInstance = appwriteModule.__storage;
const avatarsInstance = appwriteModule.__avatars;
const Query = appwriteModule.Query;
const ID = appwriteModule.ID;
const ImageGravity = appwriteModule.ImageGravity;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  config,
  getAllPosts,
  getLatestPosts,
  getUserPosts,
  searchPosts,
  getBookmarkedPosts,
  signOut,
  getFilePreview,
  bookmarkVideo,
  createUser,
  signIn,
  getCurrentUser,
} = require('../appwrite');

/**
 * Every mock fn we drive from tests. Reset in beforeEach so
 * mockResolvedValue / mockReturnValue from one test can't leak into another.
 */
const drivenMocks = [
  accountInstance.get,
  accountInstance.create,
  accountInstance.createEmailPasswordSession,
  accountInstance.deleteSession,
  databaseInstance.listDocuments,
  databaseInstance.createDocument,
  databaseInstance.updateDocument,
  storageInstance.getFileView,
  storageInstance.getFilePreview,
  avatarsInstance.getInitials,
  Query.equal,
  Query.orderDesc,
  Query.contains,
  Query.search,
  ID.unique,
];

describe('appwrite.api', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    drivenMocks.forEach((fn) => fn.mockReset());
    // Give Query builders identifiable return values so the exact query
    // array passed to listDocuments can be asserted precisely.
    Query.orderDesc.mockReturnValue('Q:orderDesc');
    Query.equal.mockReturnValue('Q:equal');
    Query.contains.mockReturnValue('Q:contains');
    Query.search.mockReturnValue('Q:search');
    ID.unique.mockReturnValue('gen-id');
    // Silence console.error — every error path in appwrite.ts calls it.
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // getAllPosts
  // ---------------------------------------------------------------------------
  describe('getAllPosts', () => {
    it('calls listDocuments with databaseId, reminderCollectionId, empty queries and returns .documents', async () => {
      const docs = [{ $id: 'r1' }, { $id: 'r2' }];
      databaseInstance.listDocuments.mockResolvedValue({ documents: docs });

      const result = await getAllPosts();

      expect(databaseInstance.listDocuments).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        []
      );
      expect(result).toBe(docs);
    });

    it('returns an empty array when the query yields no documents', async () => {
      databaseInstance.listDocuments.mockResolvedValue({ documents: [] });

      const result = await getAllPosts();

      expect(result).toEqual([]);
    });

    it('rethrows a wrapped error when listDocuments rejects', async () => {
      databaseInstance.listDocuments.mockRejectedValue(
        new Error('db unavailable')
      );

      await expect(getAllPosts()).rejects.toThrow('db unavailable');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getLatestPosts
  // ---------------------------------------------------------------------------
  describe('getLatestPosts', () => {
    it('calls listDocuments with orderDesc($createdAt) and returns .documents', async () => {
      const docs = [{ $id: 'r1' }];
      databaseInstance.listDocuments.mockResolvedValue({ documents: docs });

      const result = await getLatestPosts();

      expect(Query.orderDesc).toHaveBeenCalledWith('$createdAt');
      expect(databaseInstance.listDocuments).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        ['Q:orderDesc']
      );
      expect(result).toBe(docs);
    });

    it('returns an empty array when the query yields no documents', async () => {
      databaseInstance.listDocuments.mockResolvedValue({ documents: [] });

      const result = await getLatestPosts();

      expect(result).toEqual([]);
    });

    it('rethrows a wrapped error when listDocuments rejects', async () => {
      databaseInstance.listDocuments.mockRejectedValue(
        new Error('db unavailable')
      );

      await expect(getLatestPosts()).rejects.toThrow('db unavailable');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getUserPosts
  // ---------------------------------------------------------------------------
  describe('getUserPosts', () => {
    it('calls listDocuments with equal(creator, userId) + orderDesc($createdAt) and returns .documents', async () => {
      const docs = [{ $id: 'r1' }];
      databaseInstance.listDocuments.mockResolvedValue({ documents: docs });

      const result = await getUserPosts('user-1');

      expect(Query.equal).toHaveBeenCalledWith('creator', 'user-1');
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

      const result = await getUserPosts('user-1');

      expect(result).toEqual([]);
    });

    it('rethrows a wrapped error when listDocuments rejects', async () => {
      databaseInstance.listDocuments.mockRejectedValue(
        new Error('db unavailable')
      );

      await expect(getUserPosts('user-1')).rejects.toThrow('db unavailable');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // searchPosts
  // ---------------------------------------------------------------------------
  describe('searchPosts', () => {
    it('calls listDocuments with search(title, query) and returns .documents', async () => {
      const docs = [{ $id: 'r1' }];
      databaseInstance.listDocuments.mockResolvedValue({ documents: docs });

      const result = await searchPosts('reminder');

      expect(Query.search).toHaveBeenCalledWith('title', 'reminder');
      expect(databaseInstance.listDocuments).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        ['Q:search']
      );
      expect(result).toBe(docs);
    });

    it('returns an empty array when the query yields no documents', async () => {
      databaseInstance.listDocuments.mockResolvedValue({ documents: [] });

      const result = await searchPosts('nothing');

      expect(result).toEqual([]);
    });

    it('rethrows a wrapped error when listDocuments rejects', async () => {
      databaseInstance.listDocuments.mockRejectedValue(
        new Error('db unavailable')
      );

      await expect(searchPosts('reminder')).rejects.toThrow('db unavailable');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getBookmarkedPosts
  // ---------------------------------------------------------------------------
  describe('getBookmarkedPosts', () => {
    it('calls listDocuments with contains(bookmarkedByUserId, userId) + orderDesc($createdAt) and returns .documents', async () => {
      const docs = [{ $id: 'r1' }];
      databaseInstance.listDocuments.mockResolvedValue({ documents: docs });

      const result = await getBookmarkedPosts('user-1');

      expect(Query.contains).toHaveBeenCalledWith('bookmarkedByUserId', 'user-1');
      expect(Query.orderDesc).toHaveBeenCalledWith('$createdAt');
      expect(databaseInstance.listDocuments).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        ['Q:contains', 'Q:orderDesc']
      );
      expect(result).toBe(docs);
    });

    it('returns an empty array when the query yields no documents', async () => {
      databaseInstance.listDocuments.mockResolvedValue({ documents: [] });

      const result = await getBookmarkedPosts('user-1');

      expect(result).toEqual([]);
    });

    it('rethrows a wrapped error when listDocuments rejects', async () => {
      databaseInstance.listDocuments.mockRejectedValue(
        new Error('db unavailable')
      );

      await expect(getBookmarkedPosts('user-1')).rejects.toThrow(
        'db unavailable'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // signOut
  // ---------------------------------------------------------------------------
  describe('signOut', () => {
    it('calls account.deleteSession with "current" and returns the result', async () => {
      accountInstance.deleteSession.mockResolvedValue({ $id: 'current' });

      const result = await signOut();

      expect(accountInstance.deleteSession).toHaveBeenCalledWith('current');
      expect(result).toEqual({ $id: 'current' });
    });

    it('rethrows a wrapped error when deleteSession rejects', async () => {
      accountInstance.deleteSession.mockRejectedValue(
        new Error('no active session')
      );

      await expect(signOut()).rejects.toThrow('no active session');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getFilePreview
  // ---------------------------------------------------------------------------
  describe('getFilePreview', () => {
    it('calls storage.getFileView for video type and returns the URL', async () => {
      const url = 'https://files.example/video-1';
      storageInstance.getFileView.mockResolvedValue(url);

      const result = await getFilePreview('file-1', 'video');

      expect(storageInstance.getFileView).toHaveBeenCalledWith(
        config.storageId,
        'file-1'
      );
      expect(result).toBe(url);
    });

    it('calls storage.getFilePreview for image type with dimensions, gravity, and quality', async () => {
      const url = 'https://files.example/image-1';
      storageInstance.getFilePreview.mockResolvedValue(url);

      const result = await getFilePreview('file-1', 'image');

      expect(storageInstance.getFilePreview).toHaveBeenCalledWith(
        config.storageId,
        'file-1',
        2000,
        2000,
        ImageGravity.Top,
        100
      );
      expect(result).toBe(url);
    });

    it('throws "Invalid file type" for unsupported types', async () => {
      await expect(
        getFilePreview('file-1', 'other' as 'video' | 'image')
      ).rejects.toThrow('Invalid file type');

      expect(storageInstance.getFileView).not.toHaveBeenCalled();
      expect(storageInstance.getFilePreview).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('throws when storage.getFileView resolves to a falsy value (video)', async () => {
      storageInstance.getFileView.mockResolvedValue(null);

      await expect(getFilePreview('file-1', 'video')).rejects.toThrow(
        'File preview generation failed: no URL returned'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('throws when storage.getFilePreview resolves to a falsy value (image)', async () => {
      storageInstance.getFilePreview.mockResolvedValue(undefined);

      await expect(getFilePreview('file-1', 'image')).rejects.toThrow(
        'File preview generation failed: no URL returned'
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // bookmarkVideo
  // ---------------------------------------------------------------------------
  describe('bookmarkVideo', () => {
    it('appends userId when isBookmarked is false (not yet bookmarked)', async () => {
      const updated = { $id: 'video-1', bookmarkedByUserId: ['user-a', 'user-b'] };
      databaseInstance.updateDocument.mockResolvedValue(updated);

      const result = await bookmarkVideo('video-1', 'user-b', ['user-a'], false);

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'video-1',
        { bookmarkedByUserId: ['user-a', 'user-b'] }
      );
      expect(result).toBe(updated);
    });

    it('removes userId when isBookmarked is true (already bookmarked)', async () => {
      const updated = { $id: 'video-1', bookmarkedByUserId: ['user-a'] };
      databaseInstance.updateDocument.mockResolvedValue(updated);

      const result = await bookmarkVideo(
        'video-1',
        'user-b',
        ['user-a', 'user-b'],
        true
      );

      expect(databaseInstance.updateDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.reminderCollectionId,
        'video-1',
        { bookmarkedByUserId: ['user-a'] }
      );
      expect(result).toBe(updated);
    });

    it('rethrows a wrapped error when updateDocument rejects', async () => {
      databaseInstance.updateDocument.mockRejectedValue(
        new Error('update failed')
      );

      await expect(
        bookmarkVideo('video-1', 'user-b', [], false)
      ).rejects.toThrow('update failed');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // createUser
  // ---------------------------------------------------------------------------
  describe('createUser', () => {
    it('creates an account, signs in, creates a user document, and returns it', async () => {
      accountInstance.create.mockResolvedValue({ $id: 'acc-1' });
      avatarsInstance.getInitials.mockReturnValue('https://avatar');
      accountInstance.createEmailPasswordSession.mockResolvedValue({
        $id: 'sess-1',
      });
      const newUser = { $id: 'user-doc-1' };
      databaseInstance.createDocument.mockResolvedValue(newUser);

      const result = await createUser(
        'test@example.com',
        'password',
        'username'
      );

      // account.create called with (ID.unique(), normalizedEmail, password, username)
      expect(accountInstance.create).toHaveBeenCalledWith(
        'gen-id',
        'test@example.com',
        'password',
        'username'
      );
      // avatar URL generated from initials
      expect(avatarsInstance.getInitials).toHaveBeenCalledWith('username');
      // auto sign-in after account creation
      expect(accountInstance.createEmailPasswordSession).toHaveBeenCalledWith(
        'test@example.com',
        'password'
      );
      // user document created with accountid, email, username, avatar
      expect(databaseInstance.createDocument).toHaveBeenCalledWith(
        config.databaseId,
        config.userCollectionId,
        'gen-id',
        {
          accountid: 'acc-1',
          email: 'test@example.com',
          username: 'username',
          avatar: 'https://avatar',
        }
      );
      expect(result).toBe(newUser);
    });

    it('rethrows a wrapped error when account.create rejects', async () => {
      accountInstance.create.mockRejectedValue(
        new Error('email already registered')
      );

      await expect(
        createUser('test@example.com', 'password', 'username')
      ).rejects.toThrow('email already registered');

      expect(consoleErrorSpy).toHaveBeenCalled();
      // signIn and createDocument should not have been reached
      expect(accountInstance.createEmailPasswordSession).not.toHaveBeenCalled();
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });

    it('throws when account.create resolves to a falsy value', async () => {
      accountInstance.create.mockResolvedValue(null);

      await expect(
        createUser('test@example.com', 'password', 'username')
      ).rejects.toThrow('Account creation failed: account.create returned null');

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // signIn
  // ---------------------------------------------------------------------------
  describe('signIn', () => {
    it('calls account.createEmailPasswordSession with email and password and returns the session', async () => {
      const session = { $id: 'sess-1', userId: 'acc-1' };
      accountInstance.createEmailPasswordSession.mockResolvedValue(session);

      const result = await signIn('test@example.com', 'password');

      expect(accountInstance.createEmailPasswordSession).toHaveBeenCalledWith(
        'test@example.com',
        'password'
      );
      expect(result).toBe(session);
    });

    it('rejects an invalid email before touching the SDK', async () => {
      await expect(signIn('not-an-email', 'password')).rejects.toThrow(
        'Invalid email: invalid-format'
      );

      expect(accountInstance.createEmailPasswordSession).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rejects an empty email before touching the SDK', async () => {
      await expect(signIn('', 'password')).rejects.toThrow('Invalid email: empty');

      expect(accountInstance.createEmailPasswordSession).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rejects an empty password before touching the SDK', async () => {
      await expect(signIn('test@example.com', '')).rejects.toThrow(
        'Invalid password: password is required'
      );

      expect(accountInstance.createEmailPasswordSession).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rethrows a wrapped error when createEmailPasswordSession rejects', async () => {
      accountInstance.createEmailPasswordSession.mockRejectedValue(
        new Error('invalid credentials')
      );

      await expect(
        signIn('test@example.com', 'password')
      ).rejects.toThrow('invalid credentials');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getCurrentUser (error paths — happy paths live in getCurrentUser.test.ts)
  // ---------------------------------------------------------------------------
  describe('getCurrentUser (error paths)', () => {
    it('returns null when account.get() rejects with a guest/missing-scopes error', async () => {
      accountInstance.get.mockRejectedValue(
        new Error('User (role: guests) missing scopes (["account"])')
      );

      await expect(getCurrentUser()).resolves.toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(databaseInstance.listDocuments).not.toHaveBeenCalled();
    });

    it('returns null for other unauthenticated-style errors (401 / unauthorized)', async () => {
      accountInstance.get.mockRejectedValue(new Error('Request failed: 401'));

      await expect(getCurrentUser()).resolves.toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('rethrows a wrapped error when account.get() rejects with a non-auth failure', async () => {
      accountInstance.get.mockRejectedValue(new Error('network failure'));

      await expect(getCurrentUser()).rejects.toThrow('network failure');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(databaseInstance.listDocuments).not.toHaveBeenCalled();
    });

    it('rethrows a wrapped error when database.listDocuments rejects after account.get() succeeds', async () => {
      accountInstance.get.mockResolvedValue({ $id: 'acc-1' });
      databaseInstance.listDocuments.mockRejectedValue(new Error('db down'));

      await expect(getCurrentUser()).rejects.toThrow('db down');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // requireEnv (module-level config validation)
  // ---------------------------------------------------------------------------
  describe('requireEnv (module-level config validation)', () => {
    it('throws at import time when an env var is missing, mentioning the var name', () => {
      const saved = process.env.EXPO_PUBLIC_DATABASE_ID;
      delete process.env.EXPO_PUBLIC_DATABASE_ID;
      try {
        expect(() => {
          jest.isolateModules(() => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('../appwrite');
          });
        }).toThrow(/EXPO_PUBLIC_DATABASE_ID/);
      } finally {
        process.env.EXPO_PUBLIC_DATABASE_ID = saved;
      }
    });

    it('throws at import time when an env var is whitespace-only, mentioning the var name', () => {
      const saved = process.env.EXPO_PUBLIC_STORAGE_ID;
      process.env.EXPO_PUBLIC_STORAGE_ID = '   ';
      try {
        expect(() => {
          jest.isolateModules(() => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('../appwrite');
          });
        }).toThrow(/EXPO_PUBLIC_STORAGE_ID/);
      } finally {
        process.env.EXPO_PUBLIC_STORAGE_ID = saved;
      }
    });
  });
});
