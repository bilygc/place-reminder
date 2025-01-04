// import { ENDPOINT } from "@env";
import {
  Client,
  Account,
  ID,
  Avatars,
  Databases,
  Query,
  Storage,
  ImageGravity,
} from "react-native-appwrite";

import ensureError from "@/utils/ensureError";

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
} from "./appwrite.types";

export const config = {
  endpoint: process.env.EXPO_PUBLIC_ENDPOINT || "",
  platform: process.env.EXPO_PUBLIC_PLATFORM || "",
  projectId: process.env.EXPO_PUBLIC_PROJECT_ID || "",
  databaseId: process.env.EXPO_PUBLIC_DATABASE_ID || "",
  userCollectionId: process.env.EXPO_PUBLIC_USER_COLLECTION_ID || "",
  reminderCollectionId: process.env.EXPO_PUBLIC_REMINDER_COLLECTION_ID || "",
  storageId: process.env.EXPO_PUBLIC_STORAGE_ID || "",
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
  try {
    const newAccount = await account.create(
      ID.unique(),
      email,
      password,
      username
    );
    if (!newAccount) {
      throw Error;
    }

    const avatarUrl = avatars.getInitials(username);

    await signIn(email, password);

    const newUser = await database.createDocument(
      config.databaseId,
      config.userCollectionId,
      ID.unique(),
      {
        accountId: newAccount.$id,
        email,
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
export const signIn: SignInFunction = async (email, password) => {
  try {
    const session = await account.createEmailPasswordSession(email, password);

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
      throw Error;
    }

    const currentUser = await database.listDocuments(
      config.databaseId,
      config.userCollectionId,
      [Query.equal("accountId", currentAccount.$id)]
    );

    if (!currentUser) {
      throw Error;
    }

    const user = currentUser.documents[0];
    console.log("user", user);
    return user;
  } catch (error: unknown) {
    const err = ensureError(error);
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
      [Query.orderDesc("$createdAt")]
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
        Query.contains("bookmarkedByUserId", userId),
        Query.orderDesc("$createdAt"),
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
      [Query.search("title", query)]
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
      [Query.equal("creator", userId), Query.orderDesc("$createdAt")]
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
    const session = await account.deleteSession("current");
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
    if (type === "video") {
      fileUrl = await storage.getFileView(config.storageId, fileId);
    } else if (type === "image") {
      fileUrl = await storage.getFilePreview(
        config.storageId,
        fileId,
        2000,
        2000,
        ImageGravity.Top,
        100
      );
    } else {
      throw new Error("Invalid file type");
    }
    if (!fileUrl) throw Error;
    return fileUrl;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error(err.message);
  }
};

// export const uploadFile: UploadFileFunction = async (file, type) => {
//   if (!file) return;

//   const asset = {
//     name: file.fileName,
//     type: file.mimeType,
//     size: file.fileSize,
//     uri: file.uri,
//   };

//   try {
//     const uploadedFile = await storage.createFile(
//       config.storageId,
//       ID.unique(),
//       asset
//     );

//     const fileUrl = await getFilePreview(uploadedFile.$id, type);
//     return fileUrl;
//   } catch (error: unknown) {
//     throw new Error(error);
//   }
// };

// export const createVideo: CreateVideoFunction = async ({
//   video,
//   thumbnail,
//   title,
//   prompt,
//   userId,
// }) => {
//   try {
//     const [thumbnailUrl, videoUrl] = await Promise.all([
//       uploadFile(thumbnail, "image"),
//       uploadFile(video, "video"),
//     ]);

//     const newPost = await database.createDocument(
//       config.databaseId,
//       config.reminderCollectionId,
//       ID.unique(),
//       {
//         title,
//         thumbnail: thumbnailUrl,
//         video: videoUrl,
//         prompt,
//         creator: userId,
//       }
//     );
//     return newPost;
//   } catch (error: unknown) {
//     throw new Error(error);
//   }
// };

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
