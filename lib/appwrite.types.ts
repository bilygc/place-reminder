import { Models } from 'react-native-appwrite';

export type LocationSource = 'current' | 'map';

export type CreateReminderInput = {
  description: string; // non-empty, ≤500 chars (validate before calling)
  latitude: number; // -90..90
  longitude: number; // -180..180
  locationSource: LocationSource;
  locationLabel?: string; // reverse-geocoded label, ≤255 chars
  userId: string; // owner (Appwrite account $id)
  active?: boolean; // defaults to true
};

export type Reminder = {
  $id: string;
  userId: string;
  description: string;
  latitude: number;
  longitude: number;
  locationSource: LocationSource;
  locationLabel?: string | null;
  active: boolean;
  $createdAt: string;
  $updatedAt: string;
};

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
export type GetCurrentUserResponse = Promise<Models.Document | null | undefined>;
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

export type CreateReminderResponse = Promise<Reminder>;

export type CreateReminderFunction = (
  input: CreateReminderInput
) => CreateReminderResponse;
