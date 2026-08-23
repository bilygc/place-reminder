import { Client, Databases, ID, Permission, Query, Role } from 'react-native-appwrite';

import ensureError from '@/utils/ensureError';

import { config } from './appwrite';
import type {
  CreateReminderInput,
  ReminderDocument,
  UpdateReminderPatch,
  LocationSource,
} from './reminders.types';

// lib/reminders.ts owns its Databases instance to avoid coupling with
// unrelated lib/appwrite.ts changes (sign-in work) and the legacy exports there.
const client = new Client();
client
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setPlatform(config.platform);
const database = new Databases(client);

const VALID_LOCATION_SOURCES: LocationSource[] = ['current', 'map'];

function assertNonEmptyString(value: string, field: string): void {
  if (!value || value.trim() === '') {
    throw new Error(`Invalid ${field}: ${field} is required`);
  }
}

function assertValidStringId(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field}: ${field} must be a string`);
  }
  if (value.length > 64) {
    throw new Error(`Invalid ${field}: ${field} must be at most 64 characters`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error(`Invalid ${field}: ${field} is required`);
  }
  return trimmed;
}

function assertDescription(value: unknown): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Invalid description: description is required');
  }
  if (value.length > 2000) {
    throw new Error(
      'Invalid description: description must be at most 2000 characters'
    );
  }
}

function assertLocationSource(value: LocationSource): void {
  if (!VALID_LOCATION_SOURCES.includes(value)) {
    throw new Error(
      `Invalid locationSource: must be one of ${VALID_LOCATION_SOURCES.join(', ')}`
    );
  }
}

function assertLatitude(value: number): void {
  if (!Number.isFinite(value) || value < -90 || value > 90) {
    throw new Error(
      'Invalid latitude: must be a finite number between -90 and 90'
    );
  }
}

function assertLongitude(value: number): void {
  if (!Number.isFinite(value) || value < -180 || value > 180) {
    throw new Error(
      'Invalid longitude: must be a finite number between -180 and 180'
    );
  }
}

function assertLocationLabel(value: unknown): void {
  if (typeof value !== 'string') {
    throw new Error('Invalid locationLabel: locationLabel must be a string');
  }
  if (value.length > 255) {
    throw new Error(
      'Invalid locationLabel: locationLabel must be at most 255 characters'
    );
  }
}

function assertActive(value: unknown): void {
  if (typeof value !== 'boolean') {
    throw new Error('Invalid active: active must be a boolean');
  }
}

function isDocumentNotFoundError(error: Error): boolean {
  const message = error.message.toLowerCase();
  if (message.includes('not found')) {
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

export const createReminder = async (
  input: CreateReminderInput,
  sessionUserId: string
): Promise<ReminderDocument> => {
  assertValidStringId(sessionUserId, 'sessionUserId');
  assertDescription(input.description);
  assertLocationSource(input.locationSource);
  assertLatitude(input.latitude);
  assertLongitude(input.longitude);
  if (input.locationLabel !== undefined) {
    assertLocationLabel(input.locationLabel);
  }
  if (input.active !== undefined) {
    assertActive(input.active);
  }

  const data = {
    userId: sessionUserId,
    description: input.description.trim(),
    locationSource: input.locationSource,
    locationLabel: input.locationLabel,
    latitude: input.latitude,
    longitude: input.longitude,
    active: input.active ?? true,
  };

  const permissions = [
    Permission.read(Role.user(sessionUserId)),
    Permission.update(Role.user(sessionUserId)),
    Permission.delete(Role.user(sessionUserId)),
  ];

  try {
    const document = await database.createDocument(
      config.databaseId,
      config.reminderCollectionId,
      ID.unique(),
      data,
      permissions
    );
    return document as ReminderDocument;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error('Failed to create reminder');
  }
};

export const listReminders = async (
  userId: string
): Promise<ReminderDocument[]> => {
  assertNonEmptyString(userId, 'userId');

  try {
    const result = await database.listDocuments(
      config.databaseId,
      config.reminderCollectionId,
      [Query.equal('userId', userId)]
    );
    return (result.documents as ReminderDocument[]) ?? [];
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    throw new Error('Failed to list reminders');
  }
};

export const getReminder = async (
  id: string,
  sessionUserId: string
): Promise<ReminderDocument> => {
  assertValidStringId(id, 'id');
  assertValidStringId(sessionUserId, 'sessionUserId');

  try {
    const document = await database.getDocument(
      config.databaseId,
      config.reminderCollectionId,
      id
    );
    if ((document as ReminderDocument).userId !== sessionUserId) {
      throw new Error('Reminder not found');
    }
    return document as ReminderDocument;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    if (isDocumentNotFoundError(err)) {
      throw new Error('Reminder not found');
    }
    throw new Error('Failed to load reminder');
  }
};

export const updateReminder = async (
  id: string,
  patch: UpdateReminderPatch,
  sessionUserId: string
): Promise<ReminderDocument> => {
  assertValidStringId(id, 'id');
  assertValidStringId(sessionUserId, 'sessionUserId');

  if (patch.description !== undefined) {
    assertDescription(patch.description);
  }
  if (patch.locationSource !== undefined) {
    assertLocationSource(patch.locationSource);
  }
  if (patch.latitude !== undefined) {
    assertLatitude(patch.latitude);
  }
  if (patch.longitude !== undefined) {
    assertLongitude(patch.longitude);
  }
  if (patch.locationLabel !== undefined) {
    assertLocationLabel(patch.locationLabel);
  }
  if (patch.active !== undefined) {
    assertActive(patch.active);
  }

  try {
    const existing = await database.getDocument(
      config.databaseId,
      config.reminderCollectionId,
      id
    );
    if ((existing as ReminderDocument).userId !== sessionUserId) {
      throw new Error('Reminder not found');
    }

    const data: Record<string, unknown> = {};
    if (patch.description !== undefined) {
      data.description = patch.description.trim();
    }
    if (patch.locationSource !== undefined) {
      data.locationSource = patch.locationSource;
    }
    if (patch.locationLabel !== undefined) {
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

    const document = await database.updateDocument(
      config.databaseId,
      config.reminderCollectionId,
      id,
      data
    );
    return document as ReminderDocument;
  } catch (error: unknown) {
    const err = ensureError(error);
    console.error(err.message);
    if (isDocumentNotFoundError(err)) {
      throw new Error('Reminder not found');
    }
    throw new Error('Failed to update reminder');
  }
};

export const deleteReminder = async (
  id: string,
  sessionUserId: string
): Promise<unknown> => {
  assertValidStringId(id, 'id');
  assertValidStringId(sessionUserId, 'sessionUserId');

  try {
    const existing = await database.getDocument(
      config.databaseId,
      config.reminderCollectionId,
      id
    );
    if ((existing as ReminderDocument).userId !== sessionUserId) {
      throw new Error('Reminder not found');
    }

    const result = await database.deleteDocument(
      config.databaseId,
      config.reminderCollectionId,
      id
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

export const toggleReminderActive = async (
  id: string,
  active: boolean,
  sessionUserId: string
): Promise<ReminderDocument> => {
  return updateReminder(id, { active }, sessionUserId);
};
