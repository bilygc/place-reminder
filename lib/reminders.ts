import { Account, Client, Databases, Query } from 'react-native-appwrite';

import ensureError from '@/utils/ensureError';
import {
  LOCATION_LABEL_MAX_LENGTH,
  isDescriptionValid,
} from '@/utils/validateReminder';

import { config } from './appwrite';
import type {
  CreateReminderInput,
  LocationSource,
  Reminder,
} from './appwrite.types';

// lib/reminders.ts owns its Account/Databases instances to keep the
// reminders collection access decoupled from lib/appwrite.ts (which also
// hosts the legacy video-post helpers). `createReminder` itself stays in
// lib/appwrite.ts — this module restores the other five DAL functions,
// adapted to the ATO-12 session-derived ownership model: the owner id is
// always resolved from the active session via `account.get()` (the Appwrite
// ACCOUNT id, the only id the server accepts in Role.user(...) ACLs), never
// from caller input. There is therefore no `sessionUserId` parameter.
const client = new Client();
client
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setPlatform(config.platform);
const account = new Account(client);
const database = new Databases(client);

/**
 * Fields that may be changed after creation. `userId` is intentionally
 * excluded — the owner is immutable once the document exists.
 */
export type UpdateReminderPatch = Partial<
  Omit<CreateReminderInput, 'userId'>
>;

const VALID_LOCATION_SOURCES: LocationSource[] = ['current', 'map'];

function assertValidId(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field}: ${field} must be a string`);
  }
  if (value.length > 64) {
    throw new Error(
      `Invalid ${field}: ${field} must be at most 64 characters`
    );
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error(`Invalid ${field}: ${field} is required`);
  }
  return trimmed;
}

function assertValidPatch(patch: UpdateReminderPatch): void {
  if (
    patch.description !== undefined &&
    (typeof patch.description !== 'string' ||
      !isDescriptionValid(patch.description))
  ) {
    throw new Error(
      'Invalid reminder: description must be non-empty and 500 characters or fewer'
    );
  }

  if (patch.latitude !== undefined) {
    if (
      typeof patch.latitude !== 'number' ||
      !Number.isFinite(patch.latitude) ||
      patch.latitude < -90 ||
      patch.latitude > 90
    ) {
      throw new Error(
        'Invalid reminder: latitude must be between -90 and 90 and longitude between -180 and 180'
      );
    }
  }

  if (patch.longitude !== undefined) {
    if (
      typeof patch.longitude !== 'number' ||
      !Number.isFinite(patch.longitude) ||
      patch.longitude < -180 ||
      patch.longitude > 180
    ) {
      throw new Error(
        'Invalid reminder: latitude must be between -90 and 90 and longitude between -180 and 180'
      );
    }
  }

  if (
    patch.locationSource !== undefined &&
    !VALID_LOCATION_SOURCES.includes(patch.locationSource)
  ) {
    throw new Error(
      'Invalid reminder: locationSource must be "current" or "map"'
    );
  }

  if (
    patch.locationLabel !== undefined &&
    patch.locationLabel !== null &&
    (typeof patch.locationLabel !== 'string' ||
      patch.locationLabel.length > LOCATION_LABEL_MAX_LENGTH)
  ) {
    throw new Error(
      'Invalid reminder: locationLabel must be 255 characters or fewer'
    );
  }

  if (patch.active !== undefined && typeof patch.active !== 'boolean') {
    throw new Error('Invalid active: active must be a boolean');
  }
}

function buildUpdateData(patch: UpdateReminderPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (patch.description !== undefined) {
    data.description = patch.description.trim();
  }
  if (patch.locationSource !== undefined) {
    data.locationSource = patch.locationSource;
  }
  if (
    patch.locationLabel !== undefined &&
    patch.locationLabel !== null
  ) {
    data.locationLabel = patch.locationLabel;
  }
  if (patch.latitude !== undefined) {
    data.latitude = patch.latitude;
  }
  if (patch.longitude !== undefined) {
    data.longitude = patch.longitude;
  }
  if (patch.active !== undefined) {
    data.active = patch.active;
  }
  return data;
}

function isDocumentNotFoundError(error: Error): boolean {
  const message = error.message.toLowerCase();
  if (message.includes('not found')) {
    return true;
  }
  // Real Appwrite 404s read "Document with the requested ID could not be
  // found." — which does NOT contain the contiguous substring "not found".
  if (message.includes('could not be found')) {
    return true;
  }
  const appwriteLike = error as Error & { code?: number; type?: string };
  if (appwriteLike.code === 404) {
    return true;
  }
  if (appwriteLike.type?.toLowerCase().includes('not_found')) {
    return true;
  }
  return false;
}

/**
 * Resolve the document owner from the active session. `account.get()`
 * returns the Appwrite account, whose `$id` is the only id the server
 * accepts in per-document `Role.user(...)` ACLs. Throws a clear,
 * actionable session error when nobody is signed in.
 */
async function resolveOwnerId(
  operation: 'list' | 'load' | 'update' | 'delete'
): Promise<string> {
  try {
    const sessionUser = await account.get();
    const ownerId = sessionUser?.$id ?? '';
    if (!ownerId || ownerId.trim() === '') {
      throw new Error(
        `Cannot ${operation} reminder: no active session. Please sign in and try again.`
      );
    }
    return ownerId;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    if (err.message.startsWith('Cannot ')) {
      throw err;
    }
    throw new Error(
      `Cannot ${operation} reminder: no active session. Please sign in and try again.`
    );
  }
}

/**
 * List the reminders owned by the signed-in user, newest first. Ownership is
 * resolved from the active session, never from caller input.
 */
export const listReminders = async (): Promise<Reminder[]> => {
  const ownerId = await resolveOwnerId('list');

  try {
    const result = await database.listDocuments(
      config.databaseId,
      config.reminderCollectionId,
      [Query.equal('userId', ownerId), Query.orderDesc('$createdAt')]
    );
    return (result.documents as unknown as Reminder[]) ?? [];
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error('Failed to list reminders');
  }
};

/**
 * Ownership-verified read. Foreign and missing documents both throw
 * `Reminder not found` so existence is not leaked.
 */
export const getReminder = async (id: string): Promise<Reminder> => {
  const docId = assertValidId(id, 'id');
  const ownerId = await resolveOwnerId('load');

  try {
    const document = await database.getDocument(
      config.databaseId,
      config.reminderCollectionId,
      docId
    );
    const reminder = document as unknown as Reminder;
    if (reminder.userId !== ownerId) {
      throw new Error('Reminder not found');
    }
    return reminder;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    if (isDocumentNotFoundError(err)) {
      throw new Error('Reminder not found');
    }
    throw new Error('Failed to load reminder');
  }
};

/**
 * Fetch-verify-then-mutate. Only fields present in `patch` are sent;
 * `description` is trimmed when included.
 */
export const updateReminder = async (
  id: string,
  patch: UpdateReminderPatch
): Promise<Reminder> => {
  const docId = assertValidId(id, 'id');
  assertValidPatch(patch);
  const ownerId = await resolveOwnerId('update');

  try {
    const existing = await database.getDocument(
      config.databaseId,
      config.reminderCollectionId,
      docId
    );
    if ((existing as unknown as Reminder).userId !== ownerId) {
      throw new Error('Reminder not found');
    }

    const document = await database.updateDocument(
      config.databaseId,
      config.reminderCollectionId,
      docId,
      buildUpdateData(patch)
    );
    return document as unknown as Reminder;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    if (isDocumentNotFoundError(err)) {
      throw new Error('Reminder not found');
    }
    throw new Error('Failed to update reminder');
  }
};

/**
 * Fetch-verify-then-delete.
 */
export const deleteReminder = async (id: string): Promise<unknown> => {
  const docId = assertValidId(id, 'id');
  const ownerId = await resolveOwnerId('delete');

  try {
    const existing = await database.getDocument(
      config.databaseId,
      config.reminderCollectionId,
      docId
    );
    if ((existing as unknown as Reminder).userId !== ownerId) {
      throw new Error('Reminder not found');
    }

    const result = await database.deleteDocument(
      config.databaseId,
      config.reminderCollectionId,
      docId
    );
    return result;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    if (isDocumentNotFoundError(err)) {
      throw new Error('Reminder not found');
    }
    throw new Error('Failed to delete reminder');
  }
};

/**
 * Thin wrapper over `updateReminder` for enabling/disabling a reminder.
 */
export const toggleReminderActive = async (
  id: string,
  active: boolean
): Promise<Reminder> => {
  return updateReminder(id, { active });
};
