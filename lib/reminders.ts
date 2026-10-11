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
 * True when the SDK rejected a call because the caller lacks permission
 * (Appwrite 401/403, "missing scope"/"missing permissions"-style messages,
 * unauthorized-type codes). After the collection ACL tightening (collection
 * read/update/delete removed, per-document ACLs only), a single-document
 * read of a foreign document throws this instead of a 404 — so read-step
 * permission errors must map to the uniform `Reminder not found` error
 * rather than leak existence via distinct messages.
 */
function isPermissionDeniedError(error: Error): boolean {
  const message = error.message.toLowerCase();
  // NOTE: no bare numeric '401'/'403' substring checks here — they
  // misclassify transient errors embedding digit runs (e.g. a timeout
  // "...after 4030ms") as permission-denied. Structured code/type checks
  // below already cover real 401/403s.
  if (
    message.includes('missing scope') ||
    message.includes('missing permission') ||
    message.includes('permission denied') ||
    message.includes('not authorized') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  ) {
    return true;
  }
  const appwriteLike = error as Error & { code?: number; type?: string };
  if (appwriteLike.code === 401 || appwriteLike.code === 403) {
    return true;
  }
  const type = appwriteLike.type?.toLowerCase() ?? '';
  if (
    type.includes('unauthorized') ||
    type.includes('forbidden') ||
    type.includes('permission')
  ) {
    return true;
  }
  return false;
}

/**
 * True when a read-step failure looks like the session lapsed between
 * `resolveOwnerId()` and the document read (guest-role / missing-scope /
 * session-flavoured errors) rather than a foreign/missing document. These
 * must surface as a sign-in message — normalizing them to
 * `Reminder not found` would tell the user their own document is gone when
 * they are simply signed out.
 *
 * Deliberately narrower than `isPermissionDeniedError`: a bare 401/403 code
 * or a generic "not authorized"/"forbidden" signal stays on the
 * `Reminder not found` path, so a valid session still cannot distinguish
 * foreign from missing documents (no existence oracle).
 */
function isSessionExpiredError(error: Error): boolean {
  const message = error.message.toLowerCase();
  if (
    message.includes('missing scope') ||
    message.includes('role: guests') ||
    message.includes('unauthenticated') ||
    message.includes('session') ||
    message.includes('please sign in') ||
    message.includes('no active session')
  ) {
    return true;
  }
  const appwriteLike = error as Error & { code?: number; type?: string };
  const type = appwriteLike.type?.toLowerCase() ?? '';
  if (
    type.includes('unauthenticated') ||
    type.includes('session') ||
    type.includes('missing_scope')
  ) {
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
    if (isSessionExpiredError(err)) {
      throw new Error(
        'Cannot load reminder: session expired. Please sign in and try again.'
      );
    }
    if (isDocumentNotFoundError(err) || isPermissionDeniedError(err)) {
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

  // Read step: a foreign document now surfaces a permission error (not a
  // 404) after the ACL tightening, so permission errors here normalize to
  // `Reminder not found` just like missing documents.
  let existing;
  try {
    existing = await database.getDocument(
      config.databaseId,
      config.reminderCollectionId,
      docId
    );
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    if (isSessionExpiredError(err)) {
      throw new Error(
        'Cannot update reminder: session expired. Please sign in and try again.'
      );
    }
    if (isDocumentNotFoundError(err) || isPermissionDeniedError(err)) {
      throw new Error('Reminder not found');
    }
    throw new Error('Failed to update reminder');
  }
  if ((existing as unknown as Reminder).userId !== ownerId) {
    throw new Error('Reminder not found');
  }

  // Mutate step: ownership is already verified, so any failure here is a
  // genuine write failure, not an existence signal.
  try {
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

  // Read step: see updateReminder — read-step permission errors normalize
  // to `Reminder not found` so foreign and missing documents stay
  // indistinguishable.
  let existing;
  try {
    existing = await database.getDocument(
      config.databaseId,
      config.reminderCollectionId,
      docId
    );
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    if (isSessionExpiredError(err)) {
      throw new Error(
        'Cannot delete reminder: session expired. Please sign in and try again.'
      );
    }
    if (isDocumentNotFoundError(err) || isPermissionDeniedError(err)) {
      throw new Error('Reminder not found');
    }
    throw new Error('Failed to delete reminder');
  }
  if ((existing as unknown as Reminder).userId !== ownerId) {
    throw new Error('Reminder not found');
  }

  // Mutate step: ownership is already verified, so any failure here is a
  // genuine delete failure, not an existence signal.
  try {
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
