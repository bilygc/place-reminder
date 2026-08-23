# Reminders Data Layer (ATO-11)

Single source of truth for the `reminders` Appwrite collection and its
TypeScript data-access layer. The collection schema lives **only in
Appwrite Cloud** (managed via console/MCP) — there is no `appwrite.json`
in this repo. This document is the only in-repo record; keep it in sync
with any console changes (bus-factor risk).

## Collection identity

| Field | Value |
|-------|-------|
| Project | `6757b828001bec8e662a` |
| Database | `67590cf000382b570c08` (`EXPO_PUBLIC_DATABASE_ID`) |
| Collection | `67590d690032f7fc76f6` (`EXPO_PUBLIC_REMINDER_COLLECTION_ID`) |
| Collection name | `reminders` |

No declarative `appwrite.json` is checked in. Schema changes are applied
directly in the Appwrite console (or via MCP) and must be reflected here
manually.

## Schema

| Attribute | Type | Required | Default | Notes |
|-----------|------|----------|---------|-------|
| `userId` | string (255) | yes | — | Owner id; indexed. Never caller-supplied on create — derived from `sessionUserId`. |
| `description` | string (2000) | yes | — | The "Do" field. Trimmed on write; validated non-empty and `≤ 2000` chars. |
| `locationSource` | enum `current` \| `map` | yes | — | How the location was chosen. |
| `locationLabel` | string (255) | no | — | Human-readable "At ..." label. Validated `≤ 255` chars when present. |
| `latitude` | double | yes | — | Validated finite, `-90` to `90`. |
| `longitude` | double | yes | — | Validated finite, `-180` to `180`. |
| `active` | boolean | no | `true` | Whether the reminder is enabled. DAL defaults to `true` when omitted. |

### Indexes

| Index | Type | Attribute |
|-------|------|-----------|
| `idx_userId` | key | `userId` |

### Security

- `documentSecurity: true` — per-document ACLs are enforced.
- Collection-level permissions: `create("users")`, `read("users")`, `update("users")`, `delete("users")` (any authenticated user can attempt each operation; per-document ACLs then restrict to the owner).
- Every document is created with per-document permissions:
  ```
  Permission.read(Role.user(ownerId))
  Permission.update(Role.user(ownerId))
  Permission.delete(Role.user(ownerId))
  ```
  `ownerId` is the `sessionUserId` passed to `createReminder`. No `Permission.create` is set at document level.
- Ownership is enforced in the DAL as well (see below). A foreign or missing document surfaces the same `Reminder not found` error so existence is not leaked.

### Environment

```
EXPO_PUBLIC_DATABASE_ID            # 67590cf000382b570c08
EXPO_PUBLIC_REMINDER_COLLECTION_ID # 67590d690032f7fc76f6
```

Both are required via `requireEnv()` in `lib/appwrite.ts` (`config.databaseId`, `config.reminderCollectionId`). See `.env.example` for placeholders.

## Data-access layer

**Module:** `lib/reminders.ts` + types in `lib/reminders.types.ts`
**DAL-owned Databases instance:** `lib/reminders.ts` constructs its own `Databases` client using `config` values from `lib/appwrite.ts`. For the `reminders` collection, always use the DAL — never call `database.*Document` directly.

### Types

```ts
import type { ReminderDocument, CreateReminderInput, UpdateReminderPatch, LocationSource } from '@/lib/reminders.types';

type LocationSource = 'current' | 'map';

interface ReminderDocument extends Models.Document {
  userId: string;
  description: string;
  locationSource: LocationSource;
  locationLabel?: string;
  latitude: number;
  longitude: number;
  active: boolean;
}

interface CreateReminderInput {
  description: string;
  locationSource: LocationSource;
  locationLabel?: string;
  latitude: number;
  longitude: number;
  active?: boolean;
}

type UpdateReminderPatch = Partial<CreateReminderInput>;
```

`UpdateReminderPatch` cannot carry `userId` — the owner is immutable after creation.

### API reference

#### `createReminder(input, sessionUserId)`

Creates a reminder owned by `sessionUserId`. `userId` is derived from `sessionUserId`, not from `input` (any `userId` on `input` is ignored).

- **Parameters:**
  | Name | Type | Required | Description |
  |------|------|----------|-------------|
  | `input` | `CreateReminderInput` | Yes | `description` is trimmed; `active` defaults to `true`. |
  | `sessionUserId` | `string` | Yes | Authenticated session's user id. Validated non-empty `≤ 64` chars. |

- **Returns:** `Promise<ReminderDocument>`
- **Throws:** `Invalid ...` validation error before any network call, or `Failed to create reminder` on SDK failure (original message is logged via `console.error`).
- **Side effects:** Calls `database.createDocument(config.databaseId, config.reminderCollectionId, ID.unique(), data, permissions)` with per-document ACLs for `sessionUserId`.

```ts
import { createReminder } from '@/lib/reminders';

const doc = await createReminder(
  { description: 'Buy milk', locationSource: 'current', latitude: 40.71, longitude: -74.00 },
  session.userId
);
```

#### `listReminders(userId)`

Lists reminders scoped to `userId`.

- **Parameters:** `userId: string` — non-empty (trim-checked).
- **Returns:** `Promise<ReminderDocument[]>` — empty array when no matches.
- **Throws:** `Invalid userId: ...` before SDK call, or `Failed to list reminders` on failure.
- **SDK call:** `database.listDocuments(..., [Query.equal('userId', userId)])`

#### `getReminder(id, sessionUserId)`

Ownership-verified read. Foreign and missing documents both throw `Reminder not found`.

- **Parameters:** `id: string` (`≤ 64` chars), `sessionUserId: string` (`≤ 64` chars).
- **Returns:** `Promise<ReminderDocument>`
- **Throws:** `Reminder not found` (not-found or not-owned), or `Failed to load reminder` for other SDK failures.

#### `updateReminder(id, patch, sessionUserId)`

Fetch-verify-then-mutate. Only fields present in `patch` are sent; `description` is trimmed when included.

- **Parameters:** `id: string`, `patch: UpdateReminderPatch`, `sessionUserId: string`
- **Returns:** `Promise<ReminderDocument>`
- **Throws:** Validation errors before any SDK call; `Reminder not found` if the document does not exist or is not owned; `Failed to update reminder` otherwise.
- **SDK calls:** `database.getDocument(...)` then `database.updateDocument(..., data)` where `data` contains only the defined patch keys.

#### `deleteReminder(id, sessionUserId)`

Fetch-verify-then-delete.

- **Parameters:** `id: string`, `sessionUserId: string`
- **Returns:** `Promise<unknown>` (Appwrite delete result).
- **Throws:** Same ownership/not-found semantics as above; `Failed to delete reminder` on other failures.

#### `toggleReminderActive(id, active, sessionUserId)`

Thin wrapper over `updateReminder(id, { active }, sessionUserId)`.

- **Parameters:** `id: string`, `active: boolean`, `sessionUserId: string`
- **Returns:** `Promise<ReminderDocument>`

### Conventions

1. **All access to the `reminders` collection MUST go through `lib/reminders.ts`.** Do not call `database.createDocument` / `listDocuments` / `getDocument` / `updateDocument` / `deleteDocument` directly for this collection. `lib/reminders.ts` owns its Databases instance; `lib/appwrite.ts` no longer exports a `database` singleton for reminders use.
2. **Ownership is mandatory.** Every read/update/delete verifies `document.userId === sessionUserId`. `createReminder` derives `userId` from `sessionUserId`.
3. **`patch` cannot carry `userId`.** The type `UpdateReminderPatch` is `Partial<CreateReminderInput>` which has no `userId`.
4. **Client-side validation runs before any network call.** Validation failures throw synchronously (without calling the SDK and without `console.error`).
5. **Error handling:** SDK failures are logged via `console.error(originalMessage)` and rethrown as generic messages (`Failed to create/load/update/delete/list reminder(s)`). Not-found and not-owned are indistinguishable (`Reminder not found`).

### Validation rules

| Field | Rule |
|-------|------|
| `description` | `string`, `trim() !== ''`, `length ≤ 2000` |
| `locationSource` | `current` or `map` |
| `latitude` | finite number, `-90 ≤ x ≤ 90` |
| `longitude` | finite number, `-180 ≤ x ≤ 180` |
| `locationLabel` | when present: `string`, `length ≤ 255` |
| `active` | when present: `boolean` |
| `id` / `sessionUserId` / `userId` | `string`, `trim() !== ''`, `length ≤ 64` |

## Testing

- **Suite:** `lib/__tests__/reminders.test.ts` — covers all six DAL functions: input validation, ownership checks, exact SDK call args (including `ID.unique()` and per-document `Permission`/`Role` values), and error propagation.
- **Baseline:** `scripts/test-count-baseline.txt` is `408` (updated from `324` in ATO-11).
- **Mock:** `__mocks__/react-native-appwrite.js` exposes stable singleton instances (`__database`, `__account`, etc.) and now includes `database.getDocument`, `database.deleteDocument`, `Permission`, and `Role`. Any test that needs the real SDK omits `jest.mock('react-native-appwrite')`.

```bash
npm test   # jest --ci
```

## Known drift

Legacy video-post helpers in `lib/appwrite.ts` — `getAllPosts`, `getLatestPosts`, `getBookmarkedPosts`, `searchPosts`, `getUserPosts`, `bookmarkVideo` — still target `config.reminderCollectionId` but reference attributes (`title`, `creator`, `bookmarkedByUserId`, video/thumbnail fields) that **no longer exist** on the repurposed `reminders` collection. They are dead/broken and must not be used. See `docs/known-issues.md` for the tracking entry and cleanup follow-up.
