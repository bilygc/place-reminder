import {
  Client,
  Account,
  ID,
  Avatars,
  Databases,
  Query,
  Storage,
  ImageGravity,
  Permission,
  Role,
} from 'react-native-appwrite';

import get from 'lodash/get';

import ensureError from '@/utils/ensureError';
import { validateEmail } from '@/utils/validateEmail';
import {
  isDescriptionValid,
  isLocationValid,
  LOCATION_LABEL_MAX_LENGTH,
} from '@/utils/validateReminder';

import type {
  CreateUserFunction,
  SignInFunction,
  GetCurrentUserFunction,
  SignOutFunction,
  GetFilePreviewFunction,
  CreateReminderFunction,
  CreateReminderInput,
  Reminder,
  LocationSource,
} from './appwrite.types';

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `[appwrite config] Missing required env var: ${name}. ` +
        'Check your .env file (see .env.example) or, if running in CI, ' +
        'confirm the corresponding GitHub Secret is set.'
    );
  }
  return value;
}

export const config = {
  endpoint: requireEnv('EXPO_PUBLIC_ENDPOINT', process.env.EXPO_PUBLIC_ENDPOINT),
  platform: requireEnv('EXPO_PUBLIC_PLATFORM', process.env.EXPO_PUBLIC_PLATFORM),
  projectId: requireEnv('EXPO_PUBLIC_PROJECT_ID', process.env.EXPO_PUBLIC_PROJECT_ID),
  databaseId: requireEnv('EXPO_PUBLIC_DATABASE_ID', process.env.EXPO_PUBLIC_DATABASE_ID),
  userCollectionId: requireEnv(
    'EXPO_PUBLIC_USER_COLLECTION_ID',
    process.env.EXPO_PUBLIC_USER_COLLECTION_ID
  ),
  reminderCollectionId: requireEnv(
    'EXPO_PUBLIC_REMINDER_COLLECTION_ID',
    process.env.EXPO_PUBLIC_REMINDER_COLLECTION_ID
  ),
  storageId: requireEnv('EXPO_PUBLIC_STORAGE_ID', process.env.EXPO_PUBLIC_STORAGE_ID),
};

// Init your React Native SDK
const client = new Client();

client
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setPlatform(config.platform);

const account = new Account(client);
const avatars = new Avatars(client);
const database = new Databases(client);
const storage = new Storage(client);

// Register User
export const createUser: CreateUserFunction = async (
  email,
  password,
  username
) => {

  const emailResult = validateEmail(email);
  if (!emailResult.valid) {
    throw new Error(`Invalid email: ${emailResult.reason}`);
  }

  if (!password || password.trim() === '') {
    throw new Error('Invalid password: password is required');
  }

  try {
    const newAccount = await account.create(
      ID.unique(),
      emailResult.value,
      password,
      username
    );
    if (!newAccount) {
      throw new Error('Account creation failed: account.create returned null');
    }

    const avatarUrl = avatars.getInitials(username);

    await signIn(emailResult.value, password);

    const newUser = await database.createDocument(
      config.databaseId,
      config.userCollectionId,
      ID.unique(),
      {
        accountid: newAccount.$id,
        email: emailResult.value,
        username,
        avatar: avatarUrl,
      }
    );

    return newUser;
  } catch (error: unknown) {
    const err = ensureError(error);
    if (__DEV__) {
      console.error(err.message);
    }
    throw new Error(err.message);
  }
};

export const createReminder: CreateReminderFunction = async (input) => {
  if (!isDescriptionValid(input.description)) {
    throw new Error(
      'Invalid reminder: description must be non-empty and 500 characters or fewer'
    );
  }

  if (!isLocationValid(input.latitude, input.longitude)) {
    throw new Error(
      'Invalid reminder: latitude must be between -90 and 90 and longitude between -180 and 180'
    );
  }

  // NOTE: input.userId is intentionally NOT validated as required here. The
  // document owner is derived server-truthfully from the active session below;
  // a caller-supplied userId is only an optional cross-check (mismatch throws).
  // Trusting caller input for permissions caused the runtime rejection
  // "Permissions must be one of: (any, users, user:<accountId>, ...)" when the
  // caller passed a user-collection document id (or '') instead of the
  // Appwrite account $id.

  const validSources: LocationSource[] = ['current', 'map'];
  if (!validSources.includes(input.locationSource)) {
    throw new Error(
      'Invalid reminder: locationSource must be "current" or "map"'
    );
  }

  if (
    input.locationLabel !== undefined &&
    input.locationLabel !== null &&
    (typeof input.locationLabel !== 'string' ||
      input.locationLabel.length > LOCATION_LABEL_MAX_LENGTH)
  ) {
    throw new Error(
      'Invalid reminder: locationLabel must be 255 characters or fewer'
    );
  }

  try {
    // Derive the owner from the active session — never from caller input.
    // account.get() returns the Appwrite account (Models.User with $id), which
    // is the only id the server accepts in Role.user(...) permissions.
    let ownerId: string;
    try {
      const sessionUser = await account.get();
      ownerId = sessionUser?.$id ?? '';
    } catch {
      throw new Error(
        'Cannot create reminder: no active session. Please sign in and try again.'
      );
    }
    if (!ownerId || ownerId.trim() === '') {
      throw new Error(
        'Cannot create reminder: no active session. Please sign in and try again.'
      );
    }

    // Optional cross-check: a non-empty caller-supplied userId must match the
    // session id, otherwise the caller is confused about who is signed in.
    const callerId = input.userId?.trim() ?? '';
    if (callerId !== '' && callerId !== ownerId) {
      throw new Error(
        'Cannot create reminder: caller userId does not match the signed-in user.'
      );
    }

    const data: {
      userId: string;
      description: string;
      latitude: number;
      longitude: number;
      locationSource: LocationSource;
      active: boolean;
      locationLabel?: string;
    } = {
      userId: ownerId,
      description: input.description.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      locationSource: input.locationSource,
      active: input.active ?? true,
    };

    if (input.locationLabel !== undefined && input.locationLabel !== null) {
      data.locationLabel = input.locationLabel;
    }

    const newReminder = (await database.createDocument(
      config.databaseId,
      config.reminderCollectionId,
      ID.unique(),
      data,
      [
        Permission.read(Role.user(ownerId)),
        Permission.update(Role.user(ownerId)),
        Permission.delete(Role.user(ownerId)),
      ]
    )) as unknown as Reminder;

    return newReminder;
  } catch (error: unknown) {
    const err = ensureError(error);
    if (__DEV__) {
      console.error(err.message);
    }
    throw new Error(err.message);
  }
};

function isUnauthenticatedError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('missing scope') ||
    message.includes('role: guests') ||
    message.includes('unauthorized') ||
    message.includes('401')
  );
}

async function clearActiveSessionIfPresent(): Promise<void> {
  try {
    await account.get();
    // An active session exists; remove it before creating a new one.
    try {
      await account.deleteSession('current');
    } catch (deleteError: unknown) {
      // Swallow deletion errors: the session may already be invalid or gone.
      const err = ensureError(deleteError);
      console.warn(
        'Failed to delete existing session before sign-in:',
        err.message
      );
    }
  } catch (error: unknown) {
    const err = ensureError(error);
    if (!isUnauthenticatedError(err)) {
      throw new Error(err.message);
    }
  }
}

export const signIn: SignInFunction = async (email, password) => {
  const emailResult = validateEmail(email);
  if (!emailResult.valid) {
    throw new Error(`Invalid email: ${emailResult.reason}`);
  }

  if (!password || password.trim() === '') {
    throw new Error('Invalid password: password is required');
  }

  try {
    await clearActiveSessionIfPresent();

    const session = await account.createEmailPasswordSession(
      emailResult.value,
      password
    );
    return session;
  } catch (error: unknown) {
    const err = ensureError(error);
    if (__DEV__) {
      console.error(err.message);
    }
    throw new Error(err.message);
  }
};

export const getCurrentUser: GetCurrentUserFunction = async () => {
  try {
    const currentAccount = await account.get();

    if (!currentAccount) {
      return null;
    }

    const currentUser = await database.listDocuments(
      config.databaseId,
      config.userCollectionId,
      [Query.equal('accountid', currentAccount.$id)]
    );

    if (!currentUser) {
      throw new Error('User document not found: user collection query returned null');
    }

    const user = get(currentUser, 'documents[0]');
    return user;
  } catch (error: unknown) {
    const err = ensureError(error);
    if (isUnauthenticatedError(err)) {
      return null;
    }
    if (__DEV__) {
      console.error(err.message);
    }
    throw new Error(err.message);
  }
};

export const signOut: SignOutFunction = async () => {
  try {
    const session = await account.deleteSession('current');
    return session;
  } catch (error: unknown) {
    const err = ensureError(error);
    if (__DEV__) {
      console.error(err.message);
    }
    throw new Error(err.message);
  }
};

export const getFilePreview: GetFilePreviewFunction = async (fileId, type) => {
  let fileUrl;
  try {
    if (type === 'video') {
      fileUrl = await storage.getFileView(config.storageId, fileId);
    } else if (type === 'image') {
      fileUrl = await storage.getFilePreview(
        config.storageId,
        fileId,
        2000,
        2000,
        ImageGravity.Top,
        100
      );
    } else {
      throw new Error('Invalid file type');
    }
    if (!fileUrl) throw new Error('File preview generation failed: no URL returned');
    return fileUrl;
  } catch (error: unknown) {
    const err = ensureError(error);
    if (__DEV__) {
      console.error(err.message);
    }
    throw new Error(err.message);
  }
};
