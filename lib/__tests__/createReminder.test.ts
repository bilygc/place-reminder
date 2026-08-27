/**
 * Unit tests for createReminder() in lib/appwrite.ts.
 *
 * Covers:
 *  - Success path: correct database/collection/document args and the three
 *    per-document permissions.
 *  - Input validation rejection before any SDK call.
 *  - Appwrite SDK error propagation.
 */

process.env.EXPO_PUBLIC_ENDPOINT = 'https://dummy.example/v1';
process.env.EXPO_PUBLIC_PLATFORM = 'com.dummy.app';
process.env.EXPO_PUBLIC_PROJECT_ID = 'dummy-project';
process.env.EXPO_PUBLIC_DATABASE_ID = 'dummy-db';
process.env.EXPO_PUBLIC_USER_COLLECTION_ID = 'dummy-users';
process.env.EXPO_PUBLIC_REMINDER_COLLECTION_ID = 'dummy-reminders';
process.env.EXPO_PUBLIC_STORAGE_ID = 'dummy-storage';

jest.mock('react-native-appwrite');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appwriteModule = require('react-native-appwrite');
const databaseInstance = appwriteModule.__database;
const ID = appwriteModule.ID;
const Permission = appwriteModule.Permission;
const Role = appwriteModule.Role;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { config, createReminder } = require('../appwrite');

const validInput = {
  description: 'Buy milk',
  latitude: 40.7128,
  longitude: -74.006,
  locationSource: 'current' as const,
  userId: 'user-123',
};

const mockReminder = {
  $id: 'rem-1',
  userId: 'user-123',
  description: 'Buy milk',
  latitude: 40.7128,
  longitude: -74.006,
  locationSource: 'current',
  active: true,
  $createdAt: '2026-01-01T00:00:00.000Z',
  $updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('createReminder', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    ID.unique.mockReturnValue('gen-id');
    databaseInstance.createDocument.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('creates a reminder with the correct database, collection, and document data', async () => {
    databaseInstance.createDocument.mockResolvedValue(mockReminder);

    const result = await createReminder(validInput);

    expect(databaseInstance.createDocument).toHaveBeenCalledWith(
      config.databaseId,
      config.reminderCollectionId,
      'gen-id',
      {
        userId: 'user-123',
        description: 'Buy milk',
        latitude: 40.7128,
        longitude: -74.006,
        locationSource: 'current',
        active: true,
      },
      expect.any(Array)
    );
    expect(result).toBe(mockReminder);
  });

  it('passes the three per-document user permissions as the 5th argument', async () => {
    databaseInstance.createDocument.mockResolvedValue(mockReminder);

    await createReminder(validInput);

    expect(Role.user).toHaveBeenCalledWith('user-123');
    expect(Permission.read).toHaveBeenCalledWith('role:user:user-123');
    expect(Permission.update).toHaveBeenCalledWith('role:user:user-123');
    expect(Permission.delete).toHaveBeenCalledWith('role:user:user-123');

    const permissions = databaseInstance.createDocument.mock.calls[0][4];
    expect(permissions).toEqual([
      { operation: 'read', role: 'role:user:user-123' },
      { operation: 'update', role: 'role:user:user-123' },
      { operation: 'delete', role: 'role:user:user-123' },
    ]);
  });

  it('includes locationLabel when provided and omits it when undefined', async () => {
    databaseInstance.createDocument.mockResolvedValue(mockReminder);

    await createReminder({
      ...validInput,
      locationLabel: '123 Main St, New York',
    });

    const dataWithLabel = databaseInstance.createDocument.mock.calls[0][3];
    expect(dataWithLabel.locationLabel).toBe('123 Main St, New York');

    jest.clearAllMocks();
    databaseInstance.createDocument.mockResolvedValue(mockReminder);

    await createReminder(validInput);

    const dataWithoutLabel = databaseInstance.createDocument.mock.calls[0][3];
    expect(dataWithoutLabel).not.toHaveProperty('locationLabel');
  });

  it('defaults active to true when omitted', async () => {
    databaseInstance.createDocument.mockResolvedValue(mockReminder);

    await createReminder({ ...validInput, active: undefined });

    const data = databaseInstance.createDocument.mock.calls[0][3];
    expect(data.active).toBe(true);
  });

  it('honors active: false when explicitly provided', async () => {
    databaseInstance.createDocument.mockResolvedValue(mockReminder);

    await createReminder({ ...validInput, active: false });

    const data = databaseInstance.createDocument.mock.calls[0][3];
    expect(data.active).toBe(false);
  });

  it('rejects an empty description before touching Appwrite', async () => {
    await expect(
      createReminder({ ...validInput, description: '   ' })
    ).rejects.toThrow(/description/i);

    expect(databaseInstance.createDocument).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('rejects a description longer than 500 characters', async () => {
    await expect(
      createReminder({ ...validInput, description: 'a'.repeat(501) })
    ).rejects.toThrow(/description/i);

    expect(databaseInstance.createDocument).not.toHaveBeenCalled();
  });

  it('rejects out-of-range latitude', async () => {
    await expect(
      createReminder({ ...validInput, latitude: 91 })
    ).rejects.toThrow(/latitude|longitude/i);

    expect(databaseInstance.createDocument).not.toHaveBeenCalled();
  });

  it('rejects out-of-range longitude', async () => {
    await expect(
      createReminder({ ...validInput, longitude: -181 })
    ).rejects.toThrow(/latitude|longitude/i);

    expect(databaseInstance.createDocument).not.toHaveBeenCalled();
  });

  it('rejects an empty userId', async () => {
    await expect(
      createReminder({ ...validInput, userId: '' })
    ).rejects.toThrow(/userId/i);

    expect(databaseInstance.createDocument).not.toHaveBeenCalled();
  });

  it('rejects an invalid locationSource', async () => {
    await expect(
      createReminder({ ...validInput, locationSource: 'invalid' as any })
    ).rejects.toThrow(/locationSource/i);

    expect(databaseInstance.createDocument).not.toHaveBeenCalled();
  });

  it('rejects a locationLabel longer than 255 characters', async () => {
    await expect(
      createReminder({ ...validInput, locationLabel: 'a'.repeat(256) })
    ).rejects.toThrow(/locationLabel/i);

    expect(databaseInstance.createDocument).not.toHaveBeenCalled();
  });

  it('propagates Appwrite errors through its try/catch', async () => {
    databaseInstance.createDocument.mockRejectedValue(
      new Error('Appwrite permission denied')
    );

    await expect(createReminder(validInput)).rejects.toThrow(
      'Appwrite permission denied'
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
