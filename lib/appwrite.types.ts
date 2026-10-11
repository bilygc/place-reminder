import { Models } from 'react-native-appwrite';

export type LocationSource = 'current' | 'map';

export type CreateReminderInput = {
  description: string; // non-empty, ≤500 chars (validate before calling)
  latitude: number; // -90..90
  longitude: number; // -180..180
  locationSource: LocationSource;
  locationLabel?: string; // reverse-geocoded label, ≤255 chars
  // Optional cross-check only: the document owner and its per-document
  // permissions are ALWAYS derived from the active session (account.get()).
  // When present and non-empty, userId must match the session id or
  // createReminder throws; empty/omitted means "use the session id".
  userId?: string;
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

// Function return types
export type CreateUserResponse = Promise<Models.Document>;
export type SignInResponse = Promise<Models.Session>;
export type GetCurrentUserResponse = Promise<Models.Document | null | undefined>;
export type SignOutResponse = Promise<{}>;
export type GetFilePreviewResponse = Promise<URL>;

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

export type SignOutFunction = () => SignOutResponse;

export type GetFilePreviewFunction = (
  fileId: string,
  type: 'video' | 'image'
) => GetFilePreviewResponse;

export type CreateReminderResponse = Promise<Reminder>;

export type CreateReminderFunction = (
  input: CreateReminderInput
) => CreateReminderResponse;
