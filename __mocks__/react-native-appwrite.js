/**
 * Shared manual mock for `react-native-appwrite`.
 *
 * Lives at the repo root so any test suite can opt into it with a bare
 * `jest.mock('react-native-appwrite')` (no factory). Suites that need the
 * real SDK (e.g. appwrite.smoke.test.ts's live ping layer) simply omit the
 * `jest.mock()` call and get the real module — manual mocks for node_modules
 * are only used when `jest.mock('moduleName')` is invoked.
 *
 * The SDK is constructed once at appwrite.ts module scope:
 *   const account  = new Account(client);
 *   const database = new Databases(client);
 *   const storage  = new Storage(client);
 *   const avatars  = new Avatars(client);
 * So the constructor mocks below return stable singleton instances, which we
 * also expose as `__account` / `__database` / `__storage` / `__avatars` so
 * tests can drive their methods (mockResolvedValue / mockRejectedValue) and
 * assert on call args.
 */
const accountInstance = {
  get: jest.fn(),
  create: jest.fn(),
  createEmailPasswordSession: jest.fn(),
  deleteSession: jest.fn(),
};

const databaseInstance = {
  listDocuments: jest.fn(),
  createDocument: jest.fn(),
  updateDocument: jest.fn(),
  getDocument: jest.fn(),
  deleteDocument: jest.fn(),
};

const storageInstance = {
  getFileView: jest.fn(),
  getFilePreview: jest.fn(),
};

const avatarsInstance = {
  getInitials: jest.fn(),
};

module.exports = {
  Client: jest.fn(() => ({
    setEndpoint: jest.fn().mockReturnThis(),
    setProject: jest.fn().mockReturnThis(),
    setPlatform: jest.fn().mockReturnThis(),
  })),
  Account: jest.fn(() => accountInstance),
  Databases: jest.fn(() => databaseInstance),
  Avatars: jest.fn(() => avatarsInstance),
  Storage: jest.fn(() => storageInstance),
  Query: {
    equal: jest.fn(),
    orderDesc: jest.fn(),
    contains: jest.fn(),
    search: jest.fn(),
  },
  ID: { unique: jest.fn() },
  Permission: {
    read: jest.fn((role) => `read("${role}")`),
    write: jest.fn((role) => `write("${role}")`),
    create: jest.fn((role) => `create("${role}")`),
    update: jest.fn((role) => `update("${role}")`),
    delete: jest.fn((role) => `delete("${role}")`),
  },
  Role: {
    any: jest.fn(() => 'any'),
    user: jest.fn((id, status = '') =>
      status === '' ? `user:${id}` : `user:${id}/${status}`
    ),
    users: jest.fn((status = '') =>
      status === '' ? 'users' : `users/${status}`
    ),
    guests: jest.fn(() => 'guests'),
    team: jest.fn((id, role = '') =>
      role === '' ? `team:${id}` : `team:${id}/${role}`
    ),
    member: jest.fn((id) => `member:${id}`),
    label: jest.fn((name) => `label:${name}`),
  },
  ImageGravity: { Top: 'top' },
  // Expose the singleton instances so tests can drive their methods.
  __account: accountInstance,
  __database: databaseInstance,
  __storage: storageInstance,
  __avatars: avatarsInstance,
  // `Models` is a TypeScript-only namespace in the real package; stub it so
  // any runtime access (none expected) doesn't blow up.
  Models: {},
};