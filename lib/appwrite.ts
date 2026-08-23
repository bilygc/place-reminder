import {
  Client,
  Account,
  ID,
  Avatars,
  Databases,
  Query,
  Storage,
  ImageGravity,
} from 'react-native-appwrite';

import get from 'lodash/get';

import ensureError from '@/utils/ensureError';
import { validateEmail } from '@/utils/validateEmail';

import type {
  CreateUserFunction,
  SignInFunction,
  GetCurrentUserFunction,
  GetAllPostsFunction,
  GetLatestPostsFunction,
  GetBookmarkedPostsFunction,
  SearchPostsFunction,
  GetUserPostsFunction,
  SignOutFunction,
  GetFilePreviewFunction,
  // UploadFileFunction,
  // CreateVideoFunction,
  BookmarkVideoFunction,
  // FileAsset,
  // VideoPost,
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
    console.error(err.message);
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
    console.error(err.message);
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
    console.error(err.message);
    throw new Error(err.message);
  }
};

export const getAllPosts: GetAllPostsFunction = async () => {
  try {
    const posts = await database.listDocuments(
      config.databaseId,
      config.reminderCollectionId,
      []
    );
    return posts.documents;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error(err.message);
  }
};

export const getLatestPosts: GetLatestPostsFunction = async () => {
  try {
    const posts = await database.listDocuments(
      config.databaseId,
      config.reminderCollectionId,
      [Query.orderDesc('$createdAt')]
    );
    return posts.documents;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error(err.message);
  }
};

export const getBookmarkedPosts: GetBookmarkedPostsFunction = async (
  userId
) => {
  try {
    const posts = await database.listDocuments(
      config.databaseId,
      config.reminderCollectionId,
      [
        Query.contains('bookmarkedByUserId', userId),
        Query.orderDesc('$createdAt'),
      ]
    );
    return posts.documents;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error(err.message);
  }
};

export const searchPosts: SearchPostsFunction = async (query) => {
  try {
    const posts = await database.listDocuments(
      config.databaseId,
      config.reminderCollectionId,
      [Query.search('title', query)]
    );
    return posts.documents;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error(err.message);
  }
};

export const getUserPosts: GetUserPostsFunction = async (userId) => {
  try {
    const posts = await database.listDocuments(
      config.databaseId,
      config.reminderCollectionId,
      [Query.equal('creator', userId), Query.orderDesc('$createdAt')]
    );
    return posts.documents;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error(err.message);
  }
};

export const signOut: SignOutFunction = async () => {
  try {
    const session = await account.deleteSession('current');
    return session;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
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
    console.error(err.message);
    throw new Error(err.message);
  }
};

/**
 *
 * @param {string} videoId
 * @param {string} userId
 * @param {userId[]} bookmarkData
 * @returns Models.Document
 */
export const bookmarkVideo: BookmarkVideoFunction = async (
  videoId,
  userId,
  bookmarkData,
  isBookmarked
) => {
  // console.log(
  //   "bookmarkVideo",
  //   bookmarkData.filter((bookmark) => bookmark.$id !== userId)
  // );

  try {
    const updatedData = await database.updateDocument(
      config.databaseId,
      config.reminderCollectionId,
      videoId,
      {
        bookmarkedByUserId: isBookmarked
          ? bookmarkData.filter((bookmarkUserId) => bookmarkUserId !== userId)
          : [...bookmarkData, userId],
      }
    );
    return updatedData;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error(err.message);
  }
};
