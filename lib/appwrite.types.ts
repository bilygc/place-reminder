import { Models } from 'react-native-appwrite';

export interface UserCredentials {
  email: string;
  password: string;
  username: string;
}

export interface FileAsset {
  name: string;
  type: string;
  size: number;
  uri: string;
}

export interface VideoPost {
  video: FileAsset;
  thumbnail: FileAsset;
  title: string;
  prompt: string;
  userId: string;
}

// Function return types
export type CreateUserResponse = Promise<Models.Document>;
export type SignInResponse = Promise<Models.Session>;
export type GetCurrentUserResponse = Promise<Models.Document>;
export type GetAllPostsResponse = Promise<Models.Document[]>;
export type GetLatestPostsResponse = Promise<Models.Document[]>;
export type GetBookmarkedPostsResponse = Promise<Models.Document[]>;
export type SearchPostsResponse = Promise<Models.Document[]>;
export type GetUserPostsResponse = Promise<Models.Document[]>;
export type SignOutResponse = Promise<{}>;
export type GetFilePreviewResponse = Promise<URL>;
export type UploadFileResponse = Promise<URL>;
export type CreateVideoResponse = Promise<Models.Document>;
export type BookmarkVideoResponse = Promise<Models.Document>;

// Function type definitions
export type CreateUserFunction = (
  email: string,
  password: string,
  username: string
) => CreateUserResponse;

export type SignInFunction = (
  email: string,
  password: string
) => SignInResponse;

export type GetCurrentUserFunction = () => GetCurrentUserResponse;

export type GetAllPostsFunction = () => GetAllPostsResponse;

export type GetLatestPostsFunction = () => GetLatestPostsResponse;

export type GetBookmarkedPostsFunction = (
  userId: string
) => GetBookmarkedPostsResponse;

export type SearchPostsFunction = (query: string) => SearchPostsResponse;

export type GetUserPostsFunction = (userId: string) => GetUserPostsResponse;

export type SignOutFunction = () => SignOutResponse;

export type GetFilePreviewFunction = (
  fileId: string,
  type: 'video' | 'image'
) => GetFilePreviewResponse;

export type UploadFileFunction = (
  file: FileAsset,
  type: 'video' | 'image'
) => UploadFileResponse;

export type CreateVideoFunction = (params: VideoPost) => CreateVideoResponse;

export type BookmarkVideoFunction = (
  videoId: string,
  userId: string,
  bookmarkData: string[],
  isBookmarked: boolean
) => BookmarkVideoResponse;
